import { describe, expect, it } from "vitest";
import {
  countMatches,
  findMatches,
  fold,
  joinPieces,
  makeSnippet,
  pageText,
  pieceSegments,
  queryTerms,
  toRaw,
  type Piece,
} from "./textMatch";

const mark = (s: string) => s.replace(/\u0002/g, "[").replace(/\u0003/g, "]");

describe("PDF text matching", () => {
  it("ignores case and accents, also TeX's spacing umlauts", () => {
    const terms = queryTerms("naturlich");
    expect(countMatches("Natürlich", terms)).toBe(1);
    expect(countMatches("nat¨urlich", terms)).toBe(1);
    expect(countMatches("NATÜRLICH und natürlich", terms)).toBe(2);
  });

  it("finds parts of words and joins words split at a line end", () => {
    expect(countMatches("Staukontrolle und Flusskontrolle", queryTerms("kontrolle"))).toBe(2);
    expect(countMatches("Daten-\nkommunikation", queryTerms("datenkommunikation"))).toBe(1);
    // A real dash before a capital stays: "TCP-\nVerbindung" is not "tcpverbindung".
    expect(countMatches("TCP-\nVerbindung", queryTerms("tcpverbindung"))).toBe(0);
  });

  it("matches each word of the query, without overlaps", () => {
    const terms = queryTerms('#exam "slow" start');
    expect(terms).toEqual(["start", "slow"]);
    expect(findMatches("slow start: slowstart", terms)).toEqual([
      [0, 4],
      [5, 10],
      [12, 16],
      [16, 21],
    ]);
  });

  it("maps matches back to the original text and to text items", () => {
    const pieces: Piece[] = [
      { text: "Die Über", eol: false },
      { text: "last-", eol: true },
      { text: "kontrolle greift.", eol: false },
    ];
    const { raw, starts } = joinPieces(pieces);
    const f = fold(raw);
    const [m] = findMatches(f.text, queryTerms("uberlastkontrolle"));
    const range = toRaw(f, raw, m);
    expect(raw.slice(...range)).toBe("Überlast-\nkontrolle");
    expect(pieceSegments(starts, pieces, range)).toEqual([
      { piece: 0, start: 4, end: 8 },
      { piece: 1, start: 0, end: 5 },
      { piece: 2, start: 0, end: 9 },
    ]);
  });

  it("stores a page as clean text", () => {
    const pieces: Piece[] = [
      { text: "Satz 1:", eol: true },
      { text: "Jede nat¨urliche Zahl ist Daten-", eol: true },
      { text: "kommunikation", eol: false },
      { text: "  ", eol: false },
      { text: "pur.", eol: false },
    ];
    expect(pageText(pieces)).toBe("Satz 1: Jede natürliche Zahl ist Datenkommunikation pur.");
  });

  it("makes snippets around the first match", () => {
    const text = `${"Lorem ipsum dolor sit amet ".repeat(8)}Die Staukontrolle von TCP halbiert das Fenster. ${"Mehr Text ".repeat(20)}`;
    const s = mark(makeSnippet(text, queryTerms("kontrolle tcp"), 80));
    expect(s.startsWith("…")).toBe(true);
    expect(s).toContain("Die Stau[kontrolle] von [TCP] halbiert");
    expect(s.endsWith("…")).toBe(true);
    expect(s.length).toBeLessThan(100);
    expect(mark(makeSnippet("Übung zur Überlast", queryTerms("uber")))).toBe("Übung zur [Über]last");
  });
});
