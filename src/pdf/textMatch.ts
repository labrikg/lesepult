import { fixAccents } from "./mathText";

/**
 * Finding words in PDF text, the same way everywhere: in the search index, in snippets and on
 * the page itself. Matching ignores case and accents ("naturlich" finds "natürlich"), finds parts
 * of words ("kontrolle" finds "Staukontrolle") and reads across line-end hyphens
 * ("Daten-⏎kommunikation" is one word).
 */

/** A text item from PDF.js: its string, and whether a line ends after it. */
export interface Piece {
  text: string;
  eol: boolean;
}

/** The pieces as one string, with "\n" at line ends; `starts[k]` is where piece k begins. */
export function joinPieces(pieces: readonly Piece[]): { raw: string; starts: number[] } {
  const starts: number[] = [];
  let raw = "";
  for (const p of pieces) {
    starts.push(raw.length);
    raw += p.text + (p.eol ? "\n" : "");
  }
  return { raw, starts };
}

// Accents as old TeX fonts emit them, next to the letter instead of on it ("nat¨urlich").
const SPACING_ACCENTS = new Set([..."¨´`ˆ˜˚ˇ˘˙˝¯¸˛"]);
const HYPHENS = new Set(["-", "‐", "‑"]);

/** "Ü" → "u", "ﬁ" → "fi"; spacing accents and soft hyphens vanish. */
function foldChar(c: string): string {
  if (SPACING_ACCENTS.has(c) || c === "­") return "";
  return c.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** A hyphen ending a line before a lowercase letter: returns the index after the line break. */
function lineHyphenEnd(raw: string, i: number): number | null {
  if (!HYPHENS.has(raw[i]) || i === 0 || !/\p{L}/u.test(raw[i - 1])) return null;
  let j = i + 1;
  while (raw[j] === " " || raw[j] === "\t") j++;
  if (raw[j] !== "\n") return null;
  j++;
  while (/\s/.test(raw[j] ?? "")) j++;
  return /\p{Ll}/u.test(raw[j] ?? "") ? j : null;
}

export interface Folded {
  text: string;
  /** For each char of `text`, the index in the original string it came from. */
  map: number[];
}

/** Text for matching: lowercase, without accents, whitespace collapsed, line-end hyphens joined. */
export function fold(raw: string): Folded {
  let text = "";
  const map: number[] = [];
  let i = 0;
  while (i < raw.length) {
    const joined = lineHyphenEnd(raw, i);
    if (joined !== null) {
      i = joined;
      continue;
    }
    const cp = raw.codePointAt(i)!;
    const c = String.fromCodePoint(cp);
    if (/\s/.test(c)) {
      if (text && !text.endsWith(" ")) {
        text += " ";
        map.push(i);
      }
    } else {
      for (const f of foldChar(c)) {
        text += f;
        map.push(i);
      }
    }
    i += c.length;
  }
  return { text, map };
}

/** The words of a query, folded, longest first; "#tags" and quotes are left out. */
export function queryTerms(query: string): string[] {
  const terms = query
    .split(/\s+/)
    .filter((w) => w && !w.startsWith("#"))
    .map((w) => fold(w.replace(/"/g, "")).text.trim())
    .filter(Boolean);
  return [...new Set(terms)].sort((a, b) => b.length - a.length);
}

/** Where any of the terms occurs in folded text: sorted, non-overlapping [start, end) ranges. */
export function findMatches(folded: string, terms: readonly string[]): [number, number][] {
  const all: [number, number][] = [];
  for (const t of terms) {
    for (let at = folded.indexOf(t); at >= 0; at = folded.indexOf(t, at + t.length)) all.push([at, at + t.length]);
  }
  all.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const out: [number, number][] = [];
  for (const m of all) if (!out.length || m[0] >= out[out.length - 1][1]) out.push(m);
  return out;
}

/** A folded range back in the original string. */
export function toRaw(f: Folded, raw: string, [start, end]: [number, number]): [number, number] {
  const last = f.map[end - 1];
  return [f.map[start], last + String.fromCodePoint(raw.codePointAt(last)!).length];
}

/** How many times the terms occur in a text. */
export function countMatches(raw: string, terms: readonly string[]): number {
  return terms.length ? findMatches(fold(raw).text, terms).length : 0;
}

/** The text of a PDF page as stored for search: umlauts repaired, hyphenated words joined, one line. */
export function pageText(pieces: readonly Piece[]): string {
  const { raw } = joinPieces(pieces);
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const joined = lineHyphenEnd(raw, i);
    if (joined !== null) {
      i = joined - 1;
      continue;
    }
    out += raw[i];
  }
  return fixAccents(out).replace(/\s+/g, " ").trim();
}

/**
 * A short excerpt around the first match, with the matches marked by \u0002…\u0003 (as SQLite's
 * snippet() does, so the search list renders both alike).
 */
export function makeSnippet(text: string, terms: readonly string[], width = 150): string {
  const f = fold(text);
  const matches = findMatches(f.text, terms);
  if (!matches.length) return text.length > width ? `${text.slice(0, width).trimEnd()}…` : text;

  // Start a little before the first match, at a word boundary.
  const [first] = toRaw(f, text, matches[0]);
  let from = Math.max(0, first - Math.round(width / 3));
  if (from > 0) {
    const space = text.indexOf(" ", from);
    from = space >= 0 && space < first ? space + 1 : from;
  }
  let to = Math.min(text.length, from + width);
  if (to < text.length) {
    const space = text.lastIndexOf(" ", to);
    if (space > first) to = space;
  }

  let out = from > 0 ? "…" : "";
  let at = from;
  for (const m of matches) {
    const [s, e] = toRaw(f, text, m);
    if (s < from) continue;
    if (s >= to) break;
    out += `${text.slice(at, s)}\u0002${text.slice(s, e)}\u0003`;
    at = e;
  }
  out += text.slice(at, Math.max(at, to));
  return to < text.length ? `${out}…` : out;
}

/** Splits a raw range into per-piece [piece, start, end] segments (a match may span items). */
export function pieceSegments(starts: readonly number[], pieces: readonly Piece[], [s, e]: [number, number]) {
  const out: { piece: number; start: number; end: number }[] = [];
  for (let k = 0; k < pieces.length; k++) {
    const a = starts[k];
    const b = a + pieces[k].text.length;
    const lo = Math.max(a, s);
    const hi = Math.min(b, e);
    if (lo < hi) out.push({ piece: k, start: lo - a, end: hi - a });
  }
  return out;
}
