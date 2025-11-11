import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { logger } from "@/helpers/logger";

/**
 * YtDlpInstaller - Ensures yt-dlp binary is installed on app startup.
 * Checks for installation status and automatically downloads if needed.
 */
export const YtDlpInstaller = () => {
  // Query to check if yt-dlp is installed
  const { data: installInfo, isLoading: isCheckingInstall } = useQuery({
    queryKey: ["ytdlp", "installInfo"],
    queryFn: () => trpcClient.binary.getInstallInfo.query(),
    staleTime: Infinity, // Only check once per app session
    refetchOnWindowFocus: false,
  });

  // Mutation to download yt-dlp
  const downloadMutation = useMutation({
    mutationFn: () => trpcClient.binary.downloadLatest.mutate(),
    onSuccess: (result) => {
      if (result.success) {
        logger.info("[YtDlpInstaller] Successfully installed yt-dlp", {
          version: result.version,
          path: result.path,
          alreadyInstalled: result.alreadyInstalled,
        });
      } else {
        logger.error("[YtDlpInstaller] Failed to install yt-dlp", {
          message: result.message,
        });
      }
    },
    onError: (error) => {
      logger.error("[YtDlpInstaller] Download mutation failed", error);
    },
  });

  // Auto-download when we detect yt-dlp is not installed
  useEffect(() => {
    if (isCheckingInstall) return;

    if (installInfo && !installInfo.installed) {
      logger.info("[YtDlpInstaller] yt-dlp not found, starting download...");
      downloadMutation.mutate();
    } else if (installInfo?.installed) {
      logger.info("[YtDlpInstaller] yt-dlp already installed", {
        version: installInfo.version,
        path: installInfo.path,
      });
    }
  }, [installInfo, isCheckingInstall]);

  // This component doesn't render anything - it just handles the installation logic
  return null;
};
