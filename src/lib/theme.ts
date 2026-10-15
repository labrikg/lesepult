import { getCurrentWindow } from "@tauri-apps/api/window";

export type ThemePref = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

/**
 * Appearance settings live in localStorage (not the database) so index.html can apply them
 * before the first paint, without a flash of the wrong theme. Keys must match index.html.
 */
const THEME_KEY = "lesepult.theme";
const DARK_PDF_KEY = "lesepult.darkPdf";
const SKIN_KEY = "lesepult.skin";

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not fatal: the setting just won't survive a restart.
  }
}

export function readThemePref(): ThemePref {
  const v = read(THEME_KEY);
  return v === "light" || v === "dark" ? v : "system";
}

export function readDarkPdf(): boolean {
  return read(DARK_PDF_KEY) === "on";
}

/** The colour theme ("skin"): "lesepult" is the built-in look; others are in skins.css. */
export function readSkin(): string {
  return read(SKIN_KEY) || "lesepult";
}

export function saveSkin(id: string) {
  write(SKIN_KEY, id);
}

/** Puts the colour theme on <html> (no attribute for the built-in look). */
export function applySkin(id: string) {
  const root = document.documentElement;
  if (id === "lesepult") delete root.dataset.skin;
  else root.dataset.skin = id;
}

export function saveThemePref(pref: ThemePref) {
  write(THEME_KEY, pref);
}

export function saveDarkPdf(on: boolean) {
  write(DARK_PDF_KEY, on ? "on" : "off");
}

export function resolveTheme(pref: ThemePref): ResolvedTheme {
  if (pref !== "system") return pref;
  return darkQuery().matches ? "dark" : "light";
}

/** Puts the theme on <html> and tells the window (title bar on macOS) to match. */
export function applyTheme(pref: ThemePref, resolved: ResolvedTheme, darkPdf: boolean) {
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.darkPdf = darkPdf ? "on" : "off";
  // null = follow the system, so the title bar keeps tracking it too.
  getCurrentWindow()
    .setTheme(pref === "system" ? null : pref)
    .catch(() => {
      // Outside Tauri (tests, plain browser) there is no window to theme.
    });
}

/** Calls back when the system switches between light and dark. Returns an unsubscribe function. */
export function onSystemThemeChange(callback: () => void): () => void {
  const q = darkQuery();
  q.addEventListener("change", callback);
  return () => q.removeEventListener("change", callback);
}
