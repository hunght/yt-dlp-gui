import React, { useState, useRef, useCallback, useEffect } from "react";
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

  const [activeSegIndex, setActiveSegIndex] = useState<number | null>(null);
  const [followPlayback, setFollowPlayback] = useState<boolean>(true);
  const [isSelecting, setIsSelecting] = useState<boolean>(false);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const segRefs = useRef<Array<HTMLParagraphElement | null>>([]);
  const isSnappingRef = useRef<boolean>(false);

  // Snap selection to word boundaries
  const snapToWordBoundaries = useCallback(() => {
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

  // Track selection state and snap to word boundaries
  useEffect(() => {
    const handleSelectionChange = () => {
      if (!transcriptContainerRef.current) return;

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        setIsSelecting(false);
        return;
      }

      // Check if selection is within transcript container
      const range = selection.getRangeAt(0);
      const container = transcriptContainerRef.current;

      if (container.contains(range.commonAncestorContainer)) {
        // Set selecting state if there's an active selection
        const hasSelection = !range.collapsed && selection.toString().trim().length > 0;
        setIsSelecting(hasSelection);

        // Snap to word boundaries after a brief delay
        if (hasSelection) {
          setTimeout(() => snapToWordBoundaries(), 10);
        }
      } else {
        setIsSelecting(false);
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [snapToWordBoundaries]);

  // Active segment index based on current time (freeze when selecting)
  useEffect(() => {
    if (!segments.length) {
      setActiveSegIndex(null);
      return;
    }
    // Don't update active segment while user is selecting text
    if (isSelecting) return;

    const idx = segments.findIndex((s) => currentTime >= s.start && currentTime < s.end);
    setActiveSegIndex(idx >= 0 ? idx : null);
  }, [currentTime, segments, isSelecting]);

  // Scroll active segment into view (freeze when selecting)
  useEffect(() => {
    if (activeSegIndex == null || !followPlayback) return;
    // Don't auto-scroll while user is selecting text
    if (isSelecting) return;

    const el = segRefs.current[activeSegIndex];
    const cont = transcriptContainerRef.current;
    if (!el || !cont) return;
    const elTop = el.offsetTop;
    const targetScroll = Math.max(0, elTop - cont.clientHeight * 0.3);
    cont.scrollTo({ top: targetScroll, behavior: "smooth" });
  }, [activeSegIndex, followPlayback, isSelecting]);

  // Handle mousedown to detect selection start
  const handleMouseDown = () => {
    // Set a flag that selection might be starting
    // The actual selection state will be updated by selectionchange listener
  };

  // Handle mouseup to finalize selection
  const handleMouseUp = () => {
    // Let the selectionchange event handle the state update
    // This is just to ensure we capture the end of selection
  };

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
        onMouseDown={segments.length > 0 ? handleMouseDown : undefined}
        onMouseUp={segments.length > 0 ? (e) => { handleMouseUp(); onSelect(); } : undefined}
        onKeyDown={segments.length > 0 ? handleTranscriptKeyDown : undefined}
        tabIndex={segments.length > 0 ? 0 : undefined}
        style={{
          userSelect: segments.length > 0 ? "text" : "none",
          cursor: isSelecting ? "text" : "default",
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
        <p className="text-xs text-muted-foreground italic">
          💡 Select text to look up in dictionary or create notes
        </p>
      )}
      {/* Controls at bottom for better focus */}
      <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t">
        {/* Language selector - filtered to user's preferred languages */}
        {transcript.filteredLanguages.length > 0 && (
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-muted-foreground">Language:</label>
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
          </div>
        )}

        {/* Follow playback toggle */}
        <div className="flex items-center gap-1.5">
          <Switch id="follow-playback" checked={followPlayback} onCheckedChange={setFollowPlayback} />
          <label htmlFor="follow-playback" className="text-xs text-muted-foreground">Auto-scroll</label>
          {isSelecting && (
            <span className="text-[10px] text-blue-500 font-medium">(paused)</span>
          )}
        </div>

        {/* Transcript Settings Button */}
        <Button size="sm" variant="outline" onClick={onSettingsClick} className="h-7">
          <SettingsIcon className="w-3.5 h-3.5 mr-1.5" />
          <span className="text-xs">Settings</span>
        </Button>

        {/* Manual download fallback */}
        {!transcriptData && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => transcript.downloadTranscriptMutation.mutate()}
            disabled={transcript.downloadTranscriptMutation.isPending}
            className="h-7"
          >
            <span className="text-xs">
              {transcript.downloadTranscriptMutation.isPending ? "Downloading…" : "Download"}
            </span>
          </Button>
        )}

        {/* Status indicators */}
        <div className="flex items-center gap-3">
          {/* Tiny loader (non-blocking) when fetching or downloading */}
          {(transcript.transcriptQuery.isFetching || transcript.transcriptSegmentsQuery.isFetching || transcript.downloadTranscriptMutation.isPending) && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
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
                return <span className="text-[10px] text-amber-500">retry in ~{mins}m</span>;
              }
            } catch {}
            return null;
          })()}


        </div>
      </div>


    </div>
  );
}
