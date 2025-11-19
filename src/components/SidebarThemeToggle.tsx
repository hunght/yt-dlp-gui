import React, { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { toggleTheme, getCurrentTheme } from "@/helpers/theme_helpers";
import { ThemeMode } from "@/lib/types/theme-mode";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

type SidebarThemeToggleProps = {
  variant?: "default" | "icon";
};

export function SidebarThemeToggle({
  variant = "default",
}: SidebarThemeToggleProps): React.JSX.Element {
  const [currentTheme, setCurrentTheme] = useState<ThemeMode>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    getCurrentTheme().then((theme) => {
      setCurrentTheme(theme.local || theme.system);
    });
  }, []);

  const handleToggle = async (): Promise<void> => {
    await toggleTheme();
    const theme = await getCurrentTheme();
    setCurrentTheme(theme.local || theme.system);
  };

  // Avoid hydration mismatch by not rendering theme-dependent content on server
  const iconClasses =
    "size-4 transition-colors text-primary dark:text-white group-hover:text-primary dark:group-hover:text-accent";
  const buttonBaseClasses =
    "text-primary/70 transition-colors hover:bg-accent/10 hover:text-primary dark:text-white/70 dark:hover:bg-accent/5 dark:hover:text-accent";

  if (!mounted) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          tooltip="Toggle Theme"
          className={`${buttonBaseClasses} ${variant === "icon" ? "justify-center px-2" : "gap-2"}`}
        >
          <div className="size-4" />
          {variant === "default" && <span>Theme</span>}
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  const isDark = currentTheme === "dark";

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={handleToggle}
        tooltip={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
        className={`${buttonBaseClasses} ${variant === "icon" ? "group justify-center px-2" : "gap-2"}`}
      >
        {isDark ? <Moon className={iconClasses} /> : <Sun className={iconClasses} />}
        {variant === "default" && <span>{isDark ? "Dark Mode" : "Light Mode"}</span>}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
