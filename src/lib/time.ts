const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "just now", "4 minutes ago", "yesterday", … */
export function relativeTime(iso: string, nowMs = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const s = Math.round((then - nowMs) / 1000);
  if (Math.abs(s) < 45) return "just now";
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["minute", 60],
    ["hour", 3600],
    ["day", 86400],
    ["week", 604800],
    ["month", 2629800],
    ["year", 31557600],
  ];
  let unit = units[0];
  for (const u of units) if (Math.abs(s) >= u[1]) unit = u;
  return rtf.format(Math.round(s / unit[1]), unit[0]);
}
