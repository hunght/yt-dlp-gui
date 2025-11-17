import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CopyIcon,
  DownloadIcon,
  SearchIcon,
  XCircleIcon,
  RefreshCwIcon,
  CheckIcon,
  FilterIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { logger } from "@/helpers/logger";

type LogLevel = "error" | "warning" | "info" | "debug" | "success" | "other";
type FilterLevel = LogLevel | "all";

const isFilterLevel = (value: string): value is FilterLevel => {
  return ["all", "error", "warning", "info", "debug", "success", "other"].includes(value);
};

interface LogViewerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  logContent: string;
  logFilePath?: string | null;
  logFileExists?: boolean;
  onRefresh?: () => Promise<void>;
}

interface LogLine {
  line: string;
  className: string;
  level: LogLevel;
}

export function LogViewerModal({
  open,
  onOpenChange,
  logContent,
  logFilePath,
  logFileExists,
  onRefresh,
}: LogViewerModalProps): React.JSX.Element {
  const [searchTerm, setSearchTerm] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  const [isPathCopied, setIsPathCopied] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<FilterLevel>("all");

  // Reset search when dialog closes
  useEffect(() => {
    if (!open) {
      setSearchTerm("");
      setIsCopied(false);
      setIsPathCopied(false);
    }
  }, [open]);

  // Parse and highlight log content with level detection
  const parsedContent = useMemo((): LogLine[] => {
    if (!logContent) return [];

    const lines = logContent.split("\n");
    return lines.map((line) => {
      const lowerLine = line.toLowerCase();
      let className = "text-muted-foreground";
      let level: LogLevel = "other";

      // Detect log level and apply appropriate styling
      if (lowerLine.includes("error") || lowerLine.includes("err:")) {
        className = "text-red-500 font-medium";
        level = "error";
      } else if (lowerLine.includes("warn") || lowerLine.includes("warning")) {
        className = "text-yellow-500 font-medium";
        level = "warning";
      } else if (lowerLine.includes("info") || lowerLine.includes("inf:")) {
        className = "text-blue-500";
        level = "info";
      } else if (lowerLine.includes("debug") || lowerLine.includes("dbg:")) {
        className = "text-gray-400";
        level = "debug";
      } else if (lowerLine.includes("success")) {
        className = "text-green-500 font-medium";
        level = "success";
      }

      return { line, className, level };
    });
  }, [logContent]);

  // Filter content based on search and log level
  const filteredContent = useMemo(() => {
    let filtered = parsedContent;

    // Filter by log level (if not "all")
    if (selectedLevel !== "all") {
      filtered = filtered.filter(({ level }) => level === selectedLevel);
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(({ line }) =>
        line.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Add search highlight to filtered content
    return filtered.map(({ line, className, level }) => ({
      line,
      className:
        searchTerm && line.toLowerCase().includes(searchTerm.toLowerCase())
          ? `${className} bg-yellow-500/20`
          : className,
      level,
    }));
  }, [parsedContent, searchTerm, selectedLevel]);

  // Get filtered log text for copy/download
  const filteredLogText = useMemo(() => {
    return filteredContent.map(({ line }) => line).join("\n");
  }, [filteredContent]);

  const handleCopyToClipboard = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(filteredLogText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      logger.error("Failed to copy to clipboard:", error);
    }
  };

  const handleCopyFilePath = async (): Promise<void> => {
    if (!logFilePath) return;
    try {
      await navigator.clipboard.writeText(logFilePath);
      setIsPathCopied(true);
      setTimeout(() => setIsPathCopied(false), 2000);
    } catch (error) {
      logger.error("Failed to copy log file path:", error);
    }
  };

  const handleDownloadLog = (): void => {
    const blob = new Blob([filteredLogText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `learnifytube-logs-${new Date().toISOString().split("T")[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRefresh = async (): Promise<void> => {
    if (!onRefresh) return;

    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleClearSearch = (): void => {
    setSearchTerm("");
  };

  const logLevelConfig = [
    { level: "all", label: "All Logs", color: "text-foreground" },
    { level: "error", label: "Error", color: "text-red-500" },
    { level: "warning", label: "Warning", color: "text-yellow-500" },
    { level: "info", label: "Info", color: "text-blue-500" },
    { level: "success", label: "Success", color: "text-green-500" },
    { level: "debug", label: "Debug", color: "text-gray-400" },
    { level: "other", label: "Other", color: "text-muted-foreground" },
  ];

  const isFiltered = selectedLevel !== "all";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-[95vw] flex-col gap-0 p-0">
        <DialogHeader className="space-y-3 px-6 pb-4 pt-6">
          <DialogTitle className="text-2xl">Application Logs</DialogTitle>
          <DialogDescription>
            View and review application logs for debugging and troubleshooting
          </DialogDescription>

          {/* Log Path */}
          <div className="space-y-1 rounded-md border bg-muted/40 px-3 py-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/90">
                Log file location
              </span>
              {logFilePath && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyFilePath}
                  className="h-7 gap-1 px-2 text-xs"
                >
                  {isPathCopied ? (
                    <>
                      <CheckIcon className="h-3.5 w-3.5" />
                      Copied
                    </>
                  ) : (
                    <>
                      <CopyIcon className="h-3.5 w-3.5" />
                      Copy path
                    </>
                  )}
                </Button>
              )}
            </div>
            {logFilePath ? (
              <code className="block break-all font-mono text-xs text-foreground">
                {logFilePath}
              </code>
            ) : (
              <span className="text-muted-foreground">
                Log file path unavailable in this environment.
              </span>
            )}
            {logFilePath && logFileExists === false && (
              <span className="text-[11px] text-amber-600">
                File not found yet — perform an action to generate logs, then refresh.
              </span>
            )}
          </div>

          {/* Action Bar */}
          <div className="flex flex-col gap-2 pt-2 sm:flex-row">
            {/* Search Input */}
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search logs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-9"
              />
              {searchTerm && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearSearch}
                  className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
                >
                  <XCircleIcon className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              {/* Filter Button */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn("relative gap-2", isFiltered && "border-primary")}
                  >
                    <FilterIcon className={cn("h-4 w-4", isFiltered && "text-primary")} />
                    <span className="hidden sm:inline">
                      {isFiltered
                        ? logLevelConfig.find((c) => c.level === selectedLevel)?.label
                        : "Filter"}
                    </span>
                    {isFiltered && (
                      <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                        ✓
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56" align="end">
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium">Filter by Log Level</h4>
                    <RadioGroup
                      value={selectedLevel}
                      onValueChange={(value) => {
                        if (isFilterLevel(value)) {
                          setSelectedLevel(value);
                        }
                      }}
                    >
                      <div className="space-y-2">
                        {logLevelConfig.map(({ level, label, color }) => (
                          <div key={level} className="flex items-center space-x-2">
                            <RadioGroupItem value={level} id={`filter-${level}`} />
                            <Label
                              htmlFor={`filter-${level}`}
                              className={cn("flex-1 cursor-pointer text-sm font-normal", color)}
                            >
                              {label}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </RadioGroup>
                  </div>
                </PopoverContent>
              </Popover>

              {onRefresh && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="gap-2"
                >
                  <RefreshCwIcon className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
                  <span className="hidden sm:inline">Refresh</span>
                </Button>
              )}

              <Button variant="outline" size="sm" onClick={handleCopyToClipboard} className="gap-2">
                {isCopied ? (
                  <>
                    <CheckIcon className="h-4 w-4" />
                    <span className="hidden sm:inline">Copied!</span>
                  </>
                ) : (
                  <>
                    <CopyIcon className="h-4 w-4" />
                    <span className="hidden sm:inline">Copy</span>
                  </>
                )}
              </Button>

              <Button variant="outline" size="sm" onClick={handleDownloadLog} className="gap-2">
                <DownloadIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Download</span>
              </Button>
            </div>
          </div>

          {/* Filter and Search Results Info */}
          {(searchTerm || isFiltered) && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {isFiltered && (
                <span className="flex items-center gap-1">
                  Filtered to{" "}
                  <span className="font-medium text-primary">
                    {logLevelConfig.find((c) => c.level === selectedLevel)?.label}
                  </span>
                </span>
              )}
              {searchTerm && (
                <span>
                  {isFiltered && "•"} Found {filteredContent.length} matching{" "}
                  {filteredContent.length === 1 ? "line" : "lines"}
                </span>
              )}
              {parsedContent.length > 0 && (
                <span>
                  • Showing {filteredContent.length} of {parsedContent.length} total lines
                </span>
              )}
            </div>
          )}
        </DialogHeader>

        {/* Log Content */}
        <div className="min-h-0 flex-1 px-6 pb-6">
          <ScrollArea className="h-[60vh] w-full rounded-md border bg-muted/30">
            <div className="p-4">
              {filteredContent.length > 0 ? (
                <pre className="font-mono text-xs leading-relaxed">
                  {filteredContent.map(({ line, className }, index) => (
                    <div key={index} className={cn("py-0.5", className)}>
                      {line}
                    </div>
                  ))}
                </pre>
              ) : logContent ? (
                <div className="flex h-40 items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <SearchIcon className="mx-auto mb-2 h-10 w-10 opacity-50" />
                    <p>No logs match your search</p>
                  </div>
                </div>
              ) : (
                <div className="flex h-40 items-center justify-center text-muted-foreground">
                  <p>No logs available</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
