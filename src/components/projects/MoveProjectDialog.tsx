import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Home } from "lucide-react";

type MoveProjectDialogProps = {
  teamId: Id<"teams">;
  project: { _id: Id<"projects">; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MoveProjectDialog({
  teamId,
  project,
  open,
  onOpenChange,
}: MoveProjectDialogProps) {
  const folders = useQuery(
    api.projects.listForMove,
    open ? { teamId } : "skip",
  );
  const move = useMutation(api.projects.move);
  const [isMoving, setIsMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clear a stale error when the dialog is reopened for another folder.
  useEffect(() => {
    if (open) setError(null);
  }, [open, project?._id]);

  // The folder being moved and all of its descendants are invalid destinations.
  const excludedIds = useMemo(() => {
    const excluded = new Set<Id<"projects">>();
    if (!project || !folders) return excluded;
    excluded.add(project._id);
    const childrenByParent = new Map<Id<"projects">, Id<"projects">[]>();
    for (const folder of folders) {
      if (!folder.parentId) continue;
      const siblings = childrenByParent.get(folder.parentId) ?? [];
      siblings.push(folder._id);
      childrenByParent.set(folder.parentId, siblings);
    }
    const queue = [project._id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const child of childrenByParent.get(current) ?? []) {
        if (!excluded.has(child)) {
          excluded.add(child);
          queue.push(child);
        }
      }
    }
    return excluded;
  }, [folders, project]);

  const destinations = useMemo(
    () => (folders ?? []).filter((folder) => !excludedIds.has(folder._id)),
    [folders, excludedIds],
  );

  const handleMove = async (newParentId?: Id<"projects">) => {
    if (!project) return;
    setIsMoving(true);
    setError(null);
    try {
      await move({ projectId: project._id, newParentId });
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to move folder",
      );
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move {project ? `"${project.name}"` : "folder"}</DialogTitle>
          <DialogDescription>
            Choose where this folder and everything inside it should live.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p className="border-2 border-[#dc2626] bg-[#fef2f2] px-3 py-2 text-sm font-bold text-[#dc2626]">
            {error}
          </p>
        )}

        {folders === undefined ? (
          <p className="text-sm text-[#888]">Loading folders...</p>
        ) : (
          <div className="max-h-80 overflow-y-auto border-2 border-[#1a1a1a] divide-y-2 divide-[#1a1a1a]">
            <button
              type="button"
              disabled={isMoving}
              className={cn(
                "flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-[#e8e8e0] transition-colors disabled:opacity-50",
              )}
              onClick={() => handleMove(undefined)}
            >
              <Home className="h-4 w-4 text-[#888]" />
              <span className="font-bold text-[#1a1a1a]">Top level</span>
            </button>
            {destinations.map((folder) => (
              <button
                key={folder._id}
                type="button"
                disabled={isMoving}
                className="w-full px-4 py-3 text-left hover:bg-[#e8e8e0] transition-colors disabled:opacity-50"
                onClick={() => handleMove(folder._id)}
              >
                <p className="font-bold text-[#1a1a1a] truncate">{folder.path}</p>
              </button>
            ))}
            {destinations.length === 0 && (
              <p className="px-4 py-3 text-sm text-[#888]">
                No other folders to move into.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
