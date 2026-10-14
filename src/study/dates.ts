/* Calendar dates (YYYY-MM-DD, local) for deadlines and to-dos. */

const pad = (n: number) => String(n).padStart(2, "0");

/** Today's local date as YYYY-MM-DD. */
export function todayISO(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** A local date plus some days, as YYYY-MM-DD. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return todayISO(new Date(y, m - 1, d + days));
}

/** Whole days from one date to another (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const utc = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

/** "today", "tomorrow", "in 12 days", "yesterday", "3 days ago". */
export function countdown(date: string, today = todayISO()): string {
  const n = daysBetween(today, date);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

/** "Fri, 12 Feb" (with the year when it isn't this year), in the system's language. */
export function formatDate(date: string, today = todayISO(), locale?: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const sameYear = Number(today.slice(0, 4)) === y;
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(new Date(y, m - 1, d));
}

/** "Wednesday, 14 October" for headings. */
export function formatLongDate(date: string, locale?: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(
    new Date(y, m - 1, d),
  );
}

/** Local midnight of today and of this week's Monday, as ISO timestamps (for "since" queries). */
export function dayStart(now = new Date()): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function weekStart(now = new Date()): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
  return d.toISOString();
}
