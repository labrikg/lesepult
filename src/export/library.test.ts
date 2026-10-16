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
    expect(safeName(`${"x".repeat(79)}. more`)).toHaveLength(79);
  });

  it("avoids names Windows reserves for devices", () => {
    expect(safeName("Aux")).toBe("Aux_");
    expect(safeName("con")).toBe("con_");
    expect(safeName("COM1")).toBe("COM1_");
    expect(safeName("nul.backup")).toBe("nul_.backup");
    expect(safeName("Auxiliary")).toBe("Auxiliary");
    expect(safeName("Console")).toBe("Console");
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

  it("writes folders as directories and links back up to PDFs and snips", () => {
    const snip = JSON.stringify([{ type: "pdfSnip", props: { imagePath: "documents/s9.png", pageNumber: 1 } }]);
    const entries = buildLibraryExport([
      {
        name: "WS",
        courses: [
          {
            name: "Datenkommunikation",
            documents: [{ id: "d1", title: "VL 01", storedPath: "documents/d1.pdf" }],
            folders: [
              { id: "f1", name: "Vorlesungen", parentId: null },
              { id: "f2", name: "Kapitel 1", parentId: "f1" },
              { id: "f3", name: "PDFs", parentId: null },
            ],
            pages: [
              { id: "p1", title: "TCP", content: snip, plainText: "", documentId: "d1", folderId: "f2" },
              { id: "p2", title: "Overview", content: "[]", plainText: "", documentId: null, folderId: null },
            ],
          },
        ],
      },
    ]);
    const paths = entries.map((e) => e.path);
    expect(paths).toContain("WS/Datenkommunikation/Vorlesungen/Kapitel 1/TCP.md");
    expect(paths).toContain("WS/Datenkommunikation/Overview.md");
    expect(paths).toContain("WS/Datenkommunikation/assets/s9.png");
    const tcp = entries.find((e) => e.path.endsWith("TCP.md"))!.text!;
    expect(tcp).toContain("PDF: [VL 01](<../../PDFs/VL 01.pdf>)");
    expect(tcp).toContain("(<../../assets/s9.png>)");
    expect(tcp).toContain("*WS · Datenkommunikation › Vorlesungen › Kapitel 1*");
    // A folder can't take the name of the PDFs folder.
    expect(paths.some((p) => p.includes("/PDFs (2)"))).toBe(false); // empty folders write nothing
  });

  it("adds handwritten sheets as images below the note, linked from a sub-folder too", () => {
    const entries = buildLibraryExport([
      {
        name: "Winter",
        courses: [
          {
            name: "Algorithms",
            documents: [],
            folders: [{ id: "f1", name: "Lectures", parentId: null }],
            pages: [
              { id: "p1", title: "Hashing", content: "[]", plainText: "", documentId: null, sheets: 2 },
              { id: "p2", title: "Trees", content: "[]", plainText: "", documentId: null, folderId: "f1", sheets: 1 },
              { id: "p3", title: "Empty", content: "[]", plainText: "", documentId: null },
            ],
          },
        ],
      },
    ]);
    const md = (path: string) => entries.find((e) => e.path === path)?.text ?? "";
    expect(md("Winter/Algorithms/Hashing.md")).toContain(
      "## Handwritten\n\n![Sheet 1](<assets/Hashing - sheet 1.png>)\n\n![Sheet 2](<assets/Hashing - sheet 2.png>)",
    );
    expect(md("Winter/Algorithms/Lectures/Trees.md")).toContain("![Sheet 1](<../assets/Trees - sheet 1.png>)");
    expect(md("Winter/Algorithms/Empty.md")).not.toContain("Handwritten");
    expect(entries.filter((e) => e.sheet)).toEqual([
      { path: "Winter/Algorithms/assets/Hashing - sheet 1.png", sheet: { pageId: "p1", index: 0 } },
      { path: "Winter/Algorithms/assets/Hashing - sheet 2.png", sheet: { pageId: "p1", index: 1 } },
      { path: "Winter/Algorithms/assets/Trees - sheet 1.png", sheet: { pageId: "p2", index: 0 } },
    ]);
  });
});
