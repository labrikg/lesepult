import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "./db";
import * as repo from "./repo";
import * as pdfText from "./pdfTextRepo";
import { memoryDb } from "./testDb";

const file = (name: string) => ({ fileName: name, storedPath: `documents/${name}`, sha256: name });
const mark = (s: string) => s.replace(/\u0002/g, "[").replace(/\u0003/g, "]");

describe("PDF text search", () => {
  let db: Db;
  let course: string;
  let vl3: string;
  let vl4: string;
  let page3: string;

  beforeEach(async () => {
    db = memoryDb();
    const s = await repo.createSemester(db, "Winter 26/27");
    course = await repo.createCourse(db, s, "Datenkommunikation");
    page3 = await repo.createPage(db, course, "VL 3");
    vl3 = await repo.createDocument(db, course, file("vl3.pdf"));
    await repo.updatePage(db, page3, { documentId: vl3 });
    const page4 = await repo.createPage(db, course, "VL 4");
    vl4 = await repo.createDocument(db, course, file("vl4.pdf"));
    await repo.updatePage(db, page4, { documentId: vl4 });
  });

  it("indexes PDFs once per extraction version", async () => {
    expect((await pdfText.documentsToIndex(db)).map((d) => d.id).sort()).toEqual([vl3, vl4].sort());
    expect(await pdfText.documentPageTexts(db, vl3)).toBeNull();
    await pdfText.saveDocumentText(db, vl3, ["Titelfolie", "", "Überlastkontrolle bei TCP"]);
    expect((await pdfText.documentsToIndex(db)).map((d) => d.id)).toEqual([vl4]);
    expect(await pdfText.documentPageTexts(db, vl3)).toEqual(
      new Map([
        [1, "Titelfolie"],
        [3, "Überlastkontrolle bei TCP"],
      ]),
    );
  });

  it("finds pages by parts of words, one hit per PDF with all its pages", async () => {
    await pdfText.saveDocumentText(db, vl3, [
      "Flusskontrolle: der Empfänger bremst",
      "Überlastkontrolle: das Netz bremst. Kontrolle über alles.",
      "Nichts hier",
      "Staukontrolle nochmal",
    ]);
    await pdfText.saveDocumentText(db, vl4, ["IP-Adressen und Routing"]);

    const hits = await pdfText.searchPdfs(db, "kontrolle");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ documentId: vl3, pageId: page3, title: "vl3", courseName: "Datenkommunikation" });
    expect(hits[0].pages).toEqual([1, 2, 4]);
    expect(hits[0].pages).toContain(hits[0].pageNumber);
    expect(mark(hits[0].snippet)).toMatch(/\[[Kk]ontrolle\]/);

    // Accents and case don't matter; every word must be on the page.
    expect((await pdfText.searchPdfs(db, "uberlast NETZ")).map((h) => h.pages)).toEqual([[2]]);
    expect(await pdfText.searchPdfs(db, "uberlast routing")).toEqual([]);
    // Words shorter than three letters still count.
    expect((await pdfText.searchPdfs(db, "ip routing")).map((h) => h.documentId)).toEqual([vl4]);
  });

  it("filters by the note's tags", async () => {
    await pdfText.saveDocumentText(db, vl3, ["Routing im Netz"]);
    await pdfText.saveDocumentText(db, vl4, ["Routing mit Dijkstra"]);
    await repo.tagPage(db, page3, "klausur");
    expect((await pdfText.searchPdfs(db, "routing #klau")).map((h) => h.documentId)).toEqual([vl3]);
  });

  it("forgets the text of deleted PDFs", async () => {
    await pdfText.saveDocumentText(db, vl3, ["Routing im Netz"]);
    await repo.detachDocument(db, page3);
    expect(await pdfText.searchPdfs(db, "routing")).toEqual([]);
    // A document deleted while it was being read leaves nothing behind either.
    await pdfText.saveDocumentText(db, vl3, ["Routing im Netz"]);
    expect(await pdfText.searchPdfs(db, "routing")).toEqual([]);
  });
});
