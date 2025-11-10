import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ScrollTextIcon } from "lucide-react";
import { trpcClient } from "@/utils/trpc";

export function AboutSection() {
  const [logContent, setLogContent] = useState<string>("");
  const [isLogDialogOpen, setIsLogDialogOpen] = useState(false);

  const handleOpenLogFile = async () => {
    try {
      const content = await trpcClient.utils.getLogFileContent.query();
      setLogContent(content);
      setIsLogDialogOpen(true);
    } catch (error) {
      // Error will be shown in UI if needed
    }
  };

  return (
    <>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>About yt-dlp-gui</CardTitle>
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

      <Dialog open={isLogDialogOpen} onOpenChange={setIsLogDialogOpen}>
        <DialogContent className="max-h-[90vh] w-full max-w-[95vw]">
          <DialogHeader>
            <DialogTitle>Application Logs</DialogTitle>
            <DialogDescription>
              View and review application logs for debugging and troubleshooting
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[75vh] w-full rounded-md border p-4">
            <div className="w-full">
              <pre className="whitespace-pre-wrap break-words font-mono text-xs">{logContent}</pre>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
