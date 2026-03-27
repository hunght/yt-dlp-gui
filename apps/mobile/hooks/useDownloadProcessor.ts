import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useDownloadStore } from "../stores/downloads";
import { useConnectionStore } from "../stores/connection";
import { downloadManager } from "../services/downloadManager";

function getQueueCounts(queue: ReturnType<typeof useDownloadStore.getState>["queue"]) {
  let queuedCount = 0;
  let activeCount = 0;

  for (const item of queue) {
    if (item.status === "queued") {
      queuedCount += 1;
    } else if (item.status === "downloading") {
      activeCount += 1;
    }
  }

  return { queuedCount, activeCount };
}

export function useDownloadProcessor() {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const serverUrlRef = useRef(useConnectionStore.getState().serverUrl);

  // Handle app state changes
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        const { queuedCount, activeCount } = getQueueCounts(useDownloadStore.getState().queue);
        if (serverUrlRef.current && (queuedCount > 0 || activeCount > 0)) {
          downloadManager.processQueue();
        }
      }

      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const unsubscribeConnection = useConnectionStore.subscribe((state) => {
      const previousServerUrl = serverUrlRef.current;
      serverUrlRef.current = state.serverUrl;

      if (!previousServerUrl && state.serverUrl && appStateRef.current === "active") {
        const { queuedCount, activeCount } = getQueueCounts(useDownloadStore.getState().queue);
        if (queuedCount > 0 || activeCount > 0) {
          downloadManager.processQueue();
        }
      }
    });

    const unsubscribeQueue = useDownloadStore.subscribe((state, previousState) => {
      if (!serverUrlRef.current || appStateRef.current !== "active") {
        return;
      }

      const currentCounts = getQueueCounts(state.queue);
      const previousCounts = getQueueCounts(previousState.queue);
      if (
        currentCounts.queuedCount === previousCounts.queuedCount &&
        currentCounts.activeCount === previousCounts.activeCount
      ) {
        return;
      }

      if (currentCounts.queuedCount > 0 || currentCounts.activeCount > 0) {
        downloadManager.processQueue();
      }
    });

    const { queuedCount, activeCount } = getQueueCounts(useDownloadStore.getState().queue);
    if (serverUrlRef.current && appStateRef.current === "active" && (queuedCount > 0 || activeCount > 0)) {
      downloadManager.processQueue();
    }

    return () => {
      unsubscribeConnection();
      unsubscribeQueue();
    };
  }, []);
}
