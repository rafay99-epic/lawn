import { v } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
  MutationCtx,
  QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { getUser, requireTeamAccess, requireProjectAccess } from "./auth";
import { assertTeamHasActiveSubscription } from "./billingHelpers";
import { deleteVideoAndDependents } from "./videos";

// Maximum folder nesting. depth(root) == 0; a folder may be created/moved under
// a parent only when parentDepth + 1 <= MAX_FOLDER_DEPTH, so the deepest folder
// has depth MAX_FOLDER_DEPTH (MAX_FOLDER_DEPTH + 1 levels including the root).
export const MAX_FOLDER_DEPTH = 8;

// Upper bound for ancestor walks so corrupt data (a pre-existing cycle) can never
// loop forever. A valid chain is at most MAX_FOLDER_DEPTH + 1 nodes long.
const ANCESTOR_WALK_LIMIT = MAX_FOLDER_DEPTH + 2;

// Documents deleted per subtree-delete batch. Kept well under Convex's
// per-transaction limits (~32k scanned / ~16k written); larger subtrees drain
// across multiple scheduled batches.
const DELETE_BATCH_DOCS = 1000;

// --- helpers ---------------------------------------------------------------

/** Ancestors of `projectId`, nearest parent first (excludes the node itself). */
async function collectAncestors(
  ctx: QueryCtx | MutationCtx,
  project: Doc<"projects">,
): Promise<Doc<"projects">[]> {
  const ancestors: Doc<"projects">[] = [];
  let current = project;
  let steps = 0;
  while (current.parentId && steps < ANCESTOR_WALK_LIMIT) {
    const parent = await ctx.db.get(current.parentId);
    if (!parent) break; // missing ancestor — return the partial chain
    ancestors.push(parent);
    current = parent;
    steps++;
  }
  return ancestors;
}

/** Full "Parent / Child / Leaf" path for a folder, built from an in-memory map
 * of the team's folders (no extra DB reads). */
function buildFolderPath(
  byId: Map<Id<"projects">, Doc<"projects">>,
  project: Doc<"projects">,
): string {
  const parts = [project.name];
  let current = project;
  let steps = 0;
  while (current.parentId && steps < ANCESTOR_WALK_LIMIT) {
    const parent = byId.get(current.parentId);
    if (!parent) break;
    parts.push(parent.name);
    current = parent;
    steps++;
  }
  return parts.reverse().join(" / ");
}

/** Number of videos and direct child folders for a folder (for card badges). */
async function folderCounts(
  ctx: QueryCtx,
  project: Doc<"projects">,
): Promise<{ videoCount: number; subfolderCount: number }> {
  const videos = await ctx.db
    .query("videos")
    .withIndex("by_project", (q) => q.eq("projectId", project._id))
    .collect();
  const subfolders = await ctx.db
    .query("projects")
    .withIndex("by_team_and_parent", (q) =>
      q.eq("teamId", project.teamId).eq("parentId", project._id),
    )
    .collect();
  return { videoCount: videos.length, subfolderCount: subfolders.length };
}

// --- mutations / queries ---------------------------------------------------

export const create = mutation({
  args: {
    teamId: v.id("teams"),
    name: v.string(),
    description: v.optional(v.string()),
    parentId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    await requireTeamAccess(ctx, args.teamId, "member");
    await assertTeamHasActiveSubscription(ctx, args.teamId);

    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent || parent.teamId !== args.teamId) {
        throw new Error("Parent folder not found");
      }
      const parentDepth = (await collectAncestors(ctx, parent)).length;
      if (parentDepth + 1 > MAX_FOLDER_DEPTH) {
        throw new Error(
          `Folders can only be nested ${MAX_FOLDER_DEPTH} levels deep`,
        );
      }
    }

    return await ctx.db.insert("projects", {
      teamId: args.teamId,
      name: args.name,
      description: args.description,
      parentId: args.parentId,
    });
  },
});

/**
 * Lists one level of folders: the children of `parentId`, or — when `parentId`
 * is omitted — the team's root folders. Each result carries direct video and
 * subfolder counts.
 */
