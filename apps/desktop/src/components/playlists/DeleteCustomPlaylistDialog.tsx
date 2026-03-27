import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type DeletePlaylistResult = Awaited<ReturnType<typeof trpcClient.customPlaylists.delete.mutate>>;
type DeletePlaylistSuccessResult = Extract<DeletePlaylistResult, { success: true }>;

type DeleteCustomPlaylistDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playlistId: string;
  playlistName: string;
  videoCount?: number | null;
  onDeleted?: (result: DeletePlaylistSuccessResult) => void;
};

const getSuccessMessage = (
  playlistName: string,
  deleteVideosData: boolean,
  result: DeletePlaylistSuccessResult
): string => {
  if (!deleteVideosData) {
    return `Playlist "${playlistName}" deleted`;
  }

  if (result.deletedVideosCount > 0 && result.retainedVideosCount > 0) {
    return `Playlist "${playlistName}" deleted. Removed ${result.deletedVideosCount} video(s) and kept ${result.retainedVideosCount} shared or favorited video(s).`;
  }

  if (result.deletedVideosCount > 0) {
    return `Playlist "${playlistName}" deleted with ${result.deletedVideosCount} video(s) removed from your library.`;
  }

  if (result.retainedVideosCount > 0) {
    return `Playlist "${playlistName}" deleted. ${result.retainedVideosCount} shared or favorited video(s) were kept.`;
  }

  return `Playlist "${playlistName}" deleted`;
};

export function DeleteCustomPlaylistDialog({
  open,
  onOpenChange,
  playlistId,
  playlistName,
  videoCount,
  onDeleted,
}: DeleteCustomPlaylistDialogProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const [deleteVideosData, setDeleteVideosData] = useState(false);

  useEffect(() => {
    if (!open) {
      setDeleteVideosData(false);
    }
  }, [open]);

  const videoCountLabel = useMemo(() => {
    if (typeof videoCount !== "number") return "videos in this playlist";
    return `${videoCount} video${videoCount === 1 ? "" : "s"} in this playlist`;
  }, [videoCount]);

  const deleteMutation = useMutation({
    mutationFn: (shouldDeleteVideosData: boolean) =>
      trpcClient.customPlaylists.delete.mutate({
        playlistId,
        deleteVideosData: shouldDeleteVideosData,
      }),
    onSuccess: (result, shouldDeleteVideosData) => {
      if (!result.success) {
        toast.error(result.message ?? "Failed to delete playlist");
        return;
      }

      void queryClient.invalidateQueries({ queryKey: ["customPlaylists"] });
      void queryClient.invalidateQueries({ queryKey: ["customPlaylist-details", playlistId] });
      void queryClient.invalidateQueries({ queryKey: ["favorites"] });

      if (shouldDeleteVideosData) {
        void queryClient.invalidateQueries({ queryKey: ["queue", "status"] });
        void queryClient.invalidateQueries({ queryKey: ["video-playback"] });
        void queryClient.invalidateQueries({ queryKey: ["ytdlp", "downloadedVideosDetailed"] });
      }

      toast.success(getSuccessMessage(playlistName, shouldDeleteVideosData, result));
      onOpenChange(false);
      onDeleted?.(result);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete playlist");
    },
  });

  const handleConfirmDelete = (event: React.MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    if (deleteMutation.isPending) return;
    deleteMutation.mutate(deleteVideosData);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Playlist?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete "{playlistName}"? This action cannot be undone. By
            default, only the playlist is removed.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <label className="flex items-start gap-3 rounded-lg border p-3">
          <Checkbox
            checked={deleteVideosData}
            onCheckedChange={(checked) => setDeleteVideosData(checked === true)}
            className="mt-0.5"
          />
          <div className="space-y-1 text-sm">
            <div className="font-medium">Also delete video data</div>
            <p className="text-muted-foreground">
              Remove downloaded files, thumbnails, transcripts, notes, quizzes, flashcards, and
              watch progress for {videoCountLabel}. Videos that are still used in other playlists
              or already favorited are kept.
            </p>
          </div>
        </label>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirmDelete}
            disabled={deleteMutation.isPending}
            className="bg-destructive hover:bg-destructive/90"
          >
            {deleteMutation.isPending ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
