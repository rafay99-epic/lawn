import type { Id } from "@convex/_generated/dataModel";

/**
 * Discriminated payload attached to an internal drag via `getInitialData`.
 *
 * The data is custom (never the native `"Files"` type), so the window-level
 * OS-file-drop listeners in the dashboard layout (gated by `dragEventHasFiles`)
 * ignore it and the "Drop videos to upload" overlay stays hidden during a move.
 */
export type DragPayload =
  | {
      kind: "video";
      videoId: Id<"videos">;
      /** Current parent folder of the video (its `projectId`). */
      sourceProjectId: Id<"projects">;
      teamId: Id<"teams">;
      title: string;
    }
  | {
      kind: "folder";
      projectId: Id<"projects">;
      /** Current parent folder, or undefined when the folder is at top level. */
      sourceParentId?: Id<"projects">;
      teamId: Id<"teams">;
      name: string;
    };

const DRAG_KIND_KEY = "__lawnDnd";

/** Stamp + return a payload as the plain record pragmatic-dnd expects. */
export function makeDragData(payload: DragPayload): Record<string, unknown> {
  return { [DRAG_KIND_KEY]: true, ...payload };
}

/** Narrow an unknown drop `source.data` record back to our `DragPayload`. */
export function readDragPayload(
  data: Record<string | symbol, unknown>,
): DragPayload | null {
  if (!data || data[DRAG_KIND_KEY] !== true) return null;
  if (data.kind === "video" || data.kind === "folder") {
    return data as unknown as DragPayload;
  }
  return null;
}
