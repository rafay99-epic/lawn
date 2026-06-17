/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { createVersionRecord, MAX_VIDEO_STACK_SIZE } from "./videos";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("materializes v1 and appends after the actual latest version", async () => {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const teamId = await ctx.db.insert("teams", {
      name: "Garden",
      slug: "garden",
      ownerClerkId: "user_1",
      plan: "basic",
    });
    await ctx.db.insert("teamMembers", {
      teamId,
      userClerkId: "user_1",
      userEmail: "owner@example.com",
      userName: "Owner",
      role: "admin",
    });
    const projectId = await ctx.db.insert("projects", {
      teamId,
      name: "Campaign",
    });
    const videoId = await ctx.db.insert("videos", {
      projectId,
      uploadedByClerkId: "user_1",
      uploaderName: "Owner",
      title: "First cut",
      description: "Original notes",
      visibility: "public",
      publicId: "public-v1",
      status: "ready",
      workflowStatus: "done",
    });
    return { projectId, videoId };
  });

  const { videoId: v2 } = await t.run((ctx) =>
    createVersionRecord(ctx, {
      sourceVideoId: seeded.videoId,
      uploadedByClerkId: "user_1",
      uploaderName: "Owner",
      publicId: "public-v2",
      fileSize: 200,
      contentType: "video/mp4",
    }),
  );
  await t.run(async (ctx) => {
    await ctx.db.patch(v2, {
      title: "Second cut",
      description: "Latest notes",
      visibility: "private",
      workflowStatus: "done",
    });
  });

  const { videoId: v3 } = await t.run((ctx) =>
    createVersionRecord(ctx, {
      sourceVideoId: seeded.videoId,
      uploadedByClerkId: "user_1",
      uploaderName: "Owner",
      publicId: "public-v3",
      fileSize: 300,
      contentType: "video/quicktime",
    }),
  );

  const documents = await t.run(async (ctx) => ({
    v1: await ctx.db.get(seeded.videoId),
    v2: await ctx.db.get(v2),
    v3: await ctx.db.get(v3),
  }));

  expect(documents.v1).toMatchObject({
    versionStackId: seeded.videoId,
    versionNumber: 1,
    supersededByVideoId: v2,
  });
  expect(documents.v2).toMatchObject({
    versionStackId: seeded.videoId,
    versionNumber: 2,
    supersededByVideoId: v3,
  });
  expect(documents.v3).toMatchObject({
    versionStackId: seeded.videoId,
    versionNumber: 3,
    title: "Second cut",
    description: "Latest notes",
    visibility: "private",
    workflowStatus: "review",
    projectId: seeded.projectId,
  });

  const visible = await t.withIdentity({ subject: "user_1" }).query(api.videos.list, {
    projectId: seeded.projectId,
  });
  expect(visible.map((video) => [video._id, video.versionNumber])).toEqual([[v3, 3]]);
});

test("moves the whole stack and rewires middle and latest deletions", async () => {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const teamId = await ctx.db.insert("teams", {
      name: "Garden",
      slug: "garden",
      ownerClerkId: "user_1",
      plan: "basic",
    });
    await ctx.db.insert("teamMembers", {
      teamId,
      userClerkId: "user_1",
      userEmail: "owner@example.com",
      userName: "Owner",
      role: "admin",
    });
    const sourceProjectId = await ctx.db.insert("projects", {
      teamId,
      name: "Source",
    });
    const destinationProjectId = await ctx.db.insert("projects", {
      teamId,
      name: "Destination",
    });
    const v1 = await ctx.db.insert("videos", {
      projectId: sourceProjectId,
      uploadedByClerkId: "user_1",
      uploaderName: "Owner",
      title: "Cut",
      visibility: "public",
      publicId: "move-v1",
      status: "ready",
      workflowStatus: "review",
    });
    return { sourceProjectId, destinationProjectId, v1 };
  });

  const { videoId: v2 } = await t.run((ctx) =>
    createVersionRecord(ctx, {
      sourceVideoId: seeded.v1,
      uploadedByClerkId: "user_1",
      uploaderName: "Owner",
      publicId: "move-v2",
    }),
  );
  const { videoId: v3 } = await t.run((ctx) =>
    createVersionRecord(ctx, {
      sourceVideoId: seeded.v1,
      uploadedByClerkId: "user_1",
      uploaderName: "Owner",
      publicId: "move-v3",
    }),
  );

  const authed = t.withIdentity({ subject: "user_1" });
  await authed.mutation(api.videos.move, {
    videoId: v2,
    projectId: seeded.destinationProjectId,
  });

  const movedProjects = await t.run(async (ctx) =>
    Promise.all([seeded.v1, v2, v3].map(async (videoId) => (await ctx.db.get(videoId))?.projectId)),
  );
  expect(movedProjects).toEqual([
    seeded.destinationProjectId,
    seeded.destinationProjectId,
    seeded.destinationProjectId,
  ]);

  await authed.mutation(api.videos.remove, { videoId: v2 });
  const afterMiddleDelete = await t.run(async (ctx) => ({
    v1: await ctx.db.get(seeded.v1),
    v2: await ctx.db.get(v2),
    v3: await ctx.db.get(v3),
  }));
  expect(afterMiddleDelete.v2).toBeNull();
  expect(afterMiddleDelete.v1?.supersededByVideoId).toBe(v3);
  expect(afterMiddleDelete.v3?.supersededByVideoId).toBeUndefined();

  const latestDelete = await authed.mutation(api.videos.remove, { videoId: v3 });
  expect(latestDelete.replacementVideoId).toBe(seeded.v1);

  const promoted = await t.run((ctx) => ctx.db.get(seeded.v1));
  expect(promoted?.supersededByVideoId).toBeUndefined();

  const visible = await authed.query(api.videos.list, {
    projectId: seeded.destinationProjectId,
  });
  expect(visible.map((video) => [video._id, video.versionNumber])).toEqual([[seeded.v1, 1]]);
});

