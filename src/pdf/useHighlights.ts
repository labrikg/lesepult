import { useCallback, useEffect, useMemo, useState } from "react";
import { getDb } from "../lib/db";
import * as repo from "../lib/repo";
import type { Highlight, HighlightColor } from "../lib/repo";
import type { PageSelection } from "./selection";
import { useStore } from "../store";

const report = (e: unknown) => useStore.setState({ error: e instanceof Error ? e.message : String(e) });

/** Loads a PDF's highlights and keeps them in sync with the database. */
export function useHighlights(documentId: string) {
  const [highlights, setHighlights] = useState<Highlight[]>([]);

  useEffect(() => {
    let cancelled = false;
    setHighlights([]);
    getDb()
      .then((db) => repo.listHighlights(db, documentId))
      .then((list) => !cancelled && setHighlights(list))
      .catch(report);
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const byPage = useMemo(() => {
    const m = new Map<number, Highlight[]>();
    for (const h of highlights) m.set(h.pageNumber, [...(m.get(h.pageNumber) ?? []), h]);
    return m;
  }, [highlights]);

  /** Creates one highlight per page the selection touches; returns them. */
  const create = useCallback(
    async (pages: PageSelection[], color: HighlightColor): Promise<Highlight[]> => {
      try {
        const db = await getDb();
        const made: Highlight[] = [];
        for (const p of pages) {
          made.push(
            await repo.createHighlight(db, {
              documentId,
              pageNumber: p.pageNumber,
              rects: p.rects,
              color,
              text: p.text,
            }),
          );
        }
        setHighlights((hs) => [...hs, ...made]);
        return made;
      } catch (e) {
        report(e);
        return [];
      }
    },
    [documentId],
  );

  const update = useCallback(
    async (id: string, patch: { color?: HighlightColor; comment?: string | null }) => {
      setHighlights((hs) =>
        hs.map((h) =>
          h.id !== id
            ? h
            : {
                ...h,
                ...(patch.color && { color: patch.color }),
                ...(patch.comment !== undefined && {
                  comment: patch.comment?.trim() ? patch.comment.trim() : null,
                }),
              },
        ),
      );
      try {
        await repo.updateHighlight(await getDb(), id, patch);
      } catch (e) {
        report(e);
      }
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    setHighlights((hs) => hs.filter((h) => h.id !== id));
    try {
      await repo.deleteHighlight(await getDb(), id);
    } catch (e) {
      report(e);
    }
  }, []);

  return { highlights, byPage, create, update, remove };
}
