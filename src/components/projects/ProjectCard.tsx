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
import { useRoutePrewarmIntent } from "@/lib/useRoutePrewarmIntent";
import { prewarmProject } from "../../../app/routes/dashboard/-project.data";

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
};

export function ProjectCard({
  teamSlug,
  project,
  onOpen,
  onDelete,
  onMove,
}: ProjectCardProps) {
  const convex = useConvex();
  const prewarmIntentHandlers = useRoutePrewarmIntent(() =>
    prewarmProject(convex, {
      teamSlug,
      projectId: project._id,
    }),
  );

  const showMenu = Boolean(onDelete || onMove);

  return (
    <Card
      className="group cursor-pointer hover:bg-[#e8e8e0] transition-colors"
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
