import { useEffect, useState } from "react";
import { getDb } from "../lib/db";
import type { Db } from "../lib/db";
import { useStore } from "../store";

/**
 * Loads study data and reloads it whenever cards, dates or to-dos change (studyVersion) or the
 * given dependencies change. Returns null until the first load.
 */
export function useStudy<T>(load: (db: Db) => Promise<T>, deps: unknown[]): T | null {
  const version = useStore((s) => s.studyVersion);
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let cancelled = false;
    getDb()
      .then(load)
      .then((d) => !cancelled && setData(d))
      .catch((e) => useStore.setState({ error: e instanceof Error ? e.message : String(e) }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps]);
  return data;
}

/** Runs a study change, then tells every study view to reload. */
export async function change(fn: (db: Db) => Promise<unknown>) {
  try {
    await fn(await getDb());
  } catch (e) {
    useStore.setState({ error: e instanceof Error ? e.message : String(e) });
  }
  useStore.getState().bumpStudy();
}
