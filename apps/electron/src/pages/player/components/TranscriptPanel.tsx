import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient, UseQueryResult, UseMutationResult } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { useAtom } from "jotai";
import { showInlineTranslationsAtom, translationTargetLangAtom } from "@/context/transcriptSettings";
import { toast } from "sonner";
import { TranscriptContent } from "./TranscriptContent";
import { TranslationTooltip } from "./TranslationTooltip";
import { TranscriptControls } from "./TranscriptControls";

interface TranscriptPanelProps {
  videoId: string;
  currentTime: number;
  videoRef: React.RefObject<HTMLVideoElement>;
  transcriptQuery: UseQueryResult<any, any>;
  transcriptSegmentsQuery: UseQueryResult<any, any>;
  downloadTranscriptMutation: UseMutationResult<any, any, void, any>;
  availableSubsQuery: UseQueryResult<any, any>;
  filteredLanguages: Array<{ lang: string; hasManual: boolean; hasAuto: boolean }>;
  selectedLang: string | null;
  setSelectedLang: (lang: string) => void;
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
  transcriptQuery,
  transcriptSegmentsQuery,
  downloadTranscriptMutation,
  availableSubsQuery,
  filteredLanguages,
  selectedLang,
  setSelectedLang,
  fontFamily,
  fontSize,
  onSettingsClick,
  onSelect,
  onEnterKey,
  isCollapsed = false,
  onToggleCollapse,
}: TranscriptPanelProps) {
  const segments = ((transcriptSegmentsQuery.data as any)?.segments ?? []) as Array<{
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

  // Handle word hover with translation

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

  const transcriptData = transcriptQuery.data as any;
  const effectiveLang = selectedLang ?? (transcriptData?.language as string | undefined);

  return (
    <div className="lg:col-span-2 space-y-3">
      {!isCollapsed && (
        <div className="relative">
          <TranscriptContent
            segments={segments}
            activeSegIndex={activeSegIndex}
            fontFamily={fontFamily}
            fontSize={fontSize}
            showInlineTranslations={showInlineTranslations}
            hoveredWord={hoveredWord}
            translationMap={translationMap}
            onMouseDown={handleMouseDown}
            onMouseUp={(e) => { handleMouseUp(); onSelect(); }}
            onKeyDown={handleTranscriptKeyDown}
            onWordMouseEnter={handleWordMouseEnter}
            onWordMouseLeave={handleWordMouseLeave}
            isSelecting={isSelecting}
            containerRef={transcriptContainerRef}
            segRefs={segRefs}
          />

          {/* Translation Tooltip - appears on long hover */}
          {hoverTranslation && (
            <TranslationTooltip
              word={hoverTranslation.word}
              translation={hoverTranslation.translation}
              translationId={hoverTranslation.translationId}
              loading={hoverTranslation.loading}
              saved={hoverTranslation.saved}
              isSaving={saveWordMutation.isPending}
              onSave={() => {
                if (hoverTranslation.translationId) {
                  saveWordMutation.mutate(hoverTranslation.translationId);
                }
              }}
              onMouseEnter={handleTooltipMouseEnter}
              onMouseLeave={handleTooltipMouseLeave}
            />
          )}
        </div>
      )}

      {/* Controls at bottom for better focus */}
      <TranscriptControls
        isCollapsed={isCollapsed}
        onToggleCollapse={onToggleCollapse}
        hasSegments={segments.length > 0}
        hasTranscriptData={!!transcriptData}
        filteredLanguages={filteredLanguages}
        selectedLang={selectedLang}
        effectiveLang={effectiveLang}
        onLanguageChange={setSelectedLang}
        isLanguageDisabled={availableSubsQuery.isLoading || downloadTranscriptMutation.isPending}
        followPlayback={followPlayback}
        onFollowPlaybackChange={setFollowPlayback}
        isSelecting={isSelecting}
        isHovering={isHovering}
        isHoveringTooltip={isHoveringTooltip}
        hoveredWord={hoveredWord}
        isFetching={transcriptQuery.isFetching || transcriptSegmentsQuery.isFetching || downloadTranscriptMutation.isPending}
        isDownloading={downloadTranscriptMutation.isPending}
        onDownloadTranscript={() => downloadTranscriptMutation.mutate()}
        videoId={videoId}
        onSettingsClick={onSettingsClick}
      />
    </div>
  );
}
