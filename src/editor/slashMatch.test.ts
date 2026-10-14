import { describe, expect, it } from "vitest";
import { findExactSlashItem } from "./slashMatch";

const items = [
  { title: "Heading 1", aliases: ["h", "h1", "title"] },
  { title: "Heading 2", aliases: ["h2", "subheading"] },
  { title: "Code Block", aliases: ["code", "pre"] },
  { title: "LaTeX formula", aliases: ["latex", "math"] },
];

describe("findExactSlashItem", () => {
  it("matches titles and aliases exactly, ignoring case and spacing", () => {
    expect(findExactSlashItem(items, "latex")?.title).toBe("LaTeX formula");
    expect(findExactSlashItem(items, "LaTeX")?.title).toBe("LaTeX formula");
    expect(findExactSlashItem(items, "h2")?.title).toBe("Heading 2");
    expect(findExactSlashItem(items, "codeblock")?.title).toBe("Code Block");
    expect(findExactSlashItem(items, "code-block")?.title).toBe("Code Block");
    expect(findExactSlashItem(items, "heading 1")?.title).toBe("Heading 1");
  });

  it("prefers a title over another item's alias", () => {
    const withClash = [{ title: "Quote", aliases: ["math"] }, ...items];
    expect(findExactSlashItem(withClash, "latex formula")?.title).toBe("LaTeX formula");
  });

  it("ignores partial or empty queries", () => {
    expect(findExactSlashItem(items, "lat")).toBeUndefined();
    expect(findExactSlashItem(items, "")).toBeUndefined();
    expect(findExactSlashItem(items, "  ")).toBeUndefined();
  });
});
