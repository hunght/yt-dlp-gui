import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollTextIcon } from "lucide-react";
import { trpcClient } from "@/utils/trpc";
import { LogViewerModal } from "./LogViewerModal";

export function AboutSection(): React.JSX.Element {
  const [logContent, setLogContent] = useState<string>("");
  const [isLogDialogOpen, setIsLogDialogOpen] = useState(false);

  const handleOpenLogFile = async (): Promise<void> => {
    try {
      const content = await trpcClient.utils.getLogFileContent.query();
      setLogContent(content);
      setIsLogDialogOpen(true);
    } catch (error) {
      // Error will be shown in UI if needed
    }
  };

  const handleRefreshLogs = async (): Promise<void> => {
    try {
      const content = await trpcClient.utils.getLogFileContent.query();
      setLogContent(content);
    } catch (error) {
      // Error will be shown in UI if needed
    }
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
        logContent={logContent}
        onRefresh={handleRefreshLogs}
      />
    </>
  );
}
