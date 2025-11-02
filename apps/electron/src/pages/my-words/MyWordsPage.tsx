import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Trash2,
  TrendingUp,
  Clock,
  Languages,
  BarChart3,
  Loader2,
  ArrowUpDown,
  Play,
  ChevronDown,
  ChevronUp,
  Video,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "@tanstack/react-router";
import Thumbnail from "@/components/Thumbnail";

export default function MyWordsPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "frequent">("recent");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [expandedTranslations, setExpandedTranslations] = useState<Set<string>>(new Set());

  // Debounce search input
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch translations
  const { data: translationsData, isLoading: translationsLoading, refetch: refetchTranslations } = useQuery({
    queryKey: ["translations", sortBy],
    queryFn: async () => trpcClient.translation.getTranslations.query({
      limit: 100,
      sortBy
    }),
  });

  // Fetch statistics
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["translation-statistics"],
    queryFn: async () => trpcClient.translation.getStatistics.query(),
  });

  // Search translations
  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ["translation-search", debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch) return [];
      return trpcClient.translation.searchTranslations.query({ query: debouncedSearch });
    },
    enabled: debouncedSearch.length > 0,
  });

  const handleDelete = async (id: string) => {
    try {
      await trpcClient.translation.deleteTranslation.mutate({ id });
      refetchTranslations();
    } catch (error) {
      console.error("Failed to delete translation:", error);
    }
  };

  const toggleExpanded = (translationId: string) => {
    setExpandedTranslations(prev => {
      const newSet = new Set(prev);
      if (newSet.has(translationId)) {
        newSet.delete(translationId);
      } else {
        newSet.add(translationId);
      }
      return newSet;
    });
  };

  const handlePlayFromContext = (videoId: string, timestampSeconds: number) => {
    navigate({
      to: "/player",
      search: {
        videoId,
        t: timestampSeconds
      }
    });
  };

  const displayTranslations = debouncedSearch
    ? searchResults || []
    : translationsData?.translations || [];

  const isLoading = debouncedSearch ? searchLoading : translationsLoading;

  // Helper component to show video contexts for a translation
  const VideoContexts = ({ translationId }: { translationId: string }) => {
    const { data: contexts, isLoading: contextsLoading } = useQuery({
      queryKey: ["translation-contexts", translationId],
      queryFn: async () => trpcClient.translation.getTranslationContexts.query({ translationId }),
      enabled: expandedTranslations.has(translationId),
    });

    if (!expandedTranslations.has(translationId)) return null;

    if (contextsLoading) {
      return (
        <div className="mt-3 flex items-center justify-center py-4 border-t">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (!contexts || contexts.length === 0) {
      return (
        <div className="mt-3 border-t pt-3">
          <p className="text-sm text-muted-foreground text-center py-2">
            No video contexts found. This word will be linked to videos when you translate it while watching.
          </p>
        </div>
      );
    }

    return (
      <div className="mt-3 border-t pt-3 space-y-2">
        <div className="flex items-center gap-2 mb-2">
          <Video className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Found in {contexts.length} video{contexts.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="space-y-2">
          {contexts.map((context) => (
            <div
              key={context.id}
              className="flex items-center gap-3 p-2 rounded-md border hover:bg-accent transition-colors"
            >
              {/* Video Thumbnail */}
              <div className="flex-shrink-0 w-24">
                <Thumbnail
                  thumbnailPath={context.videoThumbnailPath}
                  thumbnailUrl={context.videoThumbnailUrl}
                  alt={context.videoTitle || "Video"}
                  className="w-full aspect-video rounded object-cover"
                />
              </div>

              {/* Video Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {context.videoTitle || context.videoId}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                  <Clock className="h-3 w-3" />
                  <span>
                    {Math.floor(context.timestampSeconds / 60)}:{String(context.timestampSeconds % 60).padStart(2, '0')}
                  </span>
                  {context.contextText && (
                    <span className="truncate">• {context.contextText}</span>
                  )}
                </div>
              </div>

              {/* Play Button */}
              <Button
                size="sm"
                variant="default"
                className="flex-shrink-0"
                onClick={() => handlePlayFromContext(context.videoId, context.timestampSeconds)}
              >
                <Play className="h-3 w-3 mr-1" />
                Play
              </Button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Words</h1>
          <p className="text-muted-foreground">
            Track and review all your translated words and phrases
          </p>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Words</CardTitle>
            <Languages className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                stats?.totalTranslations || 0
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Unique translations
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Queries</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                stats?.totalQueries || 0
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Times you looked up words
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Language Pairs</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                stats?.uniqueLanguagePairs || 0
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Different language combinations
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Most Frequent</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold truncate">
              {statsLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : stats?.mostFrequent ? (
                stats.mostFrequent.sourceText
              ) : (
                "—"
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.mostFrequent ? `${stats.mostFrequent.queryCount} times` : "No data"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter */}
      <Card>
        <CardHeader>
          <CardTitle>Translation History</CardTitle>
          <CardDescription>
            Search and browse your translation history
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Bar */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search translations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSortBy(sortBy === "recent" ? "frequent" : "recent")}
              title={`Sort by ${sortBy === "recent" ? "frequency" : "recency"}`}
            >
              <ArrowUpDown className="h-4 w-4" />
            </Button>
          </div>

          {/* Sort indicator */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {sortBy === "recent" ? (
              <Clock className="h-4 w-4" />
            ) : (
              <TrendingUp className="h-4 w-4" />
            )}
            <span>
              Sorted by {sortBy === "recent" ? "most recent" : "most frequent"}
            </span>
          </div>

          {/* Translations List */}
          <div className="space-y-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : displayTranslations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {debouncedSearch ? (
                  <p>No translations found for "{debouncedSearch}"</p>
                ) : (
                  <p>No translations yet. Start translating words in the player!</p>
                )}
              </div>
            ) : (
              displayTranslations.map((translation) => (
                <Card key={translation.id} className="group hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        {/* Source and Target Text */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-xs">
                                {translation.sourceLang.toUpperCase()}
                              </Badge>
                              <span className="text-xs text-muted-foreground">Source</span>
                            </div>
                            <p className="font-medium">{translation.sourceText}</p>
                          </div>

                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-xs">
                                {translation.targetLang.toUpperCase()}
                              </Badge>
                              <span className="text-xs text-muted-foreground">Translation</span>
                            </div>
                            <p className="font-medium text-primary">{translation.translatedText}</p>
                          </div>
                        </div>

                        {/* Metadata */}
                        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" />
                            <span>{translation.queryCount} {translation.queryCount === 1 ? 'query' : 'queries'}</span>
                          </div>

                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>
                              Last used {formatDistanceToNow(new Date(translation.lastQueriedAt), { addSuffix: true })}
                            </span>
                          </div>

                          {translation.detectedLang && translation.detectedLang !== translation.sourceLang && (
                            <div className="flex items-center gap-1">
                              <Languages className="h-3 w-3" />
                              <span>Detected as {translation.detectedLang}</span>
                            </div>
                          )}
                        </div>

                        {/* Show in Videos Button */}
                        <div className="pt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleExpanded(translation.id)}
                            className="gap-1"
                          >
                            {expandedTranslations.has(translation.id) ? (
                              <>
                                <ChevronUp className="h-4 w-4" />
                                Hide Videos
                              </>
                            ) : (
                              <>
                                <ChevronDown className="h-4 w-4" />
                                Show in Videos
                              </>
                            )}
                          </Button>
                        </div>

                        {/* Video Contexts */}
                        <VideoContexts translationId={translation.id} />
                      </div>

                      {/* Actions */}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(translation.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete translation"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {/* Load More */}
          {!debouncedSearch && translationsData?.hasMore && (
            <div className="text-center pt-4">
              <Button variant="outline">
                Load More
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

