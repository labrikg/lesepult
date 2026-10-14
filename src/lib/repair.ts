import type { Db } from "./db";
import * as repo from "./repo";
import { fixAccents } from "../pdf/mathText";
import { blocksToPlainText } from "../editor/content";

const ACCENTS_FIXED = "repair.accents.v1";

/**
 * Highlights made before umlauts were repaired read "nat¨urlich". Fixes their stored text and the
 * quotes in notes once, so search finds "natürlich". Runs once per database.
 */
export async function repairOldPdfText(db: Db) {
  if (await repo.kvGet(db, ACCENTS_FIXED)) return;

  for (const h of await repo.listHighlightTexts(db)) {
    const fixed = fixAccents(h.text);
    if (fixed !== h.text) await repo.setHighlightText(db, h.id, fixed);
  }

  for (const page of await repo.listPagesWithQuotes(db)) {
    let blocks: unknown;
    try {
      blocks = JSON.parse(page.content);
    } catch {
      continue;
    }
    if (fixQuotes(blocks)) {
      await repo.rewritePageContent(db, page.id, JSON.stringify(blocks), blocksToPlainText(blocks as never));
    }
  }

  await repo.kvSet(db, ACCENTS_FIXED, new Date().toISOString());
}

/** Fixes pdfQuote texts in place; returns whether anything changed. */
export function fixQuotes(blocks: unknown): boolean {
  if (!Array.isArray(blocks)) return false;
  let changed = false;
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    const block = b as { type?: string; props?: Record<string, unknown>; children?: unknown };
    if (block.type === "pdfQuote" && block.props) {
      for (const key of ["text", "comment"]) {
        const v = block.props[key];
        if (typeof v === "string" && fixAccents(v) !== v) {
          block.props[key] = fixAccents(v);
          changed = true;
        }
      }
    }
    if (fixQuotes(block.children)) changed = true;
  }
  return changed;
}
