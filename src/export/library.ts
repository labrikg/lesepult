import { pageToMarkdown } from "./markdown";

/** One file to write: either text, or a copy of a file from Lesepult's data folder. */
export interface ExportEntry {
  /** Relative path inside the export folder, "/"-separated. */
  path: string;
  text?: string;
  storedPath?: string;
}

/** Turns a title into a safe file or folder name on macOS, Linux and Windows. */
export function safeName(name: string, fallback = "Untitled"): string {
  const cleaned = name
    .normalize("NFC")
    .replace(/\s*:\s*/g, " - ") // "Hashing: open addressing" → "Hashing - open addressing"
    .replace(/[/\\*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[.\s-]+|[.\s]+$/g, "")
    .slice(0, 80)
    .trim();
  return cleaned || fallback;
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
}

export interface LibrarySemester {
  name: string;
  courses: LibraryCourse[];
}

/**
 * The whole library as files: Semester/Course/Page.md, the course's PDFs in Course/PDFs/,
 * snip images in Course/assets/. Each note links to its PDF.
 */
export function buildLibraryExport(semesters: LibrarySemester[]): ExportEntry[] {
  const entries: ExportEntry[] = [];
  const semesterNames = uniqueNamer();
  for (const semester of semesters) {
    const sDir = semesterNames(safeName(semester.name, "Semester"));
    const courseNames = uniqueNamer();
    for (const course of semester.courses) {
      const cDir = `${sDir}/${courseNames(safeName(course.name, "Course"))}`;

      // PDFs first, so notes can link to them by their final file name.
      const pdfNames = uniqueNamer();
      const pdfPath = new Map<string, string>();
      for (const doc of course.documents) {
        const file = pdfNames(safeName(doc.title, "Document"), ".pdf");
        pdfPath.set(doc.id, `PDFs/${file}`);
        entries.push({ path: `${cDir}/PDFs/${file}`, storedPath: doc.storedPath });
      }

      const pageNames = uniqueNamer();
      const assets = new Set<string>();
      for (const page of course.pages) {
        const doc = page.documentId ? course.documents.find((d) => d.id === page.documentId) : undefined;
        const { markdown, assets: pageAssets } = pageToMarkdown(
          {
            title: page.title,
            content: page.content,
            plainText: page.plainText,
            semesterName: semester.name,
            courseName: course.name,
            pdfLink: doc ? { title: doc.title, path: pdfPath.get(doc.id)! } : undefined,
          },
          { assetDir: "assets" },
        );
        entries.push({ path: `${cDir}/${pageNames(safeName(page.title), ".md")}`, text: markdown });
        for (const a of pageAssets) {
          if (assets.has(a.linkPath)) continue;
          assets.add(a.linkPath);
          entries.push({ path: `${cDir}/${a.linkPath}`, storedPath: a.storedPath });
        }
      }
    }
  }
  return entries;
}
