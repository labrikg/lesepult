import { describe, expect, it } from "vitest";
import { blocksToPlainText, extractCards, extractNoteRefs, initialBlocks } from "./content";

describe("blocksToPlainText", () => {
  it("collects text from paragraphs, links, code, LaTeX, tables and nested children", () => {
    const blocks = [
      { type: "heading", content: [{ type: "text", text: "Hashing", styles: {} }], children: [] },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "See ", styles: {} },
          { type: "link", href: "https://x", content: [{ type: "text", text: "lecture", styles: {} }] },
        ],
        children: [
          {
            type: "bulletListItem",
            content: [{ type: "text", text: "probe sequence", styles: {} }],
            children: [],
          },
        ],
      },
      {
        type: "codeBlock",
        props: { language: "python" },
        content: [{ type: "text", text: "h = k % m", styles: {} }],
      },
      { type: "latex", content: [{ type: "text", text: "h(k,i) = (h'(k) + i) \\bmod m", styles: {} }] },
      {
        type: "table",
        content: {
          type: "tableContent",
          rows: [
            {
              cells: [
                { type: "tableCell", content: [{ type: "text", text: "α", styles: {} }] },
                [{ type: "text", text: "load", styles: {} }],
              ],
            },
          ],
        },
      },
      { type: "paragraph", content: [], children: [] },
    ];
    expect(blocksToPlainText(blocks)).toBe(
      [
        "Hashing",
        "See lecture",
        "probe sequence",
        "h = k % m",
        "h(k,i) = (h'(k) + i) \\bmod m",
        "α load",
      ].join("\n"),
    );
  });

  it("returns an empty string for anything that is not a block list", () => {
    expect(blocksToPlainText(null)).toBe("");
    expect(blocksToPlainText({})).toBe("");
  });
});

describe("initialBlocks", () => {
  it("uses stored block JSON", () => {
    const blocks = [{ type: "paragraph", content: "hi" }];
    expect(initialBlocks(JSON.stringify(blocks), "ignored")).toEqual(blocks);
  });

  it("converts plain-text notes from before the editor into paragraphs", () => {
    expect(initialBlocks("[]", "line one\nline two")).toEqual([
      { type: "paragraph", content: "line one" },
      { type: "paragraph", content: "line two" },
    ]);
  });

  it("starts empty pages with the editor default", () => {
    expect(initialBlocks("[]", "   ")).toBeUndefined();
    expect(initialBlocks("not json", "")).toBeUndefined();
  });
});

describe("PDF blocks", () => {
  const blocks = [
    {
      id: "q1",
      type: "pdfQuote",
      props: { highlightId: "h1", text: "On a collision, probe a sequence", comment: "exam!" },
      children: [],
    },
    {
      id: "p",
      type: "paragraph",
      content: [],
      children: [
        { id: "s1", type: "pdfSnip", props: { snipId: "sn1", imagePath: "documents/x.png" }, children: [] },
      ],
    },
    { id: "q2", type: "pdfQuote", props: { highlightId: "", text: "orphan" }, children: [] },
  ];

  it("makes quoted highlights searchable", () => {
    expect(blocksToPlainText(blocks)).toBe("On a collision, probe a sequence\nexam!\norphan");
  });

  it("extracts links to highlights and snips, including nested blocks", () => {
    expect(extractNoteRefs(blocks)).toEqual([
      { blockId: "q1", highlightId: "h1" },
      { blockId: "s1", snipId: "sn1" },
    ]);
    expect(extractNoteRefs(null)).toEqual([]);
  });
});

describe("flashcards", () => {
  const blocks = [
    { id: "p", type: "paragraph", content: [{ type: "text", text: "Intro", styles: {} }], children: [
      { id: "c2", type: "flashcard", props: { front: "Nested?", back: "Yes", highlightId: "" }, children: [] },
    ] },
    { id: "c1", type: "flashcard", props: { front: "Was ist $\\Sigma$?", back: "Das Alphabet", highlightId: "h1" }, children: [] },
  ];

  it("finds card blocks anywhere in a note", () => {
    expect(extractCards(blocks)).toEqual([
      { blockId: "c2", front: "Nested?", back: "Yes", highlightId: null },
      { blockId: "c1", front: "Was ist $\\Sigma$?", back: "Das Alphabet", highlightId: "h1" },
    ]);
    expect(extractCards("nope")).toEqual([]);
  });

  it("makes both sides searchable", () => {
    expect(blocksToPlainText(blocks)).toBe("Intro\nNested?\nYes\nWas ist $\\Sigma$?\nDas Alphabet");
  });
});
