/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { createVersionRecord } from "./videos";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

async function seedPublicStack() {
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
      title: "First cut",
      visibility: "public",
      publicId: "watch-v1",
      status: "ready",
      muxPlaybackId: "playback-v1",
      workflowStatus: "review",
    });
    return { teamId, projectId, v1 };
  });

  // v2 becomes the stack head. insertVersionRecord starts it at status
  // "uploading" and inherits the head's "public" visibility.
  const { videoId: v2 } = await t.run((ctx) =>
    createVersionRecord(ctx, {
      sourceVideoId: seeded.v1,
      uploadedByClerkId: "user_1",
      uploaderName: "Owner",
      publicId: "watch-v2",
    }),
  );

  return { t, ...seeded, v2 };
}

test("serves the latest ready version when the shared head is still processing", async () => {
  const { t, v1, v2 } = await seedPublicStack();

  // The head (v2) is still processing, so both the head's and the older
  // version's public links should resolve to the ready v1 instead of failing.
  for (const publicId of ["watch-v1", "watch-v2"]) {
    const result = await t.query(api.videos.getByPublicId, { publicId });
    expect(result?.video?._id).toBe(v1);
  }

  // Sanity: v2 really is the not-ready head.
  const head = await t.run((ctx) => ctx.db.get(v2 as Id<"videos">));
  expect(head?.status).toBe("uploading");
});

test("serves the newest version once it becomes ready", async () => {
  const { t, v2 } = await seedPublicStack();

  await t.run(async (ctx) => {
    await ctx.db.patch(v2 as Id<"videos">, {
      status: "ready",
      muxPlaybackId: "playback-v2",
    });
  });

  for (const publicId of ["watch-v1", "watch-v2"]) {
    const result = await t.query(api.videos.getByPublicId, { publicId });
    expect(result?.video?._id).toBe(v2);
  }
});

test("setVisibility toggles every version in the stack and gates the public URL", async () => {
  const { t, v1, v2 } = await seedPublicStack();

  await t.run(async (ctx) => {
    await ctx.db.patch(v2 as Id<"videos">, {
      status: "ready",
      muxPlaybackId: "playback-v2",
    });
  });

  await t
    .withIdentity({ subject: "user_1" })
    .mutation(api.videos.setVisibility, { videoId: v2 as Id<"videos">, visibility: "private" });

  const afterPrivate = await t.run(async (ctx) => ({
    v1: await ctx.db.get(v1 as Id<"videos">),
    v2: await ctx.db.get(v2 as Id<"videos">),
  }));
  expect(afterPrivate.v1?.visibility).toBe("private");
  expect(afterPrivate.v2?.visibility).toBe("private");

  // Private disables the public watch link for every version in the stack.
  for (const publicId of ["watch-v1", "watch-v2"]) {
    const result = await t.query(api.videos.getByPublicId, { publicId });
    expect(result).toBeNull();
  }

  await t
    .withIdentity({ subject: "user_1" })
    .mutation(api.videos.setVisibility, { videoId: v1 as Id<"videos">, visibility: "public" });

  const afterPublic = await t.run(async (ctx) => ({
    v1: await ctx.db.get(v1 as Id<"videos">),
    v2: await ctx.db.get(v2 as Id<"videos">),
  }));
  expect(afterPublic.v1?.visibility).toBe("public");
  expect(afterPublic.v2?.visibility).toBe("public");
});

test("reports processing when a public video has no ready version yet", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const teamId = await ctx.db.insert("teams", {
      name: "Garden",
      slug: "garden",
      ownerClerkId: "user_1",
      plan: "basic",
    });
    const projectId = await ctx.db.insert("projects", { teamId, name: "Campaign" });
    await ctx.db.insert("videos", {
      projectId,
      uploadedByClerkId: "user_1",
      uploaderName: "Owner",
      title: "Fresh upload",
      visibility: "public",
      publicId: "processing-v1",
      status: "processing",
      workflowStatus: "review",
    });
  });

  const result = await t.query(api.videos.getByPublicId, { publicId: "processing-v1" });
  expect(result?.processing).toBe(true);
  expect(result?.video).toBeNull();
  expect(result?.title).toBe("Fresh upload");
});

test("is unavailable when the only public version failed", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const teamId = await ctx.db.insert("teams", {
      name: "Garden",
      slug: "garden",
      ownerClerkId: "user_1",
      plan: "basic",
    });
    const projectId = await ctx.db.insert("projects", { teamId, name: "Campaign" });
    await ctx.db.insert("videos", {
      projectId,
      uploadedByClerkId: "user_1",
      uploaderName: "Owner",
      title: "Broken upload",
      visibility: "public",
      publicId: "failed-v1",
      status: "failed",
      workflowStatus: "review",
    });
  });

  const result = await t.query(api.videos.getByPublicId, { publicId: "failed-v1" });
  expect(result).toBeNull();
});

test("returns null for an unknown public id", async () => {
  const { t } = await seedPublicStack();
  const result = await t.query(api.videos.getByPublicId, { publicId: "does-not-exist" });
  expect(result).toBeNull();
});
