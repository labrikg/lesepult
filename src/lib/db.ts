import Database from "@tauri-apps/plugin-sql";

/** Minimal database interface the repository depends on (lets tests swap in another SQLite). */
export interface Db {
  select<T>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<void>;
}

/** Must match `DB_URL` in `src-tauri/src/lib.rs` — migrations are registered for this URL. */
const DB_URL = "sqlite:studyhub.db";

let instance: Promise<Db> | null = null;

export function getDb(): Promise<Db> {
  if (!instance) {
    instance = Database.load(DB_URL).then((conn) => ({
      select: <T>(sql: string, params: unknown[] = []) => conn.select<T[]>(sql, params),
      execute: async (sql: string, params: unknown[] = []) => {
        await conn.execute(sql, params);
      },
    }));
  }
  return instance;
}

export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
