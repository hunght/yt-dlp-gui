import React from "react";
import { FileText, Settings as SettingsIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useTranscript } from "../hooks/useTranscript";

type TranscriptHookReturn = ReturnType<typeof useTranscript>;

interface TranscriptPanelProps {
  videoId: string;
  currentTime: number;
  videoRef: React.RefObject<HTMLVideoElement>;
  transcript: TranscriptHookReturn;
  fontFamily: "system" | "serif" | "mono";
  fontSize: number;
  onSettingsClick: () => void;
  onSelect: () => void;
  onEnterKey?: () => void;
}

export function TranscriptPanel({
  videoId,
  currentTime,
  videoRef,
  transcript,
  fontFamily,
  fontSize,
  onSettingsClick,
  onSelect,
  onEnterKey,
}: TranscriptPanelProps) {
  const segments = ((transcript.transcriptSegmentsQuery.data as any)?.segments ?? []) as Array<{
    start: number;
    end: number;
    text: string;
  }>;

  const [activeSegIndex, setActiveSegIndex] = React.useState<number | null>(null);
  const [followPlayback, setFollowPlayback] = React.useState<boolean>(true);
  const transcriptContainerRef = React.useRef<HTMLDivElement>(null);
  const segRefs = React.useRef<Array<HTMLParagraphElement | null>>([]);
  const isSnappingRef = React.useRef<boolean>(false);

  // Snap selection to word boundaries
  const snapToWordBoundaries = React.useCallback(() => {
    if (isSnappingRef.current) return; // Prevent infinite loop

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (range.collapsed) return; // No selection

    try {
      isSnappingRef.current = true;

      const startContainer = range.startContainer;
      const endContainer = range.endContainer;

      // Function to expand to word boundary
      const expandToWordBoundary = (container: Node, offset: number, isStart: boolean): { container: Node; offset: number } => {
        if (container.nodeType === Node.TEXT_NODE && container.textContent) {
          const text = container.textContent;
          let newOffset = offset;

          if (isStart) {
            // Move backwards to find word start
            while (newOffset > 0 && /\S/.test(text[newOffset - 1])) {
              newOffset--;
            }
          } else {
            // Move forwards to find word end
            while (newOffset < text.length && /\S/.test(text[newOffset])) {
              newOffset++;
            }
          }

          return { container, offset: newOffset };
        }

        return { container, offset };
      };

      // Expand start to word boundary
      const newStart = expandToWordBoundary(startContainer, range.startOffset, true);

      // Expand end to word boundary
      const newEnd = expandToWordBoundary(endContainer, range.endOffset, false);

      // Create new range with expanded boundaries
      const newRange = document.createRange();
      newRange.setStart(newStart.container, newStart.offset);
      newRange.setEnd(newEnd.container, newEnd.offset);

      // Apply new range
      selection.removeAllRanges();
      selection.addRange(newRange);
    } catch (e) {
      // Ignore errors
    } finally {
      isSnappingRef.current = false;
    }
  }, []);

  // Listen for selection changes to snap to word boundaries
  React.useEffect(() => {
    const handleSelectionChange = () => {
      if (!transcriptContainerRef.current) return;

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      // Check if selection is within transcript container
      const range = selection.getRangeAt(0);
      const container = transcriptContainerRef.current;

      if (container.contains(range.commonAncestorContainer)) {
        // Snap to word boundaries after a brief delay
        setTimeout(() => snapToWordBoundaries(), 10);
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [snapToWordBoundaries]);

  // Active segment index based on current time
  React.useEffect(() => {
    if (!segments.length) {
      setActiveSegIndex(null);
      return;
    }
    const idx = segments.findIndex((s) => currentTime >= s.start && currentTime < s.end);
    setActiveSegIndex(idx >= 0 ? idx : null);
  }, [currentTime, segments]);

  // Scroll active segment into view
  React.useEffect(() => {
    if (activeSegIndex == null || !followPlayback) return;
    const el = segRefs.current[activeSegIndex];
    const cont = transcriptContainerRef.current;
    if (!el || !cont) return;
    const elTop = el.offsetTop;
    const targetScroll = Math.max(0, elTop - cont.clientHeight * 0.3);
    cont.scrollTo({ top: targetScroll, behavior: "smooth" });
  }, [activeSegIndex, followPlayback]);

  // Keyboard navigation within transcript container
  const handleTranscriptKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!segments.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = activeSegIndex == null ? 0 : Math.min(segments.length - 1, activeSegIndex + 1);
      const t = segments[next].start + 0.05;
      if (videoRef.current) {
        videoRef.current.currentTime = t;
        videoRef.current.pause();
      }
      setActiveSegIndex(next);
      setFollowPlayback(false);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = activeSegIndex == null ? 0 : Math.max(0, activeSegIndex - 1);
      const t = segments[prev].start + 0.05;
      if (videoRef.current) {
        videoRef.current.currentTime = t;
        videoRef.current.pause();
      }
      setActiveSegIndex(prev);
      setFollowPlayback(false);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const idx = activeSegIndex ?? 0;
      const t = segments[idx]?.start ?? 0;
      if (videoRef.current) {
        videoRef.current.currentTime = t;
        videoRef.current.pause();
      }
      // Open annotation form at current time
      if (onEnterKey) {
        onEnterKey();
      }
      return;
    }
  };

  const transcriptData = transcript.transcriptQuery.data as any;
  const effectiveLang = transcript.selectedLang ?? (transcriptData?.language as string | undefined);

  return (
    <div className="lg:col-span-2 space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-muted-foreground" />
        <h3 className="font-semibold text-base">Transcript</h3>
        <div className="ml-auto flex items-center gap-2">
          {/* Language selector - filtered to user's preferred languages */}
          {transcript.filteredLanguages.length > 0 && (
            <>
              <label className="text-xs text-muted-foreground">Lang</label>
              <select
                className="text-xs border rounded px-2 py-1 bg-background hover:bg-muted/30"
                value={transcript.selectedLang ?? effectiveLang ?? ""}
                onChange={(e) => transcript.setSelectedLang(e.target.value)}
                disabled={transcript.availableSubsQuery.isLoading || transcript.downloadTranscriptMutation.isPending}
              >
                {transcript.filteredLanguages.map((l: any) => (
                  <option key={l.lang} value={l.lang}>
                    {l.lang}{l.hasManual ? "" : " (auto)"}
                  </option>
                ))}
                {transcript.filteredLanguages.length === 0 && (
                  <option value={effectiveLang ?? "en"}>{effectiveLang ?? "en"}</option>
                )}
              </select>
            </>
          )}
          {/* Follow playback toggle */}
          <div className="flex items-center gap-1 pl-2">
            <Switch id="follow-playback" checked={followPlayback} onCheckedChange={setFollowPlayback} />
            <label htmlFor="follow-playback" className="text-xs text-muted-foreground">Follow</label>
          </div>
          {/* Transcript Settings Button */}
          <Button size="sm" variant="outline" onClick={onSettingsClick}>
            <SettingsIcon className="w-3.5 h-3.5 mr-1" />
            Settings
          </Button>
          {/* Lines count */}
          <span className="text-xs text-muted-foreground">
            {segments.length} {segments.length === 1 ? "line" : "lines"}
          </span>

          {/* Tiny loader (non-blocking) when fetching or downloading */}
          {(transcript.transcriptQuery.isFetching || transcript.transcriptSegmentsQuery.isFetching || transcript.downloadTranscriptMutation.isPending) && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground px-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Updating…
            </span>
          )}

          {/* Cooldown badge when rate-limited for this video/language */}
          {(() => {
            try {
              const key = `${videoId}|${transcript.selectedLang ?? "__default__"}`;
              const raw = localStorage.getItem("transcript-download-cooldowns");
              const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
              const until = map[key];
              if (until && Date.now() < until) {
                const mins = Math.max(1, Math.ceil((until - Date.now()) / 60000));
                return <span className="ml-1 text-[10px] text-amber-500">retry in ~{mins}m</span>;
              }
            } catch {}
            return null;
          })()}

          {/* Manual download fallback */}
          {!transcriptData && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => transcript.downloadTranscriptMutation.mutate()}
              disabled={transcript.downloadTranscriptMutation.isPending}
            >
              {transcript.downloadTranscriptMutation.isPending ? "Downloading…" : "Download"}
            </Button>
          )}
        </div>
      </div>
      <style>
        {`
          .transcript-text::selection {
            background-color: rgba(59, 130, 246, 0.3);
            color: inherit;
          }
        `}
      </style>
      <div
        className="relative p-6 rounded-lg border bg-gradient-to-br from-background to-muted/20 h-[150px] flex items-end justify-center overflow-hidden shadow-sm"
        ref={transcriptContainerRef}
        onMouseUp={segments.length > 0 ? onSelect : undefined}
        onKeyDown={segments.length > 0 ? handleTranscriptKeyDown : undefined}
        tabIndex={segments.length > 0 ? 0 : undefined}
        style={{
          userSelect: segments.length > 0 ? "text" : "none",
        }}
      >
        {segments.length > 0 ? (
          <div className="w-full text-center space-y-1 pb-4">
            {/* Show previous 2 lines in faded color for context */}
            {activeSegIndex !== null && activeSegIndex > 1 && segments[activeSegIndex - 2] && (
              <p
                className="text-foreground/30 cursor-text px-4 transcript-text"
                style={{
                  fontFamily:
                    fontFamily === "serif"
                      ? "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif"
                      : fontFamily === "mono"
                      ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
                      : "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, 'Apple Color Emoji', 'Segoe UI Emoji'",
                  fontSize: `${fontSize - 2}px`,
                  lineHeight: '1.5',
                }}
              >
                {segments[activeSegIndex - 2].text}
              </p>
            )}
            {/* Show previous line in lighter color */}
            {activeSegIndex !== null && activeSegIndex > 0 && segments[activeSegIndex - 1] && (
              <p
                className="text-foreground/50 cursor-text px-4 transcript-text"
                style={{
                  fontFamily:
                    fontFamily === "serif"
                      ? "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif"
                      : fontFamily === "mono"
                      ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
                      : "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, 'Apple Color Emoji', 'Segoe UI Emoji'",
                  fontSize: `${fontSize - 1}px`,
                  lineHeight: '1.5',
                }}
              >
                {segments[activeSegIndex - 1].text}
              </p>
            )}
            {/* Show current line (active) */}
            {activeSegIndex !== null && segments[activeSegIndex] && (
              <p
                ref={(el) => (segRefs.current[activeSegIndex] = el)}
                className="text-foreground font-semibold cursor-text px-4 leading-relaxed transcript-text"
                style={{
                  fontFamily:
                    fontFamily === "serif"
                      ? "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif"
                      : fontFamily === "mono"
                      ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
                      : "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, 'Apple Color Emoji', 'Segoe UI Emoji'",
                  fontSize: `${fontSize}px`,
                  lineHeight: '1.6',
                }}
                data-start={segments[activeSegIndex].start}
                data-end={segments[activeSegIndex].end}
              >
                {segments[activeSegIndex].text}
              </p>
            )}
          </div>
        ) : (
          <div className="py-10 text-center space-y-2">
            <p className="text-sm text-muted-foreground italic">No transcript available for the selected language.</p>
            <div className="flex items-center justify-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => transcript.downloadTranscriptMutation.mutate()}
                disabled={transcript.downloadTranscriptMutation.isPending}
              >
                {transcript.downloadTranscriptMutation.isPending ? "Downloading…" : "Try Download"}
              </Button>
              <Button size="sm" onClick={onSettingsClick}>Change Language</Button>
            </div>
          </div>
        )}
        <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-background to-transparent pointer-events-none rounded-t-lg" />
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background to-transparent pointer-events-none rounded-b-lg" />
      </div>
      {segments.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Select text to look up in dictionary or create annotations and notes
        </p>
      )}
    </div>
  );
}
