import React from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function PlayerPage() {
  const navigate = useNavigate();
  // Use TanStack Router's useSearch instead of window.location.search
  const search = useSearch({ from: "/player" });
  const id = search.id;

  const { data, isLoading, error } = useQuery({
    queryKey: ["download", id],
    queryFn: async () => {
      if (!id) {
        return null;
      }
      return await trpcClient.ytdlp.getDownload.query({ id });
    },
    enabled: !!id,
  });

  const filePath = data?.filePath || null;
  const toLocalFileUrl = (p: string) => `local-file://${p}`;
  const videoTitle = data?.videoId || data?.url || "Video";

  return (
    <div className="container mx-auto space-y-6 p-6">
      <Button variant="ghost" onClick={() => navigate({ to: "/" })}>
        ← Back
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{videoTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : !id ? (
            <Alert>
              <AlertTitle>Missing video</AlertTitle>
              <AlertDescription>No download id provided.</AlertDescription>
            </Alert>
          ) : !data ? (
            <Alert>
              <AlertTitle>Not found</AlertTitle>
              <AlertDescription>Could not find that download.</AlertDescription>
            </Alert>
          ) : !filePath ? (
            <Alert>
              <AlertTitle>File not available</AlertTitle>
              <AlertDescription>
                The download record has no file path yet. It may still be processing.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              <video
                key={filePath}
                src={toLocalFileUrl(filePath)}
                controls
                className="w-full max-h-[70vh] rounded border bg-black"
              />
              <div className="flex gap-2">
                <a
                  href={toLocalFileUrl(filePath)}
                  target="_blank"
                  rel="noreferrer"
                  className="underline text-sm"
                >
                  Open file
                </a>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
