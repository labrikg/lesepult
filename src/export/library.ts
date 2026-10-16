import { handwritingMarkdown, pageToMarkdown } from "./markdown";

/** One file to write: either text, or a copy of a file from Lesepult's data folder. */
export interface ExportEntry {
  /** Relative path inside the export folder, "/"-separated. */
  path: string;
  text?: string;
  storedPath?: string;
  /** Bytes made in the app, base64-encoded (filled in from `sheet` before writing). */
  base64?: string;
  /** A handwritten sheet still to be drawn as PNG: the page and the sheet's 0-based index. */
  sheet?: { pageId: string; index: number };
}

/** Turns a title into a safe file or folder name on macOS, Linux and Windows. */
export function safeName(name: string, fallback = "Untitled"): string {
  const cleaned = name
    .normalize("NFC")
    .replace(/\s*:\s*/g, " - ") // "Hashing: open addressing" → "Hashing - open addressing"
    .replace(/[/\\*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[.\s-]+/, "")
    .slice(0, 80)
    .replace(/[.\s]+$/, ""); // Windows drops trailing dots and spaces
  if (!cleaned) return fallback;
  // Windows reserves device names, whatever follows the first dot ("Aux.md", "nul.backup.md").
  return cleaned.replace(/^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?=\.|$)/i, "$1_");
}

/** Picks names that don't collide (case-insensitively) within one folder: "Notes", "Notes (2)", … */
export function uniqueNamer() {
  const used = new Set<string>();
  return (base: string, ext = "") => {
    let name = `${base}${ext}`;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base} (${i})${ext}`;
    used.add(name.toLowerCase());
    return name;
  };
}

export interface LibraryPage {
  id: string;
  title: string;
  content: string;
  plainText: string;
  documentId: string | null;
  tags?: string[];
  /** The folder it sits in (null or missing: directly in the course). */
  folderId?: string | null;
  /** How many handwritten sheets (with ink) the page has. */
  sheets?: number;
}

export interface LibraryFolder {
  id: string;
  name: string;
  parentId: string | null;
}

export interface LibraryDocument {
  id: string;
  title: string;
  storedPath: string;
}

export interface LibraryCourse {
  name: string;
  pages: LibraryPage[];
  documents: LibraryDocument[];
  folders?: LibraryFolder[];
}

export interface LibrarySemester {
  name: string;
  courses: LibraryCourse[];
}

/**
 * The whole library as files: Semester/Course/[Folder/…]/Page.md, the course's PDFs in
 * Course/PDFs/, snip images and handwritten sheets in Course/assets/. Notes link to them with
 * relative paths.
 */
export function buildLibraryExport(semesters: LibrarySemester[]): ExportEntry[] {
  const entries: ExportEntry[] = [];
  const semesterNames = uniqueNamer();
  for (const semester of semesters) {
    const sDir = semesterNames(safeName(semester.name, "Semester"));
    const courseNames = uniqueNamer();
    for (const course of semester.courses) {
      const cDir = `${sDir}/${courseNames(safeName(course.name, "Course"))}`;

      // One namer per directory (keyed by folder id, "" = the course folder), shared by
      // folders and notes in it. "PDFs" and "assets" are taken at the course level.
      const namers = new Map<string, ReturnType<typeof uniqueNamer>>();
      const namerFor = (key: string) => {
        if (!namers.has(key)) {
          const n = uniqueNamer();
          if (key === "") {
            n("PDFs");
            n("assets");
          }
          namers.set(key, n);
        }
        return namers.get(key)!;
      };

      // PDFs first, so notes can link to them by their final file name.
      const pdfNames = uniqueNamer();
      const pdfPath = new Map<string, string>();
      for (const doc of course.documents) {
        const file = pdfNames(safeName(doc.title, "Document"), ".pdf");
        pdfPath.set(doc.id, `PDFs/${file}`);
        entries.push({ path: `${cDir}/PDFs/${file}`, storedPath: doc.storedPath });
      }

      // Folder paths relative to the course folder (a parent always resolves before its child).
      const folders = course.folders ?? [];
      const byId = new Map(folders.map((f) => [f.id, f]));
      const folderDir = new Map<string, string[]>();
      const dirOf = (id: string, guard = 0): string[] => {
        const known = folderDir.get(id);
        if (known) return known;
        const f = byId.get(id);
        if (!f || guard > 64) return [];
        const parent = f.parentId && byId.has(f.parentId) ? dirOf(f.parentId, guard + 1) : [];
        const dir = [...parent, namerFor(f.parentId && byId.has(f.parentId) ? f.parentId : "")(safeName(f.name, "Folder"))];
        folderDir.set(id, dir);
        return dir;
      };
      for (const f of folders) dirOf(f.id);

      const assets = new Set<string>();
      const sheetNames = uniqueNamer();
      for (const page of course.pages) {
        const folderId = page.folderId && byId.has(page.folderId) ? page.folderId : null;
        const dir = folderId ? dirOf(folderId) : [];
        const up = "../".repeat(dir.length);
        const doc = page.documentId ? course.documents.find((d) => d.id === page.documentId) : undefined;
        const { markdown, assets: pageAssets } = pageToMarkdown(
          {
            title: page.title,
            content: page.content,
            plainText: page.plainText,
            semesterName: semester.name,
            courseName: [course.name, ...dir.map((_, i) => folderNameAt(folders, folderId, i))].join(" › "),
            pdfLink: doc ? { title: doc.title, path: `${up}${pdfPath.get(doc.id)!}` } : undefined,
            tags: page.tags,
          },
          { assetDir: `${up}assets` },
        );
        const file = namerFor(folderId ?? "")(safeName(page.title), ".md");
        const sheetFiles = Array.from({ length: page.sheets ?? 0 }, (_, i) =>
          sheetNames(`${safeName(page.title)} - sheet ${i + 1}`, ".png"),
        );
        const ink = handwritingMarkdown(sheetFiles.map((f) => `${up}assets/${f}`));
        entries.push({ path: [cDir, ...dir, file].join("/"), text: markdown + ink });
        sheetFiles.forEach((f, index) =>
          entries.push({ path: `${cDir}/assets/${f}`, sheet: { pageId: page.id, index } }),
        );
        for (const a of pageAssets) {
          const name = a.storedPath.split("/").pop() ?? a.storedPath;
          if (assets.has(name)) continue;
          assets.add(name);
          entries.push({ path: `${cDir}/assets/${name}`, storedPath: a.storedPath });
        }
      }
    }
  }
  return entries;
}

/** The real (unsanitised) name of the i-th folder on the way to `folderId`, for the note header. */
function folderNameAt(folders: LibraryFolder[], folderId: string | null, i: number): string {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: string[] = [];
  for (let f = folderId ? byId.get(folderId) : undefined; f && path.length < 64; f = f.parentId ? byId.get(f.parentId) : undefined)
    path.unshift(f.name);
  return path[i] ?? "";
}
