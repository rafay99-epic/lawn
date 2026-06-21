import assert from "node:assert/strict";
import test from "node:test";
import { formatProjectMeta } from "./ProjectCard";

test("formats exact project counts", () => {
  assert.equal(formatProjectMeta(2, 1), "1 folder · 2 videos");
});

test("marks capped project counts as lower bounds", () => {
  assert.equal(formatProjectMeta(100, 100, true, true), "100+ folders · 100+ videos");
});
