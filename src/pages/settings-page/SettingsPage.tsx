import { useEffect, useState } from "react";
import { SunIcon, MoonIcon } from "@radix-ui/react-icons";

import { setTheme, getCurrentTheme } from "../../helpers/theme_helpers";
import { ThemeMode } from "@/lib/types/theme-mode";
import { Button } from "@/components/ui/button";

import { Switch } from "@/components/ui/switch";
import { AboutSection } from "@/pages/settings-page/components/AboutSection";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { trpcClient } from "@/utils/trpc";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Label } from "@/components/ui/label";

export default function SettingsPage() {
  const [currentTheme, setCurrentTheme] = useState<ThemeMode>("light");
  const queryClient = useQueryClient();
  const [newDomain, setNewDomain] = useState("");
  const [newApp, setNewApp] = useState("");
  const [itemToDelete, setItemToDelete] = useState<{
    type: "domain" | "app";
    index: number;
  } | null>(null);

  // Get database path
  const { data: dbInfo } = useQuery({
    queryKey: ["database", "path"],
    queryFn: () => trpcClient.utils.getDatabasePath.query(),
  });

  useEffect(() => {
    getCurrentTheme().then((theme) => {
      setCurrentTheme(theme.local || theme.system);
    });
  }, []);

  const handleThemeChange = async (theme: ThemeMode) => {
    await setTheme(theme);
    setCurrentTheme(theme);
  };

  const handleOpenDatabaseFolder = async () => {
    if (dbInfo?.directory) {
      await trpcClient.utils.openFolder.mutate({ folderPath: dbInfo.directory });
    }
  };

  const handleRevealDatabase = async () => {
    if (dbInfo?.path) {
      // On macOS, shell.showItemInFolder would be better, but we can use openPath for the parent directory
      await trpcClient.utils.openFolder.mutate({ folderPath: dbInfo.directory });
    }
  };

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-3xl font-bold text-foreground">Settings</h1>
      <p className="mt-2 text-muted-foreground">Configure your application settings</p>

      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>Customize your application appearance</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <Button
            variant={currentTheme === "light" ? "default" : "outline"}
            size="icon"
            onClick={() => handleThemeChange("light")}
          >
            <SunIcon className="h-4 w-4" />
          </Button>
          <Button
            variant={currentTheme === "dark" ? "default" : "outline"}
            size="icon"
            onClick={() => handleThemeChange("dark")}
          >
            <MoonIcon className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Database</CardTitle>
          <CardDescription>View database location and information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {dbInfo ? (
            <div className="space-y-3">
              <div>
                <Label className="text-sm font-medium">Database Path</Label>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 rounded bg-muted px-3 py-2 text-xs font-mono break-all">
                    {dbInfo.path}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRevealDatabase}
                    disabled={!dbInfo.exists}
                  >
                    Open in Finder
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Status:</span>{" "}
                  <span className={dbInfo.exists ? "text-green-600" : "text-red-600"}>
                    {dbInfo.exists ? "✓ Found" : "✗ Not Found"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Size:</span>{" "}
                  <span>{(dbInfo.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Loading database information...</div>
          )}
        </CardContent>
      </Card>

      <AboutSection />
    </div>
  );
}
