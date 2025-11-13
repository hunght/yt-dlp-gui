import type { i18n } from "i18next";

const languageLocalStorageKey = "lang";

export function updateAppLanguage(i18n: i18n): void {
  const localLang = localStorage.getItem(languageLocalStorageKey);
  if (!localLang) {
    return;
  }

  i18n.changeLanguage(localLang);
  document.documentElement.lang = localLang;
}
