import { describe, expect, it } from "vitest";
import { blocksToMarkdown, inlineToMarkdown, pageToMarkdown, toHashtag } from "./markdown";

const t = (text: string, styles: Record<string, boolean> = {}) => ({ type: "text", text, styles });
const p = (...content: unknown[]) => ({ type: "paragraph", content, children: [] });

describe("inline Markdown", () => {
  it("applies styles, keeps spaces outside markers and escapes Markdown characters", () => {
    expect(
      inlineToMarkdown([
        t("Load "),
        t("factor ", { bold: true }),
        t("α", { italic: true }),
        t(" < 1 * really"),
        t(" h(k)", { code: true }),
        t("gone", { strike: true }),
        t("u", { underline: true }),
      ]),
    ).toBe("Load **factor** *α* \\< 1 \\* really` h(k)`~~gone~~<u>u</u>");
  });

  it("renders links and code containing backticks", () => {
    expect(inlineToMarkdown([{ type: "link", href: "https://example.org/a b", content: [t("docs")] }])).toBe(
      "[docs](<https://example.org/a b>)",
    );
    expect(inlineToMarkdown([t("a`b", { code: true })])).toBe("``a`b``");
  });
});

describe("block Markdown", () => {
  it("converts headings, lists, quotes, code, LaTeX, tables and dividers", () => {
    const blocks = [
      { type: "heading", props: { level: 2 }, content: [t("Probe sequences")], children: [] },
      p(t("Intro.")),
      {
        type: "bulletListItem",
        content: [t("linear")],
        children: [{ type: "bulletListItem", content: [t("clusters")], children: [] }],
      },
      { type: "bulletListItem", content: [t("quadratic")], children: [] },
      { type: "numberedListItem", content: [t("first")], children: [] },
      { type: "numberedListItem", content: [t("second")], children: [] },
      { type: "checkListItem", props: { checked: true }, content: [t("read slides")], children: [] },
      { type: "checkListItem", props: { checked: false }, content: [t("exercise 4")], children: [] },
      { type: "quote", content: [t("Hashing is fun")], children: [] },
      {
        type: "codeBlock",
        props: { language: "python" },
        content: [t("def h(k):\n    return k % m")],
        children: [],
      },
      { type: "codeBlock", props: { language: "text" }, content: [t("plain")], children: [] },
      { type: "latex", content: [t("h(k,i) = (h'(k) + i) \\bmod m")], children: [] },
      { type: "divider", children: [] },
      {
        type: "table",
        content: {
          type: "tableContent",
          rows: [
            { cells: [[t("Method")], [t("Cost | avg")]] },
            { cells: [{ type: "tableCell", content: [t("chaining")] }, [t("Θ(1+α)")]] },
          ],
        },
        children: [],
      },
      p(),
    ];
    expect(blocksToMarkdown(blocks).markdown).toBe(
      [
        "## Probe sequences",
        "",
        "Intro.",
        "",
        "- linear",
        "  - clusters",
        "- quadratic",
        "1. first",
        "2. second",
        "- [x] read slides",
        "- [ ] exercise 4",
        "",
        "> Hashing is fun",
        "",
        "```python",
        "def h(k):",
        "    return k % m",
        "```",
        "",
        "```",
        "plain",
        "```",
        "",
        "$$",
        "h(k,i) = (h'(k) + i) \\bmod m",
        "$$",
        "",
        "---",
        "",
        "| Method | Cost \\| avg |",
        "| --- | --- |",
        "| chaining | Θ(1+α) |",
        "",
      ].join("\n"),
    );
  });

  it("shifts headings below the page title when asked", () => {
    const md = blocksToMarkdown([{ type: "heading", props: { level: 1 }, content: [t("A")] }], {
      headingOffset: 1,
    });
    expect(md.markdown).toBe("## A\n");
  });

  it("exports quoted highlights with source and note, and snips with copied images", () => {
    const { markdown, assets } = blocksToMarkdown(
      [
        {
          type: "pdfQuote",
          props: { text: "On a collision, probe", comment: "exam", source: "Lecture 07", pageNumber: 6 },
          children: [],
        },
        {
          type: "pdfSnip",
          props: { imagePath: "documents/abc.png", source: "Lecture 07", pageNumber: 7 },
          children: [],
        },
        { type: "pdfSnip", props: { imagePath: "documents/abc.png", source: "Lecture 07", pageNumber: 7 } },
      ],
      { assetDir: "assets" },
    );
    expect(markdown).toBe(
      [
        "> On a collision, probe",
        ">",
        "> — *Lecture 07*, p. 6",
        ">",
        "> **Note:** exam",
        "",
        "![Snip from Lecture 07, page 7](<assets/abc.png>)",
        "",
        "![Snip from Lecture 07, page 7](<assets/abc.png>)",
        "",
      ].join("\n"),
    );
    expect(assets).toEqual([{ storedPath: "documents/abc.png", linkPath: "assets/abc.png" }]);
  });

  it("keeps formulas in quotes as $…$ and repairs old umlauts", () => {
    const { markdown } = blocksToMarkdown([
      {
        type: "pdfQuote",
        props: { text: "Zu zwei nat¨urlichen Zahlen $i_1, i_2 \\in \\mathbf{N}$ (*Eingabe*) kostet \\$5", pageNumber: 18 },
      },
    ]);
    expect(markdown.split("\n")[0]).toBe(
      "> Zu zwei natürlichen Zahlen $i_1, i_2 \\in \\mathbf{N}$ (\\*Eingabe\\*) kostet \\$5",
    );
  });

  it("keeps a quote's line breaks and indentation", () => {
    const { markdown } = blocksToMarkdown([
      {
        type: "pdfQuote",
        props: { text: "Bonussystem\n   Wer mehr als 50% hat\n      – linear von $50\\%$ bis 95%", pageNumber: 46 },
      },
    ]);
    expect(markdown.split("\n").slice(0, 3)).toEqual([
      "> Bonussystem  ",
      "> \u00a0\u00a0\u00a0Wer mehr als 50% hat  ",
      "> \u00a0\u00a0\u00a0\u00a0\u00a0\u00a0– linear von $50\\%$ bis 95%",
    ]);
  });

  it("exports flashcards as question and answer", () => {
    const { markdown } = blocksToMarkdown([
      { type: "flashcard", props: { front: "Was ist $\\Sigma$?", back: "Das *Alphabet*" } },
    ]);
    expect(markdown).toBe("> **Q:** Was ist $\\Sigma$?\n>\n> **A:** Das \\*Alphabet\\*\n");
  });

  it("returns nothing for empty notes", () => {
    expect(blocksToMarkdown([p(), p()]).markdown).toBe("");
    expect(blocksToMarkdown(null).markdown).toBe("");
  });
});

