import React from "react";
import { Loader2, Settings as SettingsIcon, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

interface TranscriptControlsProps {
  // Collapse state
  isCollapsed: boolean;
  onToggleCollapse?: () => void;

  // Transcript state
  hasSegments: boolean;
  hasTranscriptData: boolean;

  // Language controls
  filteredLanguages: Array<{ lang: string; hasManual: boolean }>;
  selectedLang: string | null;
  effectiveLang: string | undefined;
  onLanguageChange: (lang: string) => void;
  isLanguageDisabled: boolean;

  // Auto-scroll controls
  followPlayback: boolean;
  onFollowPlaybackChange: (value: boolean) => void;

  // Status indicators
  isSelecting: boolean;
  isHovering: boolean;
  isHoveringTooltip: boolean;
  hoveredWord: string | null;

  // Loading states
  isFetching: boolean;
  isDownloading: boolean;
  onDownloadTranscript: () => void;

  // Cooldown info
  videoId: string;

  // Settings
  onSettingsClick: () => void;
}

export function TranscriptControls({
  isCollapsed,
  onToggleCollapse,
  hasSegments,
  hasTranscriptData,
  filteredLanguages,
  selectedLang,
  effectiveLang,
  onLanguageChange,
  isLanguageDisabled,
  followPlayback,
  onFollowPlaybackChange,
  isSelecting,
  isHovering,
  isHoveringTooltip,
  hoveredWord,
  isFetching,
  isDownloading,
  onDownloadTranscript,
  videoId,
  onSettingsClick,
}: TranscriptControlsProps) {
  // Calculate cooldown info
  const getCooldownInfo = () => {
    try {
      const key = `${videoId}|${selectedLang ?? "__default__"}`;
      const raw = localStorage.getItem("transcript-download-cooldowns");
      const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
      const until = map[key];
      if (until && Date.now() < until) {
        const mins = Math.max(1, Math.ceil((until - Date.now()) / 60000));
        return `retry in ~${mins}m`;
      }
    } catch {}
    return null;
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
      {/* Left side - hint text */}
      {!isCollapsed && hasSegments && (
        <p className="text-xs text-muted-foreground italic">
          💡 Hover words to translate • Saved words highlighted in blue
        </p>
      )}
      {isCollapsed && (
        <div className="flex items-center gap-2">
          {!hasSegments ? (
            <>
              <p className="text-xs text-muted-foreground italic">
                No transcript available
              </p>
              {!hasTranscriptData && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onDownloadTranscript}
                  disabled={isDownloading}
                  className="h-6 text-xs"
                >
                  {isDownloading ? (
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
        {/* Language selector */}
        {!isCollapsed && filteredLanguages.length > 0 && (
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-muted-foreground">Language:</label>
            <select
              className="text-xs border rounded px-2 py-1 bg-background hover:bg-muted/30"
              value={selectedLang ?? effectiveLang ?? ""}
              onChange={(e) => onLanguageChange(e.target.value)}
              disabled={isLanguageDisabled}
            >
              {filteredLanguages.map((l) => (
                <option key={l.lang} value={l.lang}>
                  {l.lang}{l.hasManual ? "" : " (auto)"}
                </option>
              ))}
              {filteredLanguages.length === 0 && (
                <option value={effectiveLang ?? "en"}>{effectiveLang ?? "en"}</option>
              )}
            </select>
          </div>
        )}

        {/* Follow playback toggle */}
        {!isCollapsed && (
          <div className="flex items-center gap-1.5">
            <Switch id="follow-playback" checked={followPlayback} onCheckedChange={onFollowPlaybackChange} />
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
            {isFetching && (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                Updating…
              </span>
            )}

            {/* Cooldown badge when rate-limited for this video/language */}
            {(() => {
              const cooldown = getCooldownInfo();
              return cooldown ? <span className="text-[10px] text-amber-500">{cooldown}</span> : null;
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

