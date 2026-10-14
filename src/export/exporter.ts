import { invoke } from "@tauri-apps/api/core";
import { basename, dirname } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getDb } from "../lib/db";
import * as repo from "../lib/repo";
import { locatePage, useStore } from "../store";
import { buildLibraryExport, safeName, type ExportEntry, type LibrarySemester } from "./library";
import { pageToMarkdown } from "./markdown";

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
}

/** The open note as a Markdown file (plus an assets folder for snips), where the user chooses. */
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
        courseName: where?.course.name,
        pdfLink: doc ? { title: doc.title } : undefined,
      },
      { assetDir: "assets" },
    );
    const entries: ExportEntry[] = [
      { path: file, text: markdown },
      ...assets.map((a) => ({ path: a.linkPath, storedPath: a.storedPath })),
    ];
    await writeBundle(dir, entries);
    notify(
      assets.length
        ? `Exported ${file} with ${assets.length} image${assets.length > 1 ? "s" : ""}`
        : `Exported ${file}`,
    );
  } catch (e) {
    report(e);
  }
}

/** Opens the print dialog with just the note laid out for paper ("Save as PDF" lives there). */
export async function exportNotePdf() {
  try {
    await flush();
    const { viewMode, setViewMode } = useStore.getState();
    if (viewMode === "pdf") {
      setViewMode("split");
      await new Promise((r) => setTimeout(r, 150)); // let the note render before printing
    }
    await invoke("print_window");
  } catch (e) {
    report(e);
  }
}

/** Every semester, course, note, PDF and snip as plain files: a backup you can read without Study Hub. */
export async function exportLibrary() {
  try {
    await flush();
    const picked = await open({ title: "Choose where to put the export", directory: true, multiple: false });
    if (!picked || Array.isArray(picked)) return;
    const db = await getDb();
    const [pages, documents] = await Promise.all([repo.listAllPages(db), repo.listAllDocuments(db)]);
    const { tree } = useStore.getState();
    const semesters: LibrarySemester[] = tree.map((s) => ({
      name: s.name,
      courses: s.courses.map((c) => ({
        name: c.name,
        pages: pages.filter((p) => p.courseId === c.id),
        documents: documents.filter((d) => d.courseId === c.id),
      })),
    }));
    const entries = buildLibraryExport(semesters);
    const date = new Date().toISOString().slice(0, 10);
    const result = await writeBundle(picked, entries, `Study Hub export ${date}`);
    notify(`Exported ${result.files} files to “${await basename(result.dir)}”`);
  } catch (e) {
    report(e);
  }
}