test("deleting the first version preserves the remaining stack", async () => {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const teamId = await ctx.db.insert("teams", {
      name: "Garden",
      slug: "garden",
      ownerClerkId: "user_1",
      plan: "basic",
    });
    await ctx.db.insert("teamMembers", {
      teamId,
      userClerkId: "user_1",
      userEmail: "owner@example.com",
      userName: "Owner",
      role: "admin",
    });
    const projectId = await ctx.db.insert("projects", {
      teamId,
      name: "Campaign",
    });
    const v1 = await ctx.db.insert("videos", {
      projectId,
      uploadedByClerkId: "user_1",
      uploaderName: "Owner",
      title: "Cut",
      visibility: "public",
      publicId: "first-v1",
      status: "ready",
      workflowStatus: "review",
    });
    return { projectId, v1 };
  });

  const { videoId: v2 } = await t.run((ctx) =>
    createVersionRecord(ctx, {
      sourceVideoId: seeded.v1,
      uploadedByClerkId: "user_1",
      uploaderName: "Owner",
      publicId: "first-v2",
    }),
  );
  const { videoId: v3 } = await t.run((ctx) =>
    createVersionRecord(ctx, {
      sourceVideoId: v2,
      uploadedByClerkId: "user_1",
      uploaderName: "Owner",
      publicId: "first-v3",
    }),
  );

  const authed = t.withIdentity({ subject: "user_1" });
  const result = await authed.mutation(api.videos.remove, { videoId: seeded.v1 });
  expect(result.replacementVideoId).toBe(v2);

  const versions = await authed.query(api.videos.listVersions, { videoId: v2 });
  expect(versions.map((version) => [version._id, version.versionNumber])).toEqual([
    [v3, 3],
    [v2, 2],
  ]);

  const visible = await authed.query(api.videos.list, { projectId: seeded.projectId });
  expect(visible.map((video) => video._id)).toEqual([v3]);
});

test("public version paths enforce authentication and member authorization", async () => {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const teamId = await ctx.db.insert("teams", {
      name: "Garden",
      slug: "garden",
      ownerClerkId: "owner",
      plan: "basic",
    });
    const projectId = await ctx.db.insert("projects", {
      teamId,
      name: "Campaign",
    });
    const videoId = await ctx.db.insert("videos", {
      projectId,
      uploadedByClerkId: "owner",
      uploaderName: "Owner",
      title: "Cut",
      visibility: "public",
      publicId: "auth-v1",
      status: "ready",
      workflowStatus: "review",
    });
    await ctx.db.insert("teamMembers", {
      teamId,
      userClerkId: "viewer",
      userEmail: "viewer@example.com",
      userName: "Viewer",
      role: "viewer",
    });
    await ctx.db.insert("teamMembers", {
      teamId,
      userClerkId: "member",
      userEmail: "member@example.com",
      userName: "Member",
      role: "member",
    });
    return { videoId };
  });

  await expect(t.query(api.videos.listVersions, { videoId: seeded.videoId })).rejects.toThrow(
    "Not authenticated",
  );
  await expect(
    t.withIdentity({ subject: "viewer" }).mutation(api.videos.createVersion, {
      sourceVideoId: seeded.videoId,
      fileSize: 1,
      contentType: "video/mp4",
    }),
  ).rejects.toThrow("Requires member role or higher");

  const versions = await t
    .withIdentity({ subject: "member" })
    .query(api.videos.listVersions, { videoId: seeded.videoId });
  expect(versions).toHaveLength(1);
});

