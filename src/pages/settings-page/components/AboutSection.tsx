import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollTextIcon } from "lucide-react";
import { trpcClient } from "@/utils/trpc";
import { LogViewerModal } from "./LogViewerModal";

interface LogFileInfo {
  content: string;
  path: string | null;
  exists: boolean;
}

export function AboutSection(): React.JSX.Element {
  const [logInfo, setLogInfo] = useState<LogFileInfo>({
    content: "",
    path: null,
    exists: false,
  });
  const [isLogDialogOpen, setIsLogDialogOpen] = useState(false);

  const loadLogFile = async (): Promise<void> => {
    try {
      const result = await trpcClient.utils.getLogFileContent.query();
      setLogInfo(result);
    } catch (error) {
      // Error will be shown in UI if needed
    }
  };

  const handleOpenLogFile = async (): Promise<void> => {
    await loadLogFile();
    setIsLogDialogOpen(true);
  };

  const handleRefreshLogs = async (): Promise<void> => {
    await loadLogFile();
  };

  return (
    <>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>About LearnifyTube</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleOpenLogFile}>
                <ScrollTextIcon className="mr-2 h-4 w-4" />
                View Logs
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <LogViewerModal
        open={isLogDialogOpen}
        onOpenChange={setIsLogDialogOpen}
        logContent={logInfo.content}
        logFilePath={logInfo.path}
        logFileExists={logInfo.exists}
        onRefresh={handleRefreshLogs}
      />
    </>
  );
}
