import React from "react";
import { Loader2, BookmarkPlus, Check } from "lucide-react";

interface TranslationTooltipProps {
  word: string;
  translation: string;
  translationId: string;
  loading: boolean;
  saved?: boolean;
  isSaving: boolean;
  onSave: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function TranslationTooltip({
  word,
  translation,
  loading,
  saved,
  isSaving,
  onSave,
  onMouseEnter,
  onMouseLeave,
}: TranslationTooltipProps) {
  return (
    <div
      className="absolute bottom-4 left-1/2 transform -translate-x-1/2 pointer-events-auto z-50 animate-in fade-in slide-in-from-bottom-2 duration-200"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="bg-blue-600 dark:bg-blue-500 text-white rounded-lg px-4 py-3 shadow-xl border border-blue-400 dark:border-blue-600 max-w-sm">
        {loading ? (
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <p className="text-sm">Translating "{word}"...</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="space-y-1">
              <p className="text-xs text-blue-100 dark:text-blue-200 font-medium uppercase tracking-wide">
                {word}
              </p>
              <p className="text-lg font-semibold">
                {translation}
              </p>
            </div>
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-blue-400/30">
              {saved ? (
                <p className="text-xs text-blue-200 dark:text-blue-300 flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  Saved to My Words
                </p>
              ) : (
                <button
                  onClick={onSave}
                  disabled={isSaving}
                  className="text-xs text-white bg-blue-700 dark:bg-blue-600 hover:bg-blue-800 dark:hover:bg-blue-700 px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {isSaving ? (
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
  );
}

