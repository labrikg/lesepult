import { describe, expect, it } from "vitest";
import { buildLibraryExport, safeName, uniqueNamer } from "./library";

describe("file names", () => {
  it("removes characters that aren't allowed in file names", () => {
    expect(safeName('Lecture 07: Hashing / "open" addressing?')).toBe(
      "Lecture 07 - Hashing - -open- addressing-",
    );
    expect(safeName("Hashing: open addressing")).toBe("Hashing - open addressing");
    expect(safeName("   ")).toBe("Untitled");
    expect(safeName("..hidden")).toBe("hidden");
    expect(safeName("Winter 26/27")).toBe("Winter 26-27");
    expect(safeName("x".repeat(200))).toHaveLength(80);
  });

  it("numbers duplicates, ignoring case", () => {
    const name = uniqueNamer();
    expect(name("Notes", ".md")).toBe("Notes.md");
    expect(name("notes", ".md")).toBe("notes (2).md");
    expect(name("Notes", ".md")).toBe("Notes (3).md");
  });
});

describe("library export", () => {
  it("lays out semesters, courses, notes, PDFs and snip images", () => {
    const snip = (path: string) =>
      JSON.stringify([{ type: "pdfSnip", props: { imagePath: path, source: "Slides", pageNumber: 2 } }]);
    const entries = buildLibraryExport([
      {
        name: "Winter 26/27",
        courses: [
          {
            name: "Algorithms",
            documents: [{ id: "d1", title: "Lecture 07", storedPath: "documents/d1.pdf" }],
            pages: [
              {
                id: "p1",
                title: "Hashing",
                content: snip("documents/s1.png"),
                plainText: "",
                documentId: "d1",
                tags: ["exam"],
              },
              {
                id: "p2",
                title: "Hashing",
                content: snip("documents/s1.png"),
                plainText: "",
                documentId: null,
              },
              { id: "p3", title: "", content: "[]", plainText: "", documentId: null },
            ],
          },
        ],
      },
    ]);
    expect(entries.map((e) => e.path)).toEqual([
      "Winter 26-27/Algorithms/PDFs/Lecture 07.pdf",
      "Winter 26-27/Algorithms/Hashing.md",
      "Winter 26-27/Algorithms/assets/s1.png",
      "Winter 26-27/Algorithms/Hashing (2).md",
      "Winter 26-27/Algorithms/Untitled.md",
    ]);
    expect(entries[0].storedPath).toBe("documents/d1.pdf");
    expect(entries[2].storedPath).toBe("documents/s1.png");
    expect(entries[1].text).toContain("PDF: [Lecture 07](<PDFs/Lecture 07.pdf>)");
    expect(entries[1].text).toContain("![Snip from Slides, page 2](<assets/s1.png>)");
    expect(entries[3].text).not.toContain("PDF:");
    expect(entries[1].text).toContain("Tags: #exam");
    expect(entries[3].text).not.toContain("Tags:");
  });
});
