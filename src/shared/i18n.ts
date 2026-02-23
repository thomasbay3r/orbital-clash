import { de } from "./lang/de";
import { en } from "./lang/en";

export type LangKey = keyof typeof de;
type Lang = "de" | "en";

const STORAGE_KEY = "orbital-lang";
const translations: Record<Lang, Record<string, string>> = { de, en };
let currentLang: Lang = "de";

export function initLang(): void {
  const stored = localStorage.getItem(STORAGE_KEY) as Lang | null;
  if (stored === "de" || stored === "en") {
    currentLang = stored;
  }
}

export function getLang(): Lang {
  return currentLang;
}

export function setLang(lang: Lang): void {
  currentLang = lang;
  localStorage.setItem(STORAGE_KEY, lang);
}

export function t(key: LangKey, params?: Record<string, string | number>): string {
  const raw = translations[currentLang][key] ?? translations.de[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
}
