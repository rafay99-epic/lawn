
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Folder, Plus, Users, CreditCard } from "lucide-react";
import { MemberInvite } from "@/components/teams/MemberInvite";
import { cn } from "@/lib/utils";
import { projectPath, teamSettingsPath } from "@/lib/routes";
import { Id } from "@convex/_generated/dataModel";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { MoveProjectDialog } from "@/components/projects/MoveProjectDialog";
import { useTeamData } from "./-team.data";
import { DashboardHeader } from "@/components/DashboardHeader";
import { useMoveActions } from "@/lib/dnd/useMoveActions";
import { useFolderDropTarget } from "@/lib/dnd/useFolderDropTarget";
import type { DragPayload } from "@/lib/dnd/payload";

export default function TeamPage() {
  const params = useParams({ strict: false });
  const navigate = useNavigate({});
  const pathname = useLocation().pathname;
  const teamSlug = typeof params.teamSlug === "string" ? params.teamSlug : "";

  const { context, team, projects, billing } = useTeamData({ teamSlug });
  const createProject = useMutation(api.projects.create);
  const deleteProject = useMutation(api.projects.remove);
  const { moveFromDrop } = useMoveActions();
  const [dndError, setDndError] = useState<string | null>(null);

  const handleDropMove = (payload: DragPayload, destProjectId?: Id<"projects">) => {
    void moveFromDrop(payload, destProjectId).then((result) => {
      setDndError(result.error ?? null);
    });
  };

  // Auto-dismiss the drop error, matching the share-toast behavior.
  useEffect(() => {
    if (!dndError) return;
    const timeout = window.setTimeout(() => setDndError(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [dndError]);

  // Empty background of the team grid = move a folder to the top level.
  const teamId = team?._id;
  const canCreateProjectRef = team?.role !== "viewer";
  const { ref: gridDropRef, isDraggedOver: gridDraggedOver, canDropHere: gridCanDrop } =
    useFolderDropTarget<HTMLDivElement>({
      disabled: !teamId || !canCreateProjectRef,
      targetProjectId: undefined, // top level
      teamId: teamId as Id<"teams">,
      onMove: (payload) => handleDropMove(payload, undefined),
    });

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [moveTarget, setMoveTarget] = useState<{
    _id: Id<"projects">;
    name: string;
  } | null>(null);

  const shouldCanonicalize =
    !!context && !context.isCanonical && pathname !== context.canonicalPath;

  useEffect(() => {
    if (shouldCanonicalize && context) {
      navigate({ to: context.canonicalPath, replace: true });
    }
  }, [shouldCanonicalize, context, navigate]);

  const isLoadingData =
    context === undefined ||
    billing === undefined ||
    projects === undefined ||
    shouldCanonicalize;

  // Not found state
  if (context === null) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-[#888]">Team not found</div>
      </div>
    );
  }

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim() || !team) return;

    setIsLoading(true);
    try {
      const projectId = await createProject({
        teamId: team._id,
        name: newProjectName.trim(),
      });
      setCreateDialogOpen(false);
      setNewProjectName("");
      navigate({ to: projectPath(team.slug, projectId) });
    } catch (error) {
      console.error("Failed to create project:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteProject = async (projectId: Id<"projects">) => {
    if (
      !confirm(
        "Delete this project and everything inside it (sub-folders and videos)? This can't be undone.",
      )
    )
      return;
    try {
      await deleteProject({ projectId });
    } catch (error) {
      console.error("Failed to delete project:", error);
    }
  };

  const canManageMembers = team?.role === "owner" || team?.role === "admin";
  const hasActiveSubscription = billing?.hasActiveSubscription ?? false;
  const canCreateProject = team?.role !== "viewer" && hasActiveSubscription;
  const canAccessBilling = team?.role === "owner";
  const billingPath = team ? teamSettingsPath(team.slug) : null;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <DashboardHeader paths={[{ label: team?.slug ?? "team" }]}>
        {canAccessBilling && team && (
          <Button
            variant="outline"
            onClick={() => navigate({ to: billingPath ?? teamSettingsPath(team.slug) })}
          >
            <CreditCard className="sm:mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Billing</span>
          </Button>
        )}
        {canManageMembers && (
          <Button
            variant="outline"
            onClick={() => setMemberDialogOpen(true)}
          >
            <Users className="sm:mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Members</span>
          </Button>
        )}
        {canCreateProject && (
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="sm:mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">New project</span>
          </Button>
        )}
      </DashboardHeader>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {!isLoadingData && !hasActiveSubscription && canAccessBilling && (
          <Card className="mb-6 border-[#1a1a1a]">
            <CardHeader>
              <CardTitle>Set up billing to create projects</CardTitle>
              <CardDescription>
                This team has no active subscription. Go to Billing to start Basic or Pro before
                creating projects.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="primary"
                onClick={() => {
                  if (!billingPath) return;
                  navigate({ to: billingPath });
                }}
              >
                Go to Billing
              </Button>
            </CardContent>
          </Card>
        )}
        {!isLoadingData && projects.length === 0 ? (
          <div className="h-full flex items-center justify-center animate-in fade-in duration-300">
            <Card className="max-w-sm text-center">
              <CardHeader>
                <div className="mx-auto w-12 h-12 bg-[#e8e8e0] flex items-center justify-center mb-2">
                  <Folder className="h-6 w-6 text-[#888]" />
                </div>
                <CardTitle className="text-lg">No projects yet</CardTitle>
                <CardDescription>
                  {hasActiveSubscription
                    ? "Create your first project to start uploading videos."
                    : "Activate billing first, then create your first project."}
                </CardDescription>
              </CardHeader>
              {canCreateProject && (
                <CardContent>
                  <Button
                    className="w-full"
                    onClick={() => setCreateDialogOpen(true)}
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    Create project
                  </Button>
                </CardContent>
              )}
              {!canCreateProject && canAccessBilling && (
                <CardContent>
                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={() => {
                      if (!billingPath) return;
                      navigate({ to: billingPath });
                    }}
                  >
                    Go to Billing
                  </Button>
                </CardContent>
              )}
            </Card>
          </div>
        ) : (
          <div
            ref={gridDropRef}
            className={cn(
              "grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 transition-opacity duration-300",
              isLoadingData ? "opacity-0" : "opacity-100",
              gridDraggedOver && gridCanDrop &&
                "outline-2 outline-dashed outline-[#2d5a2d] outline-offset-4",
            )}
          >
            {projects?.map((project) => (
              <ProjectCard
                key={project._id}
                teamSlug={team.slug}
                project={project}
                onOpen={() =>
                  navigate({ to: projectPath(team.slug, project._id) })
                }
                onDelete={canCreateProject ? handleDeleteProject : undefined}
                onMove={canCreateProject ? (p) => setMoveTarget(p) : undefined}
                dnd={
                  teamId
                    ? {
                        teamId,
                        currentParentId: undefined,
                        // `folders` is intentionally omitted: the team root only
                        // renders root folders, so a folder's own descendants are
                        // never visible here as drop targets. `projects.move`
                        // still enforces the cycle guard server-side.
                        disabled: !canCreateProject,
                        onDropMove: handleDropMove,
                      }
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </div>

      {dndError ? (
        <div className="fixed right-4 top-16 z-50" aria-live="polite">
          <button
            type="button"
            onClick={() => setDndError(null)}
            className="border-2 border-[#dc2626] bg-[#fef2f2] px-3 py-2 text-sm font-bold text-[#dc2626] shadow-[4px_4px_0px_0px_var(--shadow-color)]"
          >
            {dndError}
          </button>
        </div>
      ) : null}

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <form onSubmit={handleCreateProject}>
            <DialogHeader>
              <DialogTitle>Create project</DialogTitle>
              <DialogDescription>
                Projects help you organize related videos together.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input
                placeholder="Project name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!newProjectName.trim() || isLoading}
              >
                {isLoading ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {canManageMembers && team && (
        <MemberInvite
          teamId={team._id}
          open={memberDialogOpen}
          onOpenChange={setMemberDialogOpen}
        />
      )}

      {team && (
        <MoveProjectDialog
          teamId={team._id}
          project={moveTarget}
          open={moveTarget !== null}
          onOpenChange={(open) => {
            if (!open) setMoveTarget(null);
          }}
        />
      )}
    </div>
  );
}