export const list = query({
  args: {
    teamId: v.id("teams"),
    parentId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    await requireTeamAccess(ctx, args.teamId);

    const projects = await ctx.db
      .query("projects")
      .withIndex("by_team_and_parent", (q) =>
        q.eq("teamId", args.teamId).eq("parentId", args.parentId),
      )
      .collect();

    return await Promise.all(
      projects.map(async (project) => ({
        ...project,
        ...(await folderCounts(ctx, project)),
      })),
    );
  },
});

/**
 * Child folders of a folder, each with direct video and subfolder counts. Keyed
 * by projectId (the team is derived from the project) so it slots into the
 * project route's prewarmed essential queries.
 */
export const listChildren = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const { project } = await requireProjectAccess(ctx, args.projectId);

    const children = await ctx.db
      .query("projects")
      .withIndex("by_team_and_parent", (q) =>
        q.eq("teamId", project.teamId).eq("parentId", project._id),
      )
      .collect();

    return await Promise.all(
      children.map(async (child) => ({
        ...child,
        ...(await folderCounts(ctx, child)),
      })),
    );
  },
});

/**
 * All folders in a team with their full display paths, for the "move folder"
 * picker. Returns `parentId` so the client can grey out the folder being moved
 * and its descendants; the `move` mutation is the source of truth for legality.
 */
export const listForMove = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    await requireTeamAccess(ctx, args.teamId);

    const projects = await ctx.db
      .query("projects")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();

    const byId = new Map(projects.map((project) => [project._id, project]));

    return projects
      .map((project) => ({
        _id: project._id,
        name: project.name,
        parentId: project.parentId,
        path: buildFolderPath(byId, project),
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
  },
});

/**
 * Root-to-leaf chain of {_id, name} for the given folder, used to render
 * breadcrumbs. Walks the parent chain in JS (Convex has no recursive query) and
 * tolerates a missing ancestor by returning the partial chain.
 */
export const breadcrumb = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const { project } = await requireProjectAccess(ctx, args.projectId);
    const ancestors = await collectAncestors(ctx, project);
    return [project, ...ancestors]
      .reverse()
      .map((folder) => ({ _id: folder._id, name: folder.name }));
  },
});

export const listUploadTargets = query({
  args: {
    teamSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    if (!user) return [];

    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userClerkId", user.subject))
      .collect();

    const uploadableMemberships = memberships.filter(
      (membership) => membership.role !== "viewer",
    );

    const targets = await Promise.all(
      uploadableMemberships.map(async (membership) => {
        const team = await ctx.db.get(membership.teamId);
        if (!team) return [];
        if (args.teamSlug && team.slug !== args.teamSlug) return [];

        const projects = await ctx.db
          .query("projects")
          .withIndex("by_team", (q) => q.eq("teamId", team._id))
          .collect();

        // Build full folder paths ("Parent / Child / Leaf") so nested folders
        // with the same leaf name are distinguishable in the picker.
        const byId = new Map(projects.map((project) => [project._id, project]));

        return projects.map((project) => ({
          projectId: project._id,
          projectName: project.name,
          projectPath: buildFolderPath(byId, project),
          teamId: team._id,
          teamName: team.name,
          teamSlug: team.slug,
          role: membership.role,
        }));
      }),
    );

    return targets
      .flat()
      .sort((a, b) =>
        a.teamName.localeCompare(b.teamName) ||
        a.projectPath.localeCompare(b.projectPath),
      );
  },
});

export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const { project, membership } = await requireProjectAccess(ctx, args.projectId);
    return { ...project, role: membership.role };
  },
});

export const update = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId, "member");

    const updates: Partial<{ name: string; description: string }> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;

    await ctx.db.patch(args.projectId, updates);
  },
});

/**
 * Moves a folder under a new parent, or to the top level when `newParentId` is
 * omitted. Rejects moves that would create a cycle (moving a folder into its own
 * descendant) or cross teams.
 *
 * Cycle safety under concurrency relies on Convex's optimistic concurrency: the
 * ancestor walk reads (`ctx.db.get`) the parent pointer of every node on the
 * destination's chain, so a racing move that re-parents any of them forces one
 * of the transactions to retry. Do not "optimize" the walk to skip those reads.
 */
