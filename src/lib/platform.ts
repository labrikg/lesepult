/** Which system Lesepult runs on, for shortcut labels and small per-platform styles. */
const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;

export const isMac = ua.includes("Mac");
export const isWindows = ua.includes("Windows");

/** A shortcut as the system writes it: `shortcut("K")` → "⌘K" on macOS, "Ctrl+K" elsewhere. */
export const shortcut = (key: string) => (isMac ? `⌘${key}` : `Ctrl+${key}`);

/** The modifier key's name in running text: "⌘" or "Ctrl". */
export const modKey = isMac ? "⌘" : "Ctrl";
