import { invoke } from "@tauri-apps/api/core";
import { basename, dirname } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getDb } from "../lib/db";
import * as repo from "../lib/repo";
import { locatePage, useStore } from "../store";
import { buildLibraryExport, safeName, type ExportEntry, type LibrarySemester } from "./library";
import { handwritingMarkdown, pageToMarkdown } from "./markdown";
import { inkedSheets, resolveSheetEntries, sheetBase64 } from "../ink/exportInk";
import { sheetsByPage } from "../ink/inkRepo";
import { sheetPng } from "../ink/render";

interface ExportResult {
  dir: string;
  files: number;
}

const writeBundle = (targetDir: string, entries: ExportEntry[], freshSubfolder?: string) =>
  invoke<ExportResult>("export_bundle", { targetDir, freshSubfolder: freshSubfolder ?? null, entries });

const report = (e: unknown) => useStore.setState({ error: e instanceof Error ? e.message : String(e) });
const notify = (notice: string) => useStore.setState({ notice });

async function flush() {
  await useStore.getState().flushNote?.();
  await useStore.getState().flushPad?.();
}

/** The open note as a Markdown file (plus an assets folder for snips and handwriting), where the user chooses. */
export async function exportNoteMarkdown() {
  try {
    await flush();
    const { selectedPageId, tree } = useStore.getState();
    if (!selectedPageId) return;
    const db = await getDb();
    const page = await repo.getPage(db, selectedPageId);
    if (!page) return;
    const where = locatePage(tree, page.id);
    const doc = page.documentId ? await repo.getDocument(db, page.documentId) : null;

    const target = await save({
      title: "Export note as Markdown",
      defaultPath: `${safeName(page.title)}.md`,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (!target) return;
    const file = target.toLowerCase().endsWith(".md")
      ? await basename(target)
      : `${await basename(target)}.md`;
    const dir = await dirname(target);

    const { markdown, assets } = pageToMarkdown(
      {
        title: page.title,
        content: page.content,
        plainText: page.plainText,
        semesterName: where?.semester.name,
        courseName: where ? [where.course.name, ...where.folders.map((f) => f.name)].join(" › ") : undefined,
        pdfLink: doc ? { title: doc.title } : undefined,
        tags: useStore.getState().pageTags.map((t) => t.name),
      },
      { assetDir: "assets" },
    );
    const sheets = await inkedSheets(db, page.id);
    const base = file.replace(/\.md$/i, "");
    const sheetPaths = sheets.map((_, i) => `assets/${safeName(`${base} - sheet ${i + 1}`)}.png`);
    const entries: ExportEntry[] = [
      { path: file, text: markdown + handwritingMarkdown(sheetPaths) },
      ...assets.map((a) => ({ path: a.linkPath, storedPath: a.storedPath })),
    ];
    for (const [i, s] of sheets.entries()) entries.push({ path: sheetPaths[i], base64: await sheetBase64(s) });
    await writeBundle(dir, entries);
    const images = assets.length + sheets.length;
    notify(images ? `Exported ${file} with ${images} image${images > 1 ? "s" : ""}` : `Exported ${file}`);
  } catch (e) {
    report(e);
  }
}

/** Opens the print dialog with just the note laid out for paper ("Save as PDF" lives there). */
export async function exportNotePdf() {
  try {
    await flush();
    const { viewMode, setViewMode, rightPane, setRightPane, selectedPageId } = useStore.getState();
    if (viewMode === "pdf") setViewMode("split");
    if (rightPane === "pad") setRightPane("note");
    // Handwritten sheets print after the note, one per page (hidden on screen).
    if (selectedPageId) {
      const sheets = await inkedSheets(await getDb(), selectedPageId);
      const urls = await Promise.all(sheets.map(async (s) => URL.createObjectURL(await sheetPng(s.paper, s.strokes))));
      const old = useStore.getState().printSheets;
      useStore.setState({ printSheets: { pageId: selectedPageId, urls } });
      old?.urls.forEach((u) => URL.revokeObjectURL(u));
    }
    await new Promise((r) => setTimeout(r, 250)); // let the note and the sheet images render first
    await invoke("print_window");
  } catch (e) {
    report(e);
  }
}

/** Every semester, course, note, PDF and snip as plain files: a backup you can read without Lesepult. */
export async function exportLibrary() {
  try {
    await flush();
    const picked = await open({ title: "Choose where to put the export", directory: true, multiple: false });
    if (!picked || Array.isArray(picked)) return;
    const db = await getDb();
    const [pages, documents, tagsByPage, sheets] = await Promise.all([
      repo.listAllPages(db),
      repo.listAllDocuments(db),
      repo.allPageTags(db),
      sheetsByPage(db),
    ]);
    const { tree } = useStore.getState();
    const semesters: LibrarySemester[] = tree.map((s) => ({
      name: s.name,
      courses: s.courses.map((c) => ({
        name: c.name,
        pages: pages
          .filter((p) => p.courseId === c.id)
          .map((p) => ({ ...p, tags: tagsByPage.get(p.id) ?? [], sheets: sheets.get(p.id)?.length ?? 0 })),
        folders: c.folders.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId })),
        documents: documents.filter((d) => d.courseId === c.id),
      })),
    }));
    const entries = await resolveSheetEntries(db, buildLibraryExport(semesters));
    const date = new Date().toISOString().slice(0, 10);
    const result = await writeBundle(picked, entries, `Lesepult export ${date}`);
    notify(`Exported ${result.files} files to “${await basename(result.dir)}”`);
  } catch (e) {
    report(e);
  }
}