test("abandoned version uploads atomically restore the previous head", async () => {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const teamId = await ctx.db.insert("teams", {
      name: "Garden",
      slug: "garden",
      ownerClerkId: "owner",
      plan: "basic",
    });
    await ctx.db.insert("teamMembers", {
      teamId,
      userClerkId: "owner",
      userEmail: "owner@example.com",
      userName: "Owner",
      role: "owner",
    });
    const projectId = await ctx.db.insert("projects", {
      teamId,
      name: "Campaign",
    });
    const v1 = await ctx.db.insert("videos", {
      projectId,
      uploadedByClerkId: "owner",
      uploaderName: "Owner",
      title: "Cut",
      visibility: "public",
      publicId: "rollback-v1",
      status: "ready",
      workflowStatus: "done",
    });
    return { projectId, v1 };
  });
  const { videoId: v2 } = await t.run((ctx) =>
    createVersionRecord(ctx, {
      sourceVideoId: seeded.v1,
      uploadedByClerkId: "owner",
      uploaderName: "Owner",
      publicId: "rollback-v2",
    }),
  );

  const result = await t.mutation(internal.videos.finalizeAbandonedUpload, {
    videoId: v2,
    uploadError: "Upload cancelled.",
  });
  expect(result.removedVersion).toBe(true);

  const state = await t.run(async (ctx) => ({
    v1: await ctx.db.get(seeded.v1),
    v2: await ctx.db.get(v2),
  }));
  expect(state.v2).toBeNull();
  expect(state.v1?.supersededByVideoId).toBeUndefined();

  const visible = await t
    .withIdentity({ subject: "owner" })
    .query(api.videos.list, { projectId: seeded.projectId });
  expect(visible.map((video) => video._id)).toEqual([seeded.v1]);
});

test("stale provisional versions roll back even before storage is initiated", async () => {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const teamId = await ctx.db.insert("teams", {
      name: "Garden",
      slug: "garden",
      ownerClerkId: "owner",
      plan: "basic",
    });
    const projectId = await ctx.db.insert("projects", {
      teamId,
      name: "Campaign",
    });
    const v1 = await ctx.db.insert("videos", {
      projectId,
      uploadedByClerkId: "owner",
      uploaderName: "Owner",
      title: "Cut",
      visibility: "public",
      publicId: "stale-v1",
      status: "ready",
      workflowStatus: "review",
    });
    return { v1 };
  });
  const { videoId: v2 } = await t.run((ctx) =>
    createVersionRecord(ctx, {
      sourceVideoId: seeded.v1,
      uploadedByClerkId: "owner",
      uploaderName: "Owner",
      publicId: "stale-v2",
    }),
  );

  const claimed = await t.mutation(internal.videos.claimStaleUpload, {
    videoId: v2,
    cutoff: Date.now() + 1000,
  });
  expect(claimed).toMatchObject({
    storage: { kind: "none" },
    removedVersion: true,
  });

  const state = await t.run(async (ctx) => ({
    v1: await ctx.db.get(seeded.v1),
    v2: await ctx.db.get(v2),
  }));
  expect(state.v2).toBeNull();
  expect(state.v1?.supersededByVideoId).toBeUndefined();
});

