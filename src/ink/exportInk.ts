import type { Db } from "../lib/db";
import type { ExportEntry } from "../export/library";
import { listSheets, sheetsByPage } from "./inkRepo";
import type { Sheet } from "./model";
import { sheetPng } from "./render";

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export const sheetBase64 = async (s: Sheet) => blobToBase64(await sheetPng(s.paper, s.strokes));

/** A page's sheets that have ink, in order (empty sheets aren't exported). */
export async function inkedSheets(db: Db, pageId: string): Promise<Sheet[]> {
  return (await listSheets(db, pageId)).filter((s) => s.strokes.length > 0);
}

/** Draws the sheets that export entries refer to, one at a time (each is a large canvas). */
export async function resolveSheetEntries(db: Db, entries: ExportEntry[]): Promise<ExportEntry[]> {
  if (!entries.some((e) => e.sheet)) return entries;
  const byPage = await sheetsByPage(db);
  const out: ExportEntry[] = [];
  for (const e of entries) {
    if (!e.sheet) {
      out.push(e);
      continue;
    }
    const sheet = byPage.get(e.sheet.pageId)?.[e.sheet.index];
    if (sheet) out.push({ path: e.path, base64: await sheetBase64(sheet) });
  }
  return out;
}
