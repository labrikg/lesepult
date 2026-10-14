import { describe, expect, it } from "vitest";
import { blocksToPlainText, initialBlocks } from "./content";

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
