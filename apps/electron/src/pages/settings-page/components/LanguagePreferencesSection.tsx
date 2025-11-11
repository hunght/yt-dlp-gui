import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { X, Plus, Languages, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";

// Common language codes with readable names
const LANGUAGE_OPTIONS = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "ru", name: "Russian" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese" },
  { code: "ar", name: "Arabic" },
  { code: "hi", name: "Hindi" },
  { code: "nl", name: "Dutch" },
  { code: "pl", name: "Polish" },
  { code: "tr", name: "Turkish" },
  { code: "vi", name: "Vietnamese" },
  { code: "th", name: "Thai" },
  { code: "sv", name: "Swedish" },
  { code: "da", name: "Danish" },
  { code: "fi", name: "Finnish" },
  { code: "no", name: "Norwegian" },
  { code: "cs", name: "Czech" },
  { code: "hu", name: "Hungarian" },
  { code: "ro", name: "Romanian" },
  { code: "uk", name: "Ukrainian" },
  { code: "id", name: "Indonesian" },
  { code: "ms", name: "Malay" },
  { code: "he", name: "Hebrew" },
  { code: "el", name: "Greek" },
  { code: "bn", name: "Bengali" },
  { code: "ta", name: "Tamil" },
  { code: "te", name: "Telugu" },
];

const getLanguageName = (code: string): string => {
  const found = LANGUAGE_OPTIONS.find((opt) => opt.code === code);
  return found ? found.name : code.toUpperCase();
};

export const LanguagePreferencesSection = (): React.JSX.Element => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [newLanguage, setNewLanguage] = useState("");

  // Get current preferences
  const prefsQuery = useQuery({
    queryKey: ["user-preferences"],
    queryFn: async () => {
      return await trpcClient.preferences.getUserPreferences.query();
    },
  });

  // Update preferences mutation
  const updateMutation = useMutation({
    mutationFn: async (languages: string[]) => {
      return await trpcClient.preferences.updatePreferredLanguages.mutate({ languages });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-preferences"] });
      toast({
        title: "Preferences Updated",
        description: "Your language preferences have been saved.",
      });
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: String(error),
        variant: "destructive",
      });
    },
  });

  const preferredLanguages = prefsQuery.data?.preferredLanguages || [];
  const systemLanguage = prefsQuery.data?.systemLanguage || "en";

  const handleAddLanguage = (): void => {
    const lang = newLanguage.trim().toLowerCase();
    if (!lang) return;
    if (preferredLanguages.includes(lang)) {
      toast({
        title: "Already Added",
        description: `Language "${lang}" is already in your preferences.`,
        variant: "default",
      });
      return;
    }
    updateMutation.mutate([...preferredLanguages, lang]);
    setNewLanguage("");
  };

  const handleRemoveLanguage = (lang: string): void => {
    const updated = preferredLanguages.filter((l: string) => l !== lang);
    if (updated.length === 0) {
      toast({
        title: "Cannot Remove",
        description: "You must have at least one preferred language.",
        variant: "destructive",
      });
      return;
    }
    updateMutation.mutate(updated);
  };

  const handleAddFromList = (code: string): void => {
    if (preferredLanguages.includes(code)) return;
    updateMutation.mutate([...preferredLanguages, code]);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Languages className="w-5 h-5" />
          <CardTitle>Language Preferences</CardTitle>
        </div>
        <CardDescription>
          Manage which languages appear in transcript selectors. Only your preferred languages will
          be shown when selecting subtitles.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* System Language */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">System Language</Label>
          <p className="text-xs text-muted-foreground">
            Detected from your operating system (auto-added to preferences)
          </p>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-sm">
              {systemLanguage.toUpperCase()} - {getLanguageName(systemLanguage)}
            </Badge>
          </div>
        </div>

        {/* Preferred Languages */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Preferred Languages</Label>
          <p className="text-xs text-muted-foreground">
            Add languages to filter transcript options. Only these languages will be available in
            the player.
          </p>

          {prefsQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading preferences...
            </div>
          ) : (
            <>
              {/* Current preferred languages */}
              <div className="flex flex-wrap gap-2">
                {preferredLanguages.length > 0 ? (
                  preferredLanguages.map((lang: string) => (
                    <Badge
                      key={lang}
                      variant="default"
                      className="text-sm flex items-center gap-1.5"
                    >
                      {lang.toUpperCase()} - {getLanguageName(lang)}
                      <button
                        onClick={() => handleRemoveLanguage(lang)}
                        className="ml-1 hover:bg-destructive/20 rounded-full p-0.5 transition-colors"
                        disabled={updateMutation.isPending}
                        aria-label={`Remove ${lang}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground italic">No languages added yet</p>
                )}
              </div>

              {/* Add new language */}
              <div className="flex gap-2">
                <Input
                  placeholder="Enter language code (e.g., en, es, fr)"
                  value={newLanguage}
                  onChange={(e) => setNewLanguage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddLanguage();
                    }
                  }}
                  className="max-w-xs text-sm"
                  disabled={updateMutation.isPending}
                />
                <Button
                  size="sm"
                  onClick={handleAddLanguage}
                  disabled={!newLanguage.trim() || updateMutation.isPending}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Quick add common languages */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Quick Add</Label>
          <p className="text-xs text-muted-foreground">Click to add common languages</p>
          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
            {LANGUAGE_OPTIONS.filter((opt) => !preferredLanguages.includes(opt.code)).map(
              (opt) => (
                <Button
                  key={opt.code}
                  size="sm"
                  variant="outline"
                  onClick={() => handleAddFromList(opt.code)}
                  disabled={updateMutation.isPending}
                  className="text-xs"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  {opt.code.toUpperCase()} - {opt.name}
                </Button>
              )
            )}
          </div>
        </div>

        {/* Info note */}
        <div className="rounded-lg bg-muted/30 p-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong>Note:</strong> When you open a video in the player, only transcripts in your
            preferred languages will appear in the language selector. This helps reduce clutter if
            videos have many subtitle options. Your system language ({systemLanguage.toUpperCase()})
            is automatically included.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
