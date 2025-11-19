import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DownloadIcon, ExternalLinkIcon, RefreshCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { trpcClient } from "@/utils/trpc";
import { logger } from "@/helpers/logger";

const DOWNLOAD_PAGE_URL = "https://github.com/hunght/LearnifyTube/releases/latest";

export interface VersionInfo {
  currentVersion: string;
  latestVersion?: string;
  hasUpdate: boolean;
  downloadUrl?: string;
}

interface VersionCheckerProps {
  autoCheck?: boolean;
  showCheckButton?: boolean;
  onVersionInfo?: (info: VersionInfo) => void;
  cacheDuration?: number;
}

interface DownloadButtonsProps {
  downloadUrl: string;
  onOpenDownloadLink: () => void;
}

function DownloadButtons({
  downloadUrl,
  onOpenDownloadLink,
}: DownloadButtonsProps): React.JSX.Element {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const { toast } = useToast();
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const startProgressTimer = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
    }

    progressTimerRef.current = setInterval(() => {
      setDownloadProgress((prev) => {
        if (prev >= 90) return prev;
        const increment = Math.round(Math.random() * 10 + 5);
        return Math.min(prev + increment, 90);
      });
    }, 1000);
  }, []);

  const stopProgressTimer = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopProgressTimer();
    };
  }, [stopProgressTimer]);

  const handleDownloadUpdate = useCallback(async () => {
    if (!downloadUrl) return;

    setIsDownloading(true);
    setDownloadProgress(0);
    startProgressTimer();

    try {
      const result = await trpcClient.utils.downloadUpdate.mutate({
        downloadUrl,
      });

      stopProgressTimer();
      setDownloadProgress(100);

      if (result.status === "success") {
        toast({
          title: "Download Complete",
          description:
            'The update has been downloaded. Click "Install Update & Quit" to open the installer — the app will quit automatically to allow installation.',
          duration: 2 * 60 * 1000,
          action: (
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (result.filePath) {
                    await trpcClient.utils.openLocalFile.mutate({ filePath: result.filePath });
                    setTimeout(() => {
                      void trpcClient.utils.quitApp.mutate();
                    }, 1000);
                  }
                }}
              >
                Install Update & Quit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (result.filePath) {
                    const folderPath = result.filePath.replace(/[\\/][^\\/]+$/, "");
                    await trpcClient.utils.openFolder.mutate({ folderPath });
                  }
                }}
              >
                Open Folder
              </Button>
            </div>
          ),
        });
      } else {
        toast({
          title: "Download Failed",
          description: result.message || "Failed to download update",
          variant: "destructive",
          duration: 10000,
          action: (
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                void trpcClient.utils.openExternalUrl.mutate({ url: downloadUrl });
              }}
            >
              Open in Browser
            </Button>
          ),
        });
      }
    } catch (error) {
      logger.error("[version-checker] Failed to download update", error);
      stopProgressTimer();
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast({
        title: "Download Failed",
        description: errorMessage || "An error occurred while downloading the update",
        variant: "destructive",
        duration: 10000,
        action: (
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              void trpcClient.utils.openExternalUrl.mutate({ url: downloadUrl });
            }}
          >
            Open in Browser
          </Button>
        ),
      });
    } finally {
      setIsDownloading(false);
      setTimeout(() => {
        setDownloadProgress(0);
      }, 2000);
    }
  }, [downloadUrl, startProgressTimer, stopProgressTimer, toast]);

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleDownloadUpdate}
        disabled={isDownloading}
        className="flex items-center"
      >
        <DownloadIcon className="mr-2 h-4 w-4" />
        {isDownloading ? `${downloadProgress}%` : "Download"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onOpenDownloadLink}
        className="flex items-center"
      >
        <ExternalLinkIcon className="mr-2 h-4 w-4" />
        Open
      </Button>
    </div>
  );
}

export function VersionChecker({
  autoCheck = true,
  showCheckButton = false,
  onVersionInfo,
  cacheDuration = 24 * 60 * 60 * 1000,
}: VersionCheckerProps): React.JSX.Element | null {
  const { toast } = useToast();
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const updateToastShown = useRef(false);

  const { data: appVersionResult, isLoading: isAppVersionLoading } = useQuery({
    queryKey: ["learnifytube-app-version"],
    queryFn: () => trpcClient.utils.getAppVersion.query(),
    staleTime: Infinity,
  });

  const currentVersion = appVersionResult?.version ?? "";

  const {
    data: updateCheckResult,
    refetch,
    isLoading,
  } = useQuery({
    queryKey: ["learnifytube-app-version-check", currentVersion],
    queryFn: () => trpcClient.utils.checkForUpdates.query(),
    enabled: autoCheck && Boolean(currentVersion),
    staleTime: cacheDuration,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const versionInfo = useMemo<VersionInfo | undefined>(() => {
    if (updateCheckResult) {
      return {
        currentVersion: updateCheckResult.currentVersion || currentVersion,
        latestVersion: updateCheckResult.latestVersion,
        hasUpdate: updateCheckResult.updateAvailable,
        downloadUrl: updateCheckResult.updateAvailable ? updateCheckResult.downloadUrl : undefined,
      };
    }

    if (currentVersion) {
      return {
        currentVersion,
        latestVersion: currentVersion,
        hasUpdate: false,
      };
    }

    return undefined;
  }, [updateCheckResult, currentVersion]);

  useEffect(() => {
    if (versionInfo && onVersionInfo) {
      onVersionInfo(versionInfo);
    }
  }, [versionInfo, onVersionInfo]);

  const handleOpenDownloadLink = useCallback((url?: string) => {
    void trpcClient.utils.openExternalUrl.mutate({ url: url ?? DOWNLOAD_PAGE_URL });
  }, []);

  useEffect(() => {
    if (versionInfo?.hasUpdate && versionInfo.downloadUrl && !updateToastShown.current) {
      updateToastShown.current = true;

      toast({
        title: "Update Available",
        description: `Version ${versionInfo.latestVersion} is available. You are currently using version ${versionInfo.currentVersion}.`,
        duration: 2 * 60 * 1000,
        action: (
          <DownloadButtons
            downloadUrl={versionInfo.downloadUrl}
            onOpenDownloadLink={() => handleOpenDownloadLink(versionInfo.downloadUrl)}
          />
        ),
      });
    }

    if (!versionInfo?.hasUpdate) {
      updateToastShown.current = false;
    }
  }, [handleOpenDownloadLink, toast, versionInfo]);

  const checkForUpdates = useCallback(async () => {
    if (!currentVersion) return;

    setIsCheckingUpdate(true);
    try {
      const result = await refetch();

      if (!result.data?.updateAvailable) {
        toast({
          title: "No Updates Available",
          description: "You are using the latest version.",
          duration: 3000,
        });
      }

      return result.data;
    } catch (error) {
      logger.error("[version-checker] Failed to check for updates", error);
      toast({
        title: "Update Check Failed",
        description: "An error occurred while checking for updates. Please try again later.",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsCheckingUpdate(false);
    }
  }, [currentVersion, refetch, toast]);

  if (!showCheckButton) {
    return null;
  }

  const isBusy = isCheckingUpdate || isLoading || isAppVersionLoading;
  const isButtonDisabled = isBusy || !currentVersion;

  return (
    <Button variant="outline" onClick={() => void checkForUpdates()} disabled={isButtonDisabled}>
      <RefreshCwIcon className={`mr-2 h-4 w-4 ${isBusy ? "animate-spin" : ""}`} />
      {isBusy ? "Checking..." : "Check for Updates"}
    </Button>
  );
}