test("concurrent version creation serializes into one ordered chain", async () => {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const teamId = await ctx.db.insert("teams", {
      name: "Garden",
      slug: "garden",
      ownerClerkId: "owner",
      plan: "basic",
    });
    await ctx.db.insert("teamMembers", {
      teamId,
      userClerkId: "owner",
      userEmail: "owner@example.com",
      userName: "Owner",
      role: "owner",
    });
    const projectId = await ctx.db.insert("projects", {
      teamId,
      name: "Campaign",
    });
    const v1 = await ctx.db.insert("videos", {
      projectId,
      uploadedByClerkId: "owner",
      uploaderName: "Owner",
      title: "Cut",
      visibility: "public",
      publicId: "concurrent-v1",
      status: "ready",
      workflowStatus: "review",
    });
    return { v1 };
  });

  await Promise.all([
    t.run((ctx) =>
      createVersionRecord(ctx, {
        sourceVideoId: seeded.v1,
        uploadedByClerkId: "owner",
        uploaderName: "Owner",
        publicId: "concurrent-a",
      }),
    ),
    t.run((ctx) =>
      createVersionRecord(ctx, {
        sourceVideoId: seeded.v1,
        uploadedByClerkId: "owner",
        uploaderName: "Owner",
        publicId: "concurrent-b",
      }),
    ),
  ]);

  const versions = await t
    .withIdentity({ subject: "owner" })
    .query(api.videos.listVersions, { videoId: seeded.v1 });
  expect(versions.map((version) => version.versionNumber)).toEqual([3, 2, 1]);

  const chain = await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("videos")
      .withIndex("by_version_stack_id_and_version_number", (q) => q.eq("versionStackId", seeded.v1))
      .order("asc")
      .take(4);
    return rows.map((row) => [row.versionNumber, row.supersededByVideoId ?? null]);
  });
  expect(chain[0]?.[1]).toBeTruthy();
  expect(chain[1]?.[1]).toBeTruthy();
  expect(chain[2]?.[1]).toBeNull();
});

test("version stack operations enforce the explicit stack limit", async () => {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const teamId = await ctx.db.insert("teams", {
      name: "Garden",
      slug: "garden",
      ownerClerkId: "owner",
      plan: "basic",
    });
    await ctx.db.insert("teamMembers", {
      teamId,
      userClerkId: "owner",
      userEmail: "owner@example.com",
      userName: "Owner",
      role: "owner",
    });
    const projectId = await ctx.db.insert("projects", {
      teamId,
      name: "Campaign",
    });
    const v1 = await ctx.db.insert("videos", {
      projectId,
      uploadedByClerkId: "owner",
      uploaderName: "Owner",
      title: "Cut",
      visibility: "public",
      publicId: "limit-v1",
      status: "ready",
      workflowStatus: "review",
      versionNumber: 1,
    });
    await ctx.db.patch(v1, { versionStackId: v1 });

    let previousId = v1;
    for (let versionNumber = 2; versionNumber <= MAX_VIDEO_STACK_SIZE; versionNumber += 1) {
      const videoId = await ctx.db.insert("videos", {
        projectId,
        uploadedByClerkId: "owner",
        uploaderName: "Owner",
        title: "Cut",
        visibility: "public",
        publicId: `limit-v${versionNumber}`,
        status: "ready",
        workflowStatus: "review",
        versionStackId: v1,
        versionNumber,
      });
      await ctx.db.patch(previousId, { supersededByVideoId: videoId });
      previousId = videoId;
    }

    return { projectId, v1, latestId: previousId };
  });

  const versions = await t
    .withIdentity({ subject: "owner" })
    .query(api.videos.listVersions, { videoId: seeded.v1 });
  expect(versions).toHaveLength(MAX_VIDEO_STACK_SIZE);

  await expect(
    t.run((ctx) =>
      createVersionRecord(ctx, {
        sourceVideoId: seeded.v1,
        uploadedByClerkId: "owner",
        uploaderName: "Owner",
        publicId: "limit-overflow",
      }),
    ),
  ).rejects.toThrow(`at most ${MAX_VIDEO_STACK_SIZE} versions`);

  const overflowId = await t.run(async (ctx) => {
    const videoId = await ctx.db.insert("videos", {
      projectId: seeded.projectId,
      uploadedByClerkId: "owner",
      uploaderName: "Owner",
      title: "Cut",
      visibility: "public",
      publicId: "limit-corrupt",
      status: "ready",
      workflowStatus: "review",
      versionStackId: seeded.v1,
      versionNumber: MAX_VIDEO_STACK_SIZE + 1,
    });
    await ctx.db.patch(seeded.latestId, { supersededByVideoId: videoId });
    return videoId;
  });

  const authed = t.withIdentity({ subject: "owner" });
  await expect(authed.query(api.videos.listVersions, { videoId: overflowId })).rejects.toThrow(
    `at most ${MAX_VIDEO_STACK_SIZE} versions`,
  );
  await expect(
    authed.mutation(api.videos.move, {
      videoId: overflowId,
      projectId: seeded.projectId,
    }),
  ).rejects.toThrow(`at most ${MAX_VIDEO_STACK_SIZE} versions`);
  await expect(authed.mutation(api.videos.remove, { videoId: overflowId })).rejects.toThrow(
    `at most ${MAX_VIDEO_STACK_SIZE} versions`,
  );
});