export const move = mutation({
  args: {
    projectId: v.id("projects"),
    newParentId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const { project } = await requireProjectAccess(ctx, args.projectId, "member");

    if (args.newParentId) {
      if (args.newParentId === args.projectId) {
        throw new Error("A folder can't be moved into itself");
      }
      const { project: newParent } = await requireProjectAccess(
        ctx,
        args.newParentId,
        "member",
      );
      if (newParent.teamId !== project.teamId) {
        throw new Error("Can't move a folder to a different team");
      }
      // Keep the moved folder itself within the depth limit (cheap O(depth)
      // walk, same as create). We deliberately do NOT also validate the moved
      // subtree's height: that is an unbounded read that could exceed Convex's
      // per-transaction index-range limit, and every descendant was created
      // under this same limit, so the tree stays shallow in practice.
      const newParentDepth = (await collectAncestors(ctx, newParent)).length;
      if (newParentDepth + 1 > MAX_FOLDER_DEPTH) {
        throw new Error(
          `Folders can only be nested ${MAX_FOLDER_DEPTH} levels deep`,
        );
      }
      // Reject moving into one of the folder's own descendants.
      let current: Doc<"projects"> | null = newParent;
      let steps = 0;
      while (current && steps <= ANCESTOR_WALK_LIMIT) {
        if (current._id === args.projectId) {
          throw new Error("Can't move a folder into its own subfolder");
        }
        if (!current.parentId) break;
        current = await ctx.db.get(current.parentId);
        steps++;
      }
    }

    if (project.parentId === args.newParentId) return; // no-op
    await ctx.db.patch(args.projectId, { parentId: args.newParentId });
  },
});

/**
 * Deletes a single batch of the subtree rooted at `rootProjectId`: removes up to
 * DELETE_BATCH_DOCS documents' worth of videos (and their dependents) anywhere
 * in the subtree, and once no videos remain deletes every folder leaf-first.
 * Returns `{ done }` so the caller can schedule another batch for large trees.
 */
async function runSubtreeDeleteBatch(
  ctx: MutationCtx,
  teamId: Id<"teams">,
  rootProjectId: Id<"projects">,
): Promise<{ done: boolean }> {
  // Collect the subtree folder ids top-down via BFS over by_team_and_parent.
  const folderIds: Id<"projects">[] = [];
  const root = await ctx.db.get(rootProjectId);
  if (!root) return { done: true }; // already gone
  folderIds.push(rootProjectId);
  const queue: Id<"projects">[] = [rootProjectId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = await ctx.db
      .query("projects")
      .withIndex("by_team_and_parent", (q) =>
        q.eq("teamId", teamId).eq("parentId", current),
      )
      .collect();
    for (const child of children) {
      folderIds.push(child._id);
      queue.push(child._id);
    }
  }

  // Phase 1: delete videos (with dependents) across the subtree, up to budget.
  let budget = DELETE_BATCH_DOCS;
  for (const folderId of folderIds) {
    if (budget <= 0) return { done: false };
    const videos = await ctx.db
      .query("videos")
      .withIndex("by_project", (q) => q.eq("projectId", folderId))
      .take(budget);
    for (const video of videos) {
      budget -= await deleteVideoAndDependents(ctx, video._id);
      if (budget <= 0) return { done: false };
    }
  }

  // Phase 2: all videos gone — delete folders leaf-first (reverse BFS order).
  // Budgeted too, so a very wide subtree can't exceed the write limit; the root
  // sorts last, so it is removed only on the final batch.
  for (const folderId of folderIds.reverse()) {
    if (budget <= 0) return { done: false };
    await ctx.db.delete(folderId);
    budget--;
  }
  return { done: true };
}

export const remove = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const { project } = await requireProjectAccess(ctx, args.projectId, "admin");

    const result = await runSubtreeDeleteBatch(ctx, project.teamId, args.projectId);
    if (!result.done) {
      await ctx.scheduler.runAfter(0, internal.projects.continueSubtreeDelete, {
        teamId: project.teamId,
        rootProjectId: args.projectId,
      });
    }
  },
});

export const continueSubtreeDelete = internalMutation({
  args: {
    teamId: v.id("teams"),
    rootProjectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const result = await runSubtreeDeleteBatch(
      ctx,
      args.teamId,
      args.rootProjectId,
    );
    if (!result.done) {
      await ctx.scheduler.runAfter(0, internal.projects.continueSubtreeDelete, args);
    }
  },
});
