import { useConvex } from "convex/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreVertical, Trash2, ArrowRight, FolderInput } from "lucide-react";
import { Id } from "@convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useRoutePrewarmIntent } from "@/lib/useRoutePrewarmIntent";
import { prewarmProject } from "../../../app/routes/dashboard/-project.data";
import { useDraggableCard } from "@/lib/dnd/useDraggableCard";
import { useFolderDropTarget } from "@/lib/dnd/useFolderDropTarget";
import type { FolderNode } from "@/lib/folderTree";
import type { DragPayload } from "@/lib/dnd/payload";

export type ProjectCardProject = {
  _id: Id<"projects">;
  name: string;
  videoCount: number;
  subfolderCount: number;
};

export function formatProjectMeta(videoCount: number, subfolderCount: number) {
  const parts: string[] = [];
  if (subfolderCount > 0) {
    parts.push(`${subfolderCount} folder${subfolderCount !== 1 ? "s" : ""}`);
  }
  parts.push(`${videoCount} video${videoCount !== 1 ? "s" : ""}`);
  return parts.join(" · ");
}

type ProjectCardProps = {
  teamSlug: string;
  project: ProjectCardProject;
  onOpen: () => void;
  onDelete?: (projectId: Id<"projects">) => void;
  onMove?: (project: { _id: Id<"projects">; name: string }) => void;
  /** Drag-and-drop wiring. Omit to render a plain (non-draggable) card. */
  dnd?: {
    teamId: Id<"teams">;
    /** This folder's own parent (undefined when it sits at the team root). */
    currentParentId?: Id<"projects">;
    /** The team's flat folder list, for the folder-into-descendant guard. */
    folders?: readonly FolderNode[];
    /** Disable both dragging and dropping (e.g. viewers). */
    disabled?: boolean;
    /** Perform the move when a legal drop lands on this folder card. */
    onDropMove: (payload: DragPayload, destProjectId: Id<"projects">) => void;
  };
};

export function ProjectCard({
  teamSlug,
  project,
  onOpen,
  onDelete,
  onMove,
  dnd,
}: ProjectCardProps) {
  const convex = useConvex();
  const prewarmIntentHandlers = useRoutePrewarmIntent(() =>
    prewarmProject(convex, {
      teamSlug,
      projectId: project._id,
    }),
  );

  const showMenu = Boolean(onDelete || onMove);

  const dndDisabled = !dnd || dnd.disabled;
  const { ref: dragRef, isDragging } = useDraggableCard<HTMLDivElement>({
    disabled: dndDisabled,
    payload: {
      kind: "folder",
      projectId: project._id,
      sourceParentId: dnd?.currentParentId,
      teamId: dnd?.teamId as Id<"teams">,
      name: project.name,
    },
  });
  const {
    ref: dropRef,
    isDraggedOver,
    canDropHere,
  } = useFolderDropTarget<HTMLDivElement>({
    disabled: dndDisabled,
    targetProjectId: project._id,
    teamId: dnd?.teamId as Id<"teams">,
    folders: dnd?.folders,
    onMove: (payload) => dnd?.onDropMove(payload, project._id),
  });

  const setCardRef = (node: HTMLDivElement | null) => {
    dragRef.current = node;
    dropRef.current = node;
  };

  return (
    <Card
      ref={setCardRef}
      className={cn(
        "group cursor-pointer hover:bg-[#e8e8e0] transition-colors",
        isDragging && "opacity-50 border-dashed",
        isDraggedOver && canDropHere && "border-[#2d5a2d] bg-[#2d5a2d]/10",
        isDraggedOver && !canDropHere && "border-[#dc2626] [cursor:no-drop]",
      )}
      onClick={onOpen}
      {...prewarmIntentHandlers}
    >
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="flex-1 min-w-0">
          <CardTitle className="text-base truncate">{project.name}</CardTitle>
          <CardDescription className="mt-1">
            {formatProjectMeta(project.videoCount, project.subfolderCount)}
          </CardDescription>
        </div>
        {showMenu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-100 md:opacity-0 md:group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onMove && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onMove({ _id: project._id, name: project.name });
                  }}
                >
                  <FolderInput className="mr-2 h-4 w-4" />
                  Move
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem
                  className="text-[#dc2626] focus:text-[#dc2626]"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(project._id);
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between text-sm text-[#888] group-hover:text-[#1a1a1a] transition-colors">
          <span>Open project</span>
          <ArrowRight className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}
