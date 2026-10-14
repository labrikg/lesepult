import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import type { StoredFile } from "./repo";

interface ImportedFile extends StoredFile {
  bytes: number;
}

/** Asks for a PDF and copies it into the app's documents folder. `null` if the user cancelled. */
export async function pickAndImportPdf(): Promise<StoredFile | null> {
  const source = await open({
    title: "Attach a PDF",
    multiple: false,
    directory: false,
    filters: [{ name: "PDF", extensions: ["pdf", "PDF"] }],
  });
  if (!source) return null;
  return invoke<ImportedFile>("import_pdf", { source });
}

export const removeStoredFile = (storedPath: string) => invoke<void>("remove_stored_file", { storedPath });

/** Deletes files nobody refers to any more (e.g. after a course with PDFs was deleted). */
export const pruneStoredFiles = (keep: string[]) => invoke<number>("prune_stored_files", { keep });

let dataDir: Promise<string> | null = null;

/** URL the webview can load a stored file from (served by Tauri's asset protocol). */
export async function storedFileUrl(storedPath: string): Promise<string> {
  dataDir ??= appDataDir();
  return convertFileSrc(await join(await dataDir, storedPath));
}
