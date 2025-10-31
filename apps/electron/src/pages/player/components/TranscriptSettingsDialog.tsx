import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface TranscriptSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fontFamily: "system" | "serif" | "mono";
  fontSize: number;
  onFontFamilyChange: (family: "system" | "serif" | "mono") => void;
  onFontSizeChange: (size: number) => void;
  filteredLanguages: Array<{ lang: string; hasManual: boolean; hasAuto: boolean }>;
  selectedLang: string | null;
  effectiveLang?: string;
  onLanguageChange: (lang: string) => void;
}

export function TranscriptSettingsDialog({
  open,
  onOpenChange,
  fontFamily,
  fontSize,
  onFontFamilyChange,
  onFontSizeChange,
  filteredLanguages,
  selectedLang,
  effectiveLang,
  onLanguageChange,
}: TranscriptSettingsDialogProps) {

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transcript settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Language Selector */}
          {filteredLanguages.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs">Language</Label>
              <Select
                value={selectedLang ?? effectiveLang ?? ""}
                onValueChange={onLanguageChange}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {filteredLanguages.map((l) => (
                    <SelectItem key={l.lang} value={l.lang}>
                      {l.lang}
                      {l.hasManual ? "" : " (auto)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Font family */}
          <div className="space-y-2">
            <Label className="text-xs">Font family</Label>
            <Select value={fontFamily} onValueChange={(v) => onFontFamilyChange(v as any)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">System (Default)</SelectItem>
                <SelectItem value="serif">Serif</SelectItem>
                <SelectItem value="mono">Monospace</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Font size */}
          <div className="space-y-2">
            <Label className="text-xs">Font size</Label>
            <Select value={String(fontSize)} onValueChange={(v) => onFontSizeChange(Number(v))}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[12, 14, 16, 18, 20, 22, 24].map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s}px
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
