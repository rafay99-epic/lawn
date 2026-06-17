"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Copy, Check, Plus, Trash2, Eye, Lock, ExternalLink, Globe } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, formatRelativeTime } from "@/lib/utils";

interface ShareDialogProps {
  videoId: Id<"videos">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareDialog({ videoId, open, onOpenChange }: ShareDialogProps) {
  const video = useQuery(api.videos.get, { videoId });
  const shareLinks = useQuery(api.shareLinks.list, { videoId });
  const createShareLink = useMutation(api.shareLinks.create);
  const deleteShareLink = useMutation(api.shareLinks.remove);
  const setVisibility = useMutation(api.videos.setVisibility);
  const setVersionBrowsing = useMutation(api.videos.setPublicVersionBrowsing);

  const [isCreating, setIsCreating] = useState(false);
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);
  const [isUpdatingVersionBrowsing, setIsUpdatingVersionBrowsing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [newLinkOptions, setNewLinkOptions] = useState({
    expiresInDays: undefined as number | undefined,
    password: undefined as string | undefined,
  });

  const handleCreateLink = async () => {
    setIsCreating(true);
    try {
      await createShareLink({
        videoId,
        expiresInDays: newLinkOptions.expiresInDays,
        allowDownload: false,
        password: newLinkOptions.password,
      });
      setNewLinkOptions({
        expiresInDays: undefined,
        password: undefined,
      });
    } catch (error) {
      console.error("Failed to create share link:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleSetVisibility = async (visibility: "public" | "private") => {
    if (!video || isUpdatingVisibility || video.visibility === visibility) return;
    setIsUpdatingVisibility(true);
    try {
      await setVisibility({ videoId, visibility });
    } catch (error) {
      console.error("Failed to update visibility:", error);
    } finally {
      setIsUpdatingVisibility(false);
    }
  };

  const versionBrowsingEnabled = video?.allowPublicVersionBrowsing !== false;

  const handleSetVersionBrowsing = async (enabled: boolean) => {
    if (!video || isUpdatingVersionBrowsing || versionBrowsingEnabled === enabled) return;
    setIsUpdatingVersionBrowsing(true);
    try {
      await setVersionBrowsing({ videoId, enabled });
    } catch (error) {
      console.error("Failed to update version browsing:", error);
    } finally {
      setIsUpdatingVersionBrowsing(false);
    }
  };

  const handleCopyLink = (token: string) => {
    const url = `${window.location.origin}/share/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(token);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyPublicLink = () => {
    if (!video?.publicId) return;
    const url = `${window.location.origin}/watch/${video.publicId}`;
    navigator.clipboard.writeText(url);
    setCopiedId("public");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDeleteLink = async (linkId: Id<"shareLinks">) => {
    if (!confirm("Are you sure you want to delete this share link?")) return;
    try {
      await deleteShareLink({ linkId });
    } catch (error) {
      console.error("Failed to delete share link:", error);
    }
  };

  const publicWatchPath = video?.publicId ? `/watch/${video.publicId}` : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share video</DialogTitle>
          <DialogDescription>
            Public videos can be viewed by anyone with the URL. Only signed-in users can comment.
          </DialogDescription>
        </DialogHeader>

        {/* Visibility */}
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={video?.visibility === "public" ? "default" : "outline"}
              disabled={isUpdatingVisibility || video === undefined}
              onClick={() => void handleSetVisibility("public")}
            >
              <Globe className="mr-2 h-4 w-4" />
              Public
            </Button>
            <Button
              variant={video?.visibility === "private" ? "default" : "outline"}
              disabled={isUpdatingVisibility || video === undefined}
              onClick={() => void handleSetVisibility("private")}
            >
              <Lock className="mr-2 h-4 w-4" />
              Private
            </Button>
          </div>
          <p className="text-xs text-[#888]">
            Private disables the public URL. Restricted share links still work.
          </p>
        </div>

        {/* Public URL + version browsing */}
        {video?.visibility === "public" ? (
          <div className="space-y-3">
            {publicWatchPath ? (
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate border-2 border-[#1a1a1a] bg-[#e8e8e0] px-3 py-2 font-mono text-sm">
                  {publicWatchPath}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyPublicLink}
                  aria-label="Copy public URL"
                >
                  {copiedId === "public" ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => window.open(publicWatchPath, "_blank")}
                  aria-label="Open public URL"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-[#1a1a1a]">Version browsing</h3>
                <p className="text-xs text-[#888]">Let viewers switch between versions.</p>
              </div>
              <div className="flex shrink-0 border-2 border-[#1a1a1a]">
                <button
                  type="button"
                  disabled={isUpdatingVersionBrowsing || video === undefined}
                  onClick={() => void handleSetVersionBrowsing(true)}
                  className={cn(
                    "px-3 py-1.5 text-sm font-bold transition-colors disabled:opacity-50",
                    versionBrowsingEnabled
                      ? "bg-[#1a1a1a] text-[#f0f0e8]"
                      : "text-[#1a1a1a] hover:bg-[#e8e8e0]",
                  )}
                >
                  On
                </button>
                <button
                  type="button"
                  disabled={isUpdatingVersionBrowsing || video === undefined}
                  onClick={() => void handleSetVersionBrowsing(false)}
                  className={cn(
                    "border-l-2 border-[#1a1a1a] px-3 py-1.5 text-sm font-bold transition-colors disabled:opacity-50",
                    !versionBrowsingEnabled
                      ? "bg-[#1a1a1a] text-[#f0f0e8]"
                      : "text-[#1a1a1a] hover:bg-[#e8e8e0]",
                  )}
                >
                  Off
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <Separator />

        {/* Restricted links */}
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-bold text-[#1a1a1a]">Restricted links</h3>
            <p className="text-xs text-[#888]">
              Time-limited, optionally password-protected links.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between font-normal">
                  {newLinkOptions.expiresInDays
                    ? `${newLinkOptions.expiresInDays} days`
                    : "Never expires"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  onClick={() => setNewLinkOptions((o) => ({ ...o, expiresInDays: undefined }))}
                >
                  Never expires
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setNewLinkOptions((o) => ({ ...o, expiresInDays: 1 }))}
                >
                  1 day
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setNewLinkOptions((o) => ({ ...o, expiresInDays: 7 }))}
                >
                  7 days
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setNewLinkOptions((o) => ({ ...o, expiresInDays: 30 }))}
                >
                  30 days
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Input
              type="password"
              placeholder="Password (optional)"
              value={newLinkOptions.password || ""}
              onChange={(e) =>
                setNewLinkOptions((o) => ({
                  ...o,
                  password: e.target.value || undefined,
                }))
              }
            />
          </div>

          <Button onClick={handleCreateLink} disabled={isCreating} className="w-full">
            <Plus className="mr-2 h-4 w-4" />
            {isCreating ? "Creating..." : "Create link"}
          </Button>

          {shareLinks === undefined ? (
            <p className="text-sm text-[#888]">Loading...</p>
          ) : shareLinks.length === 0 ? (
            <p className="text-sm text-[#888]">No share links yet</p>
          ) : (
            <div className="max-h-64 divide-y-2 divide-[#1a1a1a] overflow-y-auto border-2 border-[#1a1a1a]">
              {shareLinks.map((link) => (
                <div key={link._id} className="flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <code className="max-w-[200px] truncate bg-[#e8e8e0] px-2 py-0.5 font-mono text-sm">
                        /share/{link.token}
                      </code>
                      {link.isExpired ? <Badge variant="destructive">Expired</Badge> : null}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-[#888]">
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {link.viewCount} views
                      </span>
                      {link.hasPassword ? (
                        <span className="flex items-center gap-1">
                          <Lock className="h-3 w-3" />
                          Protected
                        </span>
                      ) : null}
                      {link.expiresAt ? (
                        <span>Expires {formatRelativeTime(link.expiresAt)}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleCopyLink(link.token)}>
                      {copiedId === link.token ? (
                        <Check className="h-4 w-4 text-[#2d5a2d]" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => window.open(`/share/${link.token}`, "_blank")}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-[#dc2626] hover:text-[#dc2626]"
                      onClick={() => handleDeleteLink(link._id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
