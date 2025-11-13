import { ThemeMode } from "@/lib/types/theme-mode";

const THEME_KEY = "theme";

interface ThemePreferences {
  system: ThemeMode;
  local: ThemeMode | null;
}

export async function getCurrentTheme(): Promise<ThemePreferences> {
  const currentTheme = await window.themeMode.current();
  const storedTheme = localStorage.getItem(THEME_KEY);
  const localTheme: ThemeMode | null =
    storedTheme === "dark" || storedTheme === "light" || storedTheme === "system"
      ? storedTheme
      : null;

  return {
    system: currentTheme,
    local: localTheme,
  };
}

export async function setTheme(newTheme: ThemeMode): Promise<void> {
  switch (newTheme) {
    case "dark": {
      await window.themeMode.dark();
      updateDocumentTheme(true);
      break;
    }
    case "light": {
      await window.themeMode.light();
      updateDocumentTheme(false);
      break;
    }
    case "system": {
      const isDarkMode = await window.themeMode.system();
      updateDocumentTheme(isDarkMode);
      break;
    }
  }

  localStorage.setItem(THEME_KEY, newTheme);
}

export async function toggleTheme(): Promise<void> {
  const isDarkMode = await window.themeMode.toggle();
  const newTheme = isDarkMode ? "dark" : "light";

  updateDocumentTheme(isDarkMode);
  localStorage.setItem(THEME_KEY, newTheme);
}

export async function syncThemeWithLocal(): Promise<void> {
  const { local } = await getCurrentTheme();
  if (!local) {
    setTheme("system");
    return;
  }

  await setTheme(local);
}

function updateDocumentTheme(isDarkMode: boolean): void {
  if (!isDarkMode) {
    document.documentElement.classList.remove("dark");
  } else {
    document.documentElement.classList.add("dark");
  }
}
