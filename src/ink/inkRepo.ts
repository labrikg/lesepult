import { type Db, now, uid } from "../lib/db";
import { isPaper, parseStrokes, type Paper, type Sheet, type Stroke } from "./model";

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));

const toSheet = (r: Row): Sheet => ({
  id: str(r.id),
  pageId: str(r.page_id),
  position: Number(r.position ?? 0),
  paper: isPaper(r.paper) ? r.paper : "lined",
  strokes: parseStrokes(str(r.strokes)),
});

/** A page's sheets, top to bottom. */
export async function listSheets(db: Db, pageId: string): Promise<Sheet[]> {
  const rows = await db.select<Row>(
    "SELECT * FROM ink_sheets WHERE page_id = $1 ORDER BY position, id",
    [pageId],
  );
  return rows.map(toSheet);
}

/** Every sheet that has ink, grouped by page (for exports). */
export async function sheetsByPage(db: Db): Promise<Map<string, Sheet[]>> {
  const rows = await db.select<Row>(
    "SELECT * FROM ink_sheets WHERE strokes != '[]' ORDER BY page_id, position, id",
  );
  const map = new Map<string, Sheet[]>();
  for (const r of rows) {
    const s = toSheet(r);
    if (!s.strokes.length) continue;
    const list = map.get(s.pageId) ?? [];
    list.push(s);
    map.set(s.pageId, list);
  }
  return map;
}

// One lookup per page at a time, so opening the Pad twice quickly can't create two first sheets.
const opening = new Map<string, Promise<Sheet[]>>();

/** A page's sheets, creating the first (empty) one if it has none yet. */
export function openSheets(db: Db, pageId: string, paper: Paper): Promise<Sheet[]> {
  let p = opening.get(pageId);
  if (!p) {
    p = (async () => {
      const list = await listSheets(db, pageId);
      return list.length ? list : [await addSheet(db, pageId, paper)];
    })().finally(() => opening.delete(pageId));
    opening.set(pageId, p);
  }
  return p;
}

/** Adds an empty sheet after the page's last one. */
export async function addSheet(db: Db, pageId: string, paper: Paper): Promise<Sheet> {
  const [last] = await db.select<Row>(
    "SELECT MAX(position) AS p FROM ink_sheets WHERE page_id = $1",
    [pageId],
  );
  const position = last?.p == null ? 0 : Number(last.p) + 1;
  const id = uid();
  await db.execute(
    "INSERT INTO ink_sheets (id, page_id, position, paper, strokes, updated_at) VALUES ($1, $2, $3, $4, '[]', $5)",
    [id, pageId, position, paper, now()],
  );
  return { id, pageId, position, paper, strokes: [] };
}

export async function saveStrokes(db: Db, sheetId: string, strokes: Stroke[]) {
  await db.execute("UPDATE ink_sheets SET strokes = $1, updated_at = $2 WHERE id = $3", [
    JSON.stringify(strokes),
    now(),
    sheetId,
  ]);
}

/** Paper style applies to all of a page's sheets. */
export async function setPaper(db: Db, pageId: string, paper: Paper) {
  await db.execute("UPDATE ink_sheets SET paper = $1, updated_at = $2 WHERE page_id = $3", [
    paper,
    now(),
    pageId,
  ]);
}

export async function deleteSheet(db: Db, sheetId: string) {
  await db.execute("DELETE FROM ink_sheets WHERE id = $1", [sheetId]);
}
