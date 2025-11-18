import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw, HardDrive, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

type StorageVideo = Awaited<
  ReturnType<typeof trpcClient.ytdlp.listDownloadedVideosDetailed.query>
>[number];

const formatBytes = (bytes: number | null | undefined): string => {
  if (!bytes || bytes <= 0) return "–";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

const formatDuration = (seconds: number | null | undefined): string => {
  if (!seconds || seconds <= 0) return "–";
  const mins = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${mins}m ${remainingSeconds}s`;
};

const formatRelativeDate = (timestamp: number | null | undefined): string => {
  if (!timestamp) return "Never";
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSeconds < 60) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return `${diffYears}y ago`;
};

export default function StorageManagerPage(): React.JSX.Element {
  const [search, setSearch] = useState("");
  const [fileFilter, setFileFilter] = useState<"all" | "missing">("all");
  const [sortKey, setSortKey] = useState<"size" | "lastWatched">("size");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [activityFilter, setActivityFilter] = useState<"all" | "never" | "30d" | "90d">("all");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const queryClient = useQueryClient();

  const downloadsQuery = useQuery({
    queryKey: ["storage", "downloads"],
    queryFn: () => trpcClient.ytdlp.listDownloadedVideosDetailed.query(),
    refetchOnWindowFocus: false,
  });

  const deleteMutation = useMutation({
    mutationFn: (videoId: string) => trpcClient.ytdlp.deleteDownloadedVideo.mutate({ videoId }),
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Video deleted");
        queryClient.invalidateQueries({ queryKey: ["storage", "downloads"] });
        queryClient.invalidateQueries({ queryKey: ["ytdlp", "listCompletedDownloads"] });
      } else {
        toast.error(result.message ?? "Failed to delete video");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete video");
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (videoIds: string[]) => {
      const results = await Promise.all(
        videoIds.map((videoId) => trpcClient.ytdlp.deleteDownloadedVideo.mutate({ videoId }))
      );
      return results;
    },
    onSuccess: (results) => {
      const successCount = results.filter((res) => res?.success).length;
      const failureCount = results.length - successCount;
      if (successCount > 0) {
        toast.success(`Deleted ${successCount} ${successCount === 1 ? "video" : "videos"}.`);
      }
      if (failureCount > 0) {
        toast.error(`Failed to delete ${failureCount} item(s).`);
      }
      setSelected({});
      queryClient.invalidateQueries({ queryKey: ["storage", "downloads"] });
      queryClient.invalidateQueries({ queryKey: ["ytdlp", "listCompletedDownloads"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete selected videos");
    },
  });

  const filteredVideos = useMemo(() => {
    if (!downloadsQuery.data) return [];
    let list = downloadsQuery.data;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (video) =>
          video.title.toLowerCase().includes(q) ||
          (video.channelTitle?.toLowerCase().includes(q) ?? false) ||
          video.videoId.toLowerCase().includes(q)
      );
    }

    if (fileFilter === "missing") {
      list = list.filter((video) => !video.fileExists);
    }

    if (activityFilter !== "all") {
      const now = Date.now();
      const threshold =
        activityFilter === "30d"
          ? now - 30 * 24 * 60 * 60 * 1000
          : activityFilter === "90d"
            ? now - 90 * 24 * 60 * 60 * 1000
            : null;

      list = list.filter((video) => {
        if (activityFilter === "never") {
          return !video.lastWatchedAt;
        }
        if (!threshold) return true;
        if (!video.lastWatchedAt) return true;
        return video.lastWatchedAt < threshold;
      });
    }

    const sorted = [...list].sort((a, b) => {
      const direction = sortOrder === "asc" ? 1 : -1;
      switch (sortKey) {
        case "size":
          return direction * ((a.fileSizeBytes ?? 0) - (b.fileSizeBytes ?? 0));
        case "lastWatched":
          return direction * ((a.lastWatchedAt ?? 0) - (b.lastWatchedAt ?? 0));
        default:
          return 0;
      }
    });
    return sorted;
  }, [downloadsQuery.data, search, fileFilter, activityFilter, sortKey, sortOrder]);

  const totalSize = useMemo(() => {
    if (!downloadsQuery.data) return 0;
    return downloadsQuery.data.reduce((sum, video) => sum + (video.fileSizeBytes ?? 0), 0);
  }, [downloadsQuery.data]);

  const missingCount = useMemo(() => {
    if (!downloadsQuery.data) return 0;
    return downloadsQuery.data.filter((video) => !video.fileExists).length;
  }, [downloadsQuery.data]);

  const neverWatchedCount = useMemo(() => {
    if (!downloadsQuery.data) return 0;
    return downloadsQuery.data.filter((video) => !video.lastWatchedAt).length;
  }, [downloadsQuery.data]);

  const summaryCards = useMemo(() => {
    if (!downloadsQuery.data) return [];
    return [
      {
        label: "Total videos",
        value: downloadsQuery.data.length.toLocaleString(),
        helper: "Completed downloads",
      },
      {
        label: "Total size",
        value: formatBytes(totalSize),
        helper: "Disk usage",
      },
      {
        label: "Missing files",
        value: missingCount.toLocaleString(),
        helper: "Files removed or moved",
      },
      {
        label: "Never watched",
        value: neverWatchedCount.toLocaleString(),
        helper: "Yet to be played",
      },
    ];
  }, [downloadsQuery.data, totalSize, missingCount, neverWatchedCount]);

  const selectedIds = useMemo(
    () => Object.keys(selected).filter((videoId) => selected[videoId]),
    [selected]
  );

  const allVisibleSelected =
    filteredVideos.length > 0 && filteredVideos.every((video) => selected[video.videoId]);
  const someVisibleSelected = filteredVideos.some((video) => selected[video.videoId]);

  const toggleSort = (key: typeof sortKey): void => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortOrder((prevOrder) => (prevOrder === "asc" ? "desc" : "asc"));
        return prevKey;
      }
      setSortOrder("desc");
      return key;
    });
  };

  const handleDelete = (video: StorageVideo): void => {
    if (deleteMutation.isPending) return;
    const confirmed = window.confirm(
      `Delete downloaded file for "${video.title}"? This cannot be undone.`
    );
    if (!confirmed) return;
    deleteMutation.mutate(video.videoId);
  };

  const handleBulkDelete = (): void => {
    if (!selectedIds.length || bulkDeleteMutation.isPending) return;
    const confirmed = window.confirm(
      `Delete ${selectedIds.length} selected ${selectedIds.length === 1 ? "video" : "videos"}?`
    );
    if (!confirmed) return;
    bulkDeleteMutation.mutate(selectedIds);
  };

  const handleSelectAll = (checked: boolean): void => {
    setSelected((prev) => {
      if (!checked) {
        const next = { ...prev };
        filteredVideos.forEach((video) => {
          delete next[video.videoId];
        });
        return next;
      }
      const next = { ...prev };
      filteredVideos.forEach((video) => {
        next[video.videoId] = true;
      });
      return next;
    });
  };

  const toggleSelection = (videoId: string, checked: boolean): void => {
    setSelected((prev) => {
      const next = { ...prev };
      if (checked) {
        next[videoId] = true;
      } else {
        delete next[videoId];
      }
      return next;
    });
  };

  useEffect(() => {
    if (!downloadsQuery.data) {
      setSelected({});
      return;
    }
    setSelected((prev) => {
      const next: Record<string, boolean> = {};
      downloadsQuery.data.forEach((video) => {
        if (prev[video.videoId]) {
          next[video.videoId] = true;
        }
      });
      return next;
    });
  }, [downloadsQuery.data]);

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HardDrive className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold">Storage Manager</h1>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <Button
              variant="destructive"
              size="default"
              className="flex items-center gap-2"
              onClick={handleBulkDelete}
              disabled={bulkDeleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4" />
              Delete Selected ({selectedIds.length})
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
            onClick={() => downloadsQuery.refetch()}
            disabled={downloadsQuery.isRefetching}
          >
            <RefreshCw className={`h-4 w-4 ${downloadsQuery.isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap text-xs text-muted-foreground">File:</span>
              <RadioGroup
                value={fileFilter}
                onValueChange={(value) => {
                  if (value === "all" || value === "missing") {
                    setFileFilter(value);
                  }
                }}
                className="flex flex-row gap-3"
              >
                <div className="flex items-center space-x-1.5">
                  <RadioGroupItem value="all" id="file-all" className="h-3.5 w-3.5" />
                  <label htmlFor="file-all" className="cursor-pointer text-xs">
                    All
                  </label>
                </div>
                <div className="flex items-center space-x-1.5">
                  <RadioGroupItem value="missing" id="file-missing" className="h-3.5 w-3.5" />
                  <label htmlFor="file-missing" className="cursor-pointer text-xs">
                    Missing
                  </label>
                </div>
              </RadioGroup>
            </div>
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap text-xs text-muted-foreground">Activity:</span>
              <RadioGroup
                value={activityFilter}
                onValueChange={(value) => {
                  if (value === "all" || value === "never" || value === "30d" || value === "90d") {
                    setActivityFilter(value);
                  }
                }}
                className="flex flex-row gap-3"
              >
                <div className="flex items-center space-x-1.5">
                  <RadioGroupItem value="all" id="activity-all" className="h-3.5 w-3.5" />
                  <label htmlFor="activity-all" className="cursor-pointer text-xs">
                    Any
                  </label>
                </div>
                <div className="flex items-center space-x-1.5">
                  <RadioGroupItem value="never" id="activity-never" className="h-3.5 w-3.5" />
                  <label htmlFor="activity-never" className="cursor-pointer text-xs">
                    Never
                  </label>
                </div>
                <div className="flex items-center space-x-1.5">
                  <RadioGroupItem value="30d" id="activity-30d" className="h-3.5 w-3.5" />
                  <label htmlFor="activity-30d" className="cursor-pointer text-xs">
                    30d
                  </label>
                </div>
                <div className="flex items-center space-x-1.5">
                  <RadioGroupItem value="90d" id="activity-90d" className="h-3.5 w-3.5" />
                  <label htmlFor="activity-90d" className="cursor-pointer text-xs">
                    90d
                  </label>
                </div>
              </RadioGroup>
            </div>
          </div>
        </CardContent>
      </Card>

      {summaryCards.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <div className="flex flex-wrap items-center gap-6 text-sm">
              {summaryCards.map((card, index) => (
                <div key={card.label} className="flex items-center gap-2">
                  <span className="text-muted-foreground">{card.label}:</span>
                  <span className="font-semibold">{card.value}</span>
                  {index < summaryCards.length - 1 && (
                    <span className="text-muted-foreground">•</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Downloaded Videos{" "}
              {filteredVideos.length > 0 && `(${filteredVideos.length.toLocaleString()})`}
            </CardTitle>
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {selectedIds.length} {selectedIds.length === 1 ? "video" : "videos"} selected
                </span>
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex items-center gap-2"
                  onClick={handleBulkDelete}
                  disabled={bulkDeleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Selected
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="overflow-hidden p-0">
          {downloadsQuery.isLoading ? (
            <div className="space-y-2 p-6">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="h-12 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : filteredVideos.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              {search || fileFilter !== "all" || activityFilter !== "all"
                ? "No videos match your filters."
                : "No completed downloads yet."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false
                      }
                      onCheckedChange={(value) => handleSelectAll(value === true)}
                      aria-label="Select all videos"
                    />
                  </TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>
                    <button
                      type="button"
                      className="flex items-center gap-1"
                      onClick={() => toggleSort("size")}
                    >
                      <span>Size</span>
                      {sortKey === "size" && <span>{sortOrder === "asc" ? "↑" : "↓"}</span>}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      className="flex items-center gap-1"
                      onClick={() => toggleSort("lastWatched")}
                    >
                      <span>Last Watched</span>
                      {sortKey === "lastWatched" && <span>{sortOrder === "asc" ? "↑" : "↓"}</span>}
                    </button>
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVideos.map((video) => (
                  <TableRow
                    key={video.videoId}
                    data-state={selected[video.videoId] ? "selected" : undefined}
                  >
                    <TableCell className="w-10">
                      <Checkbox
                        checked={selected[video.videoId] ?? false}
                        onCheckedChange={(value) => toggleSelection(video.videoId, value === true)}
                        aria-label="Select video"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{video.title}</span>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{video.videoId}</span>
                          {!video.fileExists && (
                            <Badge variant="destructive" className="text-[10px]">
                              Missing file
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {video.channelTitle ?? "Unknown channel"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDuration(video.durationSeconds)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatBytes(video.fileSizeBytes)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatRelativeDate(video.lastWatchedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(video)}
                        disabled={deleteMutation.isPending}
                        className="flex items-center gap-1"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