describe("page Markdown", () => {
  it("adds title, course and PDF link, and falls back to plain text", () => {
    const { markdown } = pageToMarkdown({
      title: "Hashing",
      content: "[]",
      plainText: "Line one\nLine two",
      semesterName: "Winter 26/27",
      courseName: "Algorithms",
      pdfLink: { title: "Lecture 07", path: "PDFs/Lecture 07.pdf" },
    });
    expect(markdown).toBe(
      [
        "# Hashing",
        "",
        "*Winter 26/27 · Algorithms*",
        "",
        "PDF: [Lecture 07](<PDFs/Lecture 07.pdf>)",
        "",
        "Line one",
        "",
        "Line two",
        "",
      ].join("\n"),
    );
  });

  it("lists tags as hashtags under the course line", () => {
    const { markdown } = pageToMarkdown({
      title: "Hashing",
      content: "[]",
      plainText: "",
      courseName: "Algorithms",
      tags: ["Exam", "AVL trees", "??"],
    });
    expect(markdown).toBe(["# Hashing", "", "*Algorithms*", "", "Tags: #Exam #AVL-trees", ""].join("\n"));
  });

  it("turns tag names into hashtags", () => {
    expect(toHashtag("Klausur WS 26/27")).toBe("#Klausur-WS-26/27");
    expect(toHashtag("  c++ & rust ")).toBe("#c-rust");
    expect(toHashtag("Übung")).toBe("#Übung");
    expect(toHashtag("!!!")).toBe("");
  });
});
