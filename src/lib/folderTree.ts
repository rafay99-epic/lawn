import type { Id } from "@convex/_generated/dataModel";

/** Minimal folder shape needed to compute descendant relationships. */
export type FolderNode = {
  _id: Id<"projects">;
  parentId?: Id<"projects">;
};

/**
 * Returns the set containing `rootId` and every folder nested beneath it,
 * computed via BFS over the team's flat folder list. Used to grey out / reject
 * illegal "move folder" destinations (a folder can't be moved into itself or any
 * of its own descendants). The server `projects.move` mutation remains the
 * source of truth; this is a client-side affordance.
 */
export function collectDescendantIds(
  rootId: Id<"projects">,
  folders: readonly FolderNode[],
): Set<Id<"projects">> {
  const descendants = new Set<Id<"projects">>();
  descendants.add(rootId);

  const childrenByParent = new Map<Id<"projects">, Id<"projects">[]>();
  for (const folder of folders) {
    if (!folder.parentId) continue;
    const siblings = childrenByParent.get(folder.parentId) ?? [];
    siblings.push(folder._id);
    childrenByParent.set(folder.parentId, siblings);
  }

  const queue: Id<"projects">[] = [rootId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of childrenByParent.get(current) ?? []) {
      if (!descendants.has(child)) {
        descendants.add(child);
        queue.push(child);
      }
    }
  }

  return descendants;
}
