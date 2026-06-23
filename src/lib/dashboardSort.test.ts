import assert from "node:assert/strict";
import test from "node:test";
import { sortDashboardItems } from "./dashboardSort";

const items = [
  { _id: "c", name: "Zulu" },
  { _id: "b", name: "alpha", lastUploadedAt: 20 },
  { _id: "a", name: "Beta", lastUploadedAt: 20 },
];

test("sorts by newest upload with deterministic alphabetical ties and empty folders last", () => {
  assert.deepEqual(
    sortDashboardItems(items, "last-uploaded").map((item) => item._id),
    ["b", "a", "c"],
  );
});

test("sorts multiple empty folders alphabetically with a stable ID tie-breaker", () => {
  const emptyFolders = [
    { _id: "z", name: "Zulu" },
    { _id: "b", name: "alpha" },
    { _id: "a", name: "Alpha" },
  ];

  assert.deepEqual(
    sortDashboardItems(emptyFolders, "last-uploaded").map((item) => item._id),
    ["a", "b", "z"],
  );
});

test("sorts alphabetically without mutating the source", () => {
  assert.deepEqual(
    sortDashboardItems(items, "alphabetical").map((item) => item._id),
    ["b", "a", "c"],
  );
  assert.equal(items[0].name, "Zulu");
});
