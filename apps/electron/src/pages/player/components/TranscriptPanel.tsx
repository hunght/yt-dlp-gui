import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { FileText, Settings as SettingsIcon, Loader2, ChevronDown, ChevronUp, BookmarkPlus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useTranscript } from "../hooks/useTranscript";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { useAtom } from "jotai";
import { showInlineTranslationsAtom, translationTargetLangAtom } from "@/context/transcriptSettings";
import { toast } from "sonner";

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
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
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
  isCollapsed = false,
  onToggleCollapse,
}: TranscriptPanelProps) {
  const segments = ((transcript.transcriptSegmentsQuery.data as any)?.segments ?? []) as Array<{
    start: number;
    end: number;
    text: string;
  }>;

  const [showInlineTranslations] = useAtom(showInlineTranslationsAtom);
  const [translationTargetLang] = useAtom(translationTargetLangAtom);
  const [activeSegIndex, setActiveSegIndex] = useState<number | null>(null);
  const [followPlayback, setFollowPlayback] = useState<boolean>(true);
  const [isSelecting, setIsSelecting] = useState<boolean>(false);
  const [isHovering, setIsHovering] = useState<boolean>(false);
  const [hoveredWord, setHoveredWord] = useState<string | null>(null);
  const [isHoveringTooltip, setIsHoveringTooltip] = useState<boolean>(false);
  const [hoverTranslation, setHoverTranslation] = useState<{ word: string; translation: string; translationId: string; loading: boolean; saved?: boolean } | null>(null);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const segRefs = useRef<Array<HTMLParagraphElement | null>>([]);
  const isSnappingRef = useRef<boolean>(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const translateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const queryClient = useQueryClient();

  // Mutation for saving words to My Words
  const saveWordMutation = useMutation({
    mutationFn: async (translationId: string) => {
      return await trpcClient.translation.saveWord.mutate({ translationId });
    },
    onSuccess: (data) => {
      // Update the hover translation to show it's saved
      setHoverTranslation(prev => prev ? { ...prev, saved: true } : null);

      // Show success toast
      toast.success(data.alreadySaved ? "Word already in My Words" : "Word saved to My Words! 📚");

      // Invalidate saved words queries to refresh transcript highlights and MyWords page
      queryClient.invalidateQueries({ queryKey: ["saved-words"] });
      queryClient.invalidateQueries({ queryKey: ["saved-words-all"] });
    },
    onError: (error) => {
      toast.error("Failed to save word: " + String(error));
    },
  });

  // Fetch all saved words (for inline highlighting across all videos)
  const { data: savedWords } = useQuery({
    queryKey: ["saved-words-all"],
    queryFn: async () => {
      return await trpcClient.translation.getAllSavedWords.query();
    },
    enabled: showInlineTranslations,
    staleTime: 60000, // Cache for 1 minute - saved words may change when user adds/removes
  });

  // Build efficient lookup map for saved words (memoized)
  const translationMap = useMemo(() => {
    if (!savedWords || !showInlineTranslations) return new Map();

    const map = new Map<string, { translatedText: string; targetLang: string; queryCount: number }>();

    savedWords.forEach(t => {
      // Index by exact match (lowercase, trimmed)
      const cleanSource = t.sourceText.toLowerCase().trim();
      map.set(cleanSource, {
        translatedText: t.translatedText,
        targetLang: t.targetLang,
        queryCount: t.queryCount,
      });

      // Also index without punctuation for better matching
      const noPunctuation = t.sourceText.replace(/[.,!?;:'"()\[\]{}]/g, '').toLowerCase().trim();
      if (noPunctuation !== cleanSource && noPunctuation.length > 0) {
        map.set(noPunctuation, {
          translatedText: t.translatedText,
          targetLang: t.targetLang,
          queryCount: t.queryCount,
        });
      }
    });

    return map;
  }, [savedWords, showInlineTranslations]);

  // Get translation for a word (O(1) lookup)
  const getTranslationForWord = useCallback((word: string) => {
    if (!showInlineTranslations || translationMap.size === 0) return null;

    const cleanWord = word.toLowerCase().trim();
    let translation = translationMap.get(cleanWord);

    // If not found, try without punctuation
    if (!translation) {
      const noPunctuation = word.replace(/[.,!?;:'"()\[\]{}]/g, '').toLowerCase().trim();
      translation = translationMap.get(noPunctuation);
    }

    return translation;
  }, [translationMap, showInlineTranslations]);

  // Handle word hover with debouncing and automatic translation
  const handleWordMouseEnter = async (word: string) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    if (translateTimeoutRef.current) {
      clearTimeout(translateTimeoutRef.current);
    }

    setHoveredWord(word);
    setIsHovering(true);

    // Check if word already has a translation in cache
    const existingTranslation = getTranslationForWord(word);
    if (existingTranslation) {
      // Already translated, no need to call API
      return;
    }

    // Clean the word (remove punctuation)
    const cleanWord = word.replace(/[.,!?;:'"()\[\]{}]/g, '').trim();
    if (!cleanWord || cleanWord.length < 2) return;

    // Set up timer to trigger translation after 800ms of hovering
    translateTimeoutRef.current = setTimeout(async () => {
      try {
        // Show loading state
        setHoverTranslation({ word: cleanWord, translation: '', translationId: '', loading: true });

        // Get current timestamp for context
        const timestamp = activeSegIndex !== null && segments[activeSegIndex]
          ? segments[activeSegIndex].start
          : currentTime;

        // Get context text (current segment)
        const contextText = activeSegIndex !== null && segments[activeSegIndex]
          ? segments[activeSegIndex].text
          : '';

        // Call translation API (this will cache it automatically)
        const result = await trpcClient.utils.translateText.query({
          text: cleanWord,
          targetLang: translationTargetLang, // From transcript settings atom
          sourceLang: 'auto', // Auto-detect source language
          videoId,
          timestampSeconds: Math.floor(timestamp),
          contextText,
        });

        if (result.success && result.translation && result.translationId) {
          setHoverTranslation({
            word: cleanWord,
            translation: result.translation,
            translationId: result.translationId, // Get translationId from response
            loading: false,
            saved: false,
          });
        } else {
          setHoverTranslation(null);
        }
      } catch (error) {
        console.error('Translation failed:', error);
        setHoverTranslation(null);
      }
    }, 800); // 800ms hover delay before translation
  };

  const handleWordMouseLeave = () => {
    // Clear translation timer if user stops hovering
    if (translateTimeoutRef.current) {
      clearTimeout(translateTimeoutRef.current);
    }

    // Add small delay before clearing hover to allow moving to tooltip
    hoverTimeoutRef.current = setTimeout(() => {
      // Only hide if not hovering over the tooltip
      if (!isHoveringTooltip) {
        setHoveredWord(null);
        setIsHovering(false);
        setHoverTranslation(null);
      }
    }, 150); // Slightly longer delay to allow moving to tooltip
  };

  // Handle tooltip hover to keep it visible
  const handleTooltipMouseEnter = () => {
    setIsHoveringTooltip(true);
    // Clear any pending hide timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
  };

  const handleTooltipMouseLeave = () => {
    setIsHoveringTooltip(false);
    // Hide after leaving tooltip
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredWord(null);
      setIsHovering(false);
      setHoverTranslation(null);
    }, 100);
  };

  // Auto-collapse when no transcript is available
  useEffect(() => {
    if (segments.length === 0 && !isCollapsed && onToggleCollapse) {
      onToggleCollapse();
    }
  }, [segments.length, isCollapsed, onToggleCollapse]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      if (translateTimeoutRef.current) {
        clearTimeout(translateTimeoutRef.current);
      }
    };
  }, []);

  // Render text with individual word highlighting and inline translations
  const renderTextWithWords = (text: string, opacity: string = "100") => {
    // Split text into words while preserving punctuation
    const words = text.split(/(\s+)/); // Preserve spaces

    return (
      <span className="inline-flex flex-wrap items-start gap-x-1">
        {words.map((word, idx) => {
          // Don't wrap whitespace - just render as space
          if (/^\s+$/.test(word)) {
            return <span key={idx} className="w-1" />;
          }

          const isHovered = hoveredWord === word && word.trim().length > 0;
          const translation = getTranslationForWord(word);
          const hasTranslation = !!translation;

          return (
            <span
              key={idx}
              className={`inline-flex flex-col items-center transition-all duration-100 ${
                isHovered
                  ? 'bg-yellow-200 dark:bg-yellow-500/30 px-1 -mx-0.5 rounded scale-105'
                  : hasTranslation
                  ? 'hover:bg-blue-100 dark:hover:bg-blue-900/30 px-1 -mx-0.5 rounded'
                  : 'hover:bg-muted/50 px-1 -mx-0.5 rounded'
              }`}
              onMouseEnter={() => word.trim() && handleWordMouseEnter(word)}
              onMouseLeave={handleWordMouseLeave}
              style={{
                cursor: word.trim() ? 'pointer' : 'default',
                minHeight: showInlineTranslations && hasTranslation ? '1.8em' : 'auto'
              }}
            >
              <span className={hasTranslation && !isHovered ? 'text-blue-600 dark:text-blue-400 font-medium' : ''}>
                {word}
              </span>
              {hasTranslation && showInlineTranslations && (
                <span className="text-[10px] text-blue-500 dark:text-blue-400 leading-none whitespace-nowrap opacity-90">
                  {translation.translatedText}
                </span>
              )}
            </span>
          );
        })}
      </span>
    );
  };

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

  // Active segment index based on current time (freeze when selecting or hovering)
  useEffect(() => {
    if (!segments.length) {
      setActiveSegIndex(null);
      return;
    }
    // Don't update active segment while user is selecting text or hovering over word/tooltip
    if (isSelecting || isHovering || isHoveringTooltip) return;

    const idx = segments.findIndex((s) => currentTime >= s.start && currentTime < s.end);
    setActiveSegIndex(idx >= 0 ? idx : null);
  }, [currentTime, segments, isSelecting, isHovering, isHoveringTooltip]);

  // Scroll active segment into view (freeze when selecting or hovering)
  useEffect(() => {
    if (activeSegIndex == null || !followPlayback) return;
    // Don't auto-scroll while user is selecting text or hovering over word/tooltip
    if (isSelecting || isHovering || isHoveringTooltip) return;

    const el = segRefs.current[activeSegIndex];
    const cont = transcriptContainerRef.current;
    if (!el || !cont) return;
    const elTop = el.offsetTop;
    const targetScroll = Math.max(0, elTop - cont.clientHeight * 0.3);
    cont.scrollTo({ top: targetScroll, behavior: "smooth" });
  }, [activeSegIndex, followPlayback, isSelecting, isHovering, isHoveringTooltip]);

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

      {!isCollapsed && (
      <div className="relative">
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
          <div className="w-full text-center space-y-1 pb-4">
            {/* Show previous 2 lines in faded color for context */}
            {activeSegIndex !== null && activeSegIndex > 1 && segments[activeSegIndex - 2] && (
              <div
                className="text-foreground/30 cursor-text px-4 transcript-text"
                style={{
                  fontFamily:
                    fontFamily === "serif"
                      ? "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif"
                      : fontFamily === "mono"
                      ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
                      : "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, 'Apple Color Emoji', 'Segoe UI Emoji'",
                  fontSize: `${fontSize - 2}px`,
                  lineHeight: showInlineTranslations ? '1.8' : '1.5',
                  minHeight: showInlineTranslations ? '2em' : 'auto',
                }}
              >
                {renderTextWithWords(segments[activeSegIndex - 2].text)}
              </div>
            )}
            {/* Show previous line in lighter color */}
            {activeSegIndex !== null && activeSegIndex > 0 && segments[activeSegIndex - 1] && (
              <div
                className="text-foreground/50 cursor-text px-4 transcript-text"
                style={{
                  fontFamily:
                    fontFamily === "serif"
                      ? "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif"
                      : fontFamily === "mono"
                      ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
                      : "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, 'Apple Color Emoji', 'Segoe UI Emoji'",
                  fontSize: `${fontSize - 1}px`,
                  lineHeight: showInlineTranslations ? '1.8' : '1.5',
                  minHeight: showInlineTranslations ? '2em' : 'auto',
                }}
              >
                {renderTextWithWords(segments[activeSegIndex - 1].text)}
              </div>
            )}
            {/* Show current line (active) */}
            {activeSegIndex !== null && segments[activeSegIndex] && (
              <div
                ref={(el) => (segRefs.current[activeSegIndex] = el as any)}
                className="text-foreground font-semibold cursor-text px-4 leading-relaxed transcript-text"
                style={{
                  fontFamily:
                    fontFamily === "serif"
                      ? "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif"
                      : fontFamily === "mono"
                      ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
                      : "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, 'Apple Color Emoji', 'Segoe UI Emoji'",
                  fontSize: `${fontSize}px`,
                  lineHeight: showInlineTranslations ? '1.9' : '1.6',
                  minHeight: showInlineTranslations ? '2.2em' : 'auto',
                }}
                data-start={segments[activeSegIndex].start}
                data-end={segments[activeSegIndex].end}
              >
                {renderTextWithWords(segments[activeSegIndex].text)}
              </div>
            )}
          </div>
        <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-background to-transparent pointer-events-none rounded-t-lg" />
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background to-transparent pointer-events-none rounded-b-lg" />
      </div>

      {/* Translation Tooltip - appears on long hover */}
      {hoverTranslation && (
        <div
          className="absolute bottom-4 left-1/2 transform -translate-x-1/2 pointer-events-auto z-50 animate-in fade-in slide-in-from-bottom-2 duration-200"
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
        >
          <div className="bg-blue-600 dark:bg-blue-500 text-white rounded-lg px-4 py-3 shadow-xl border border-blue-400 dark:border-blue-600 max-w-sm">
            {hoverTranslation.loading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <p className="text-sm">Translating "{hoverTranslation.word}"...</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="space-y-1">
                  <p className="text-xs text-blue-100 dark:text-blue-200 font-medium uppercase tracking-wide">
                    {hoverTranslation.word}
                  </p>
                  <p className="text-lg font-semibold">
                    {hoverTranslation.translation}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-blue-400/30">
                  {hoverTranslation.saved ? (
                    <p className="text-xs text-blue-200 dark:text-blue-300 flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      Saved to My Words
                    </p>
                  ) : (
                    <button
                      onClick={() => {
                        if (hoverTranslation.translationId) {
                          saveWordMutation.mutate(hoverTranslation.translationId);
                        }
                      }}
                      disabled={saveWordMutation.isPending}
                      className="text-xs text-white bg-blue-700 dark:bg-blue-600 hover:bg-blue-800 dark:hover:bg-blue-700 px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      {saveWordMutation.isPending ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <BookmarkPlus className="w-3 h-3" />
                          Save to My Words
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
          {/* Tooltip arrow */}
          <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full">
            <div className="w-0 h-0 border-l-8 border-l-transparent border-r-8 border-r-transparent border-t-8 border-t-blue-600 dark:border-t-blue-500"></div>
          </div>
        </div>
      )}
      </div>

      )}

      {/* Controls at bottom for better focus */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
        {/* Left side - hint text */}
        {!isCollapsed && segments.length > 0 && (
          <p className="text-xs text-muted-foreground italic">
            💡 Hover words to translate • Saved words highlighted in blue
          </p>
        )}
        {isCollapsed && (
          <div className="flex items-center gap-2">
            {segments.length === 0 ? (
              <>
                <p className="text-xs text-muted-foreground italic">
                  No transcript available
                </p>
                {!transcriptData && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => transcript.downloadTranscriptMutation.mutate()}
                    disabled={transcript.downloadTranscriptMutation.isPending}
                    className="h-6 text-xs"
                  >
                    {transcript.downloadTranscriptMutation.isPending ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        Downloading...
                      </>
                    ) : (
                      "Download Transcript"
                    )}
                  </Button>
                )}
              </>
            ) : (
          <p className="text-xs text-muted-foreground italic">
            Transcript collapsed
          </p>
            )}
          </div>
        )}

        {/* Right side - controls */}
        <div className="flex flex-wrap items-center gap-2">
        {/* Language selector - filtered to user's preferred languages */}
        {!isCollapsed && transcript.filteredLanguages.length > 0 && (
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
        {!isCollapsed && (
          <div className="flex items-center gap-1.5">
            <Switch id="follow-playback" checked={followPlayback} onCheckedChange={setFollowPlayback} />
            <label htmlFor="follow-playback" className="text-xs text-muted-foreground">Auto-scroll</label>
            {(isSelecting || isHovering || isHoveringTooltip) && (
              <span className="text-[10px] text-blue-500 font-medium">
                {isSelecting
                  ? "(selecting)"
                  : isHoveringTooltip
                  ? "(viewing translation)"
                  : hoveredWord
                  ? `(hovering: ${hoveredWord.trim().substring(0, 15)}...)`
                  : "(hovering)"}
              </span>
            )}
          </div>
        )}

        {/* Collapse/Expand Toggle */}
        {onToggleCollapse && (
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleCollapse}
            className="h-7"
          >
            {isCollapsed ? (
              <>
                <ChevronDown className="w-3.5 h-3.5 mr-1.5" />
                <span className="text-xs">Show</span>
              </>
            ) : (
              <>
                <ChevronUp className="w-3.5 h-3.5 mr-1.5" />
                <span className="text-xs">Hide</span>
              </>
            )}
          </Button>
        )}

        {/* Transcript Settings Button */}
        {!isCollapsed && (
          <Button size="sm" variant="outline" onClick={onSettingsClick} className="h-7">
            <SettingsIcon className="w-3.5 h-3.5 mr-1.5" />
            <span className="text-xs">Settings</span>
          </Button>
        )}

        {/* Status indicators */}
        {!isCollapsed && (
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
        )}
        </div>
      </div>

    </div>
  );
}
