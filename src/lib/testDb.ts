import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import BetterSqlite from "better-sqlite3";
import type { Db } from "./db";

/* Test helper: the app's schema in an in-memory SQLite database. */

const dir = fileURLToPath(new URL("../../src-tauri/migrations/", import.meta.url));
/** All migrations, in order, as the app runs them. */
const migrations = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(dir + f, "utf8"));

/** Adapter: runs the app's `$1`-style SQL on an in-memory better-sqlite3 database. */
export function memoryDb(): Db {
  const sqlite = new BetterSqlite(":memory:");
  sqlite.pragma("foreign_keys = ON");
  for (const m of migrations) sqlite.exec(m);
  const prepare = (sql: string, params: unknown[]) => {
    const ordered: unknown[] = [];
    const text = sql.replace(/\$(\d+)/g, (_, n) => {
      ordered.push(params[Number(n) - 1]);
      return "?";
    });
    return { stmt: sqlite.prepare(text), args: ordered };
  };
  return {
    async select<T>(sql: string, params: unknown[] = []) {
      const { stmt, args } = prepare(sql, params);
      return stmt.all(...args) as T[];
    },
    async execute(sql: string, params: unknown[] = []) {
      const { stmt, args } = prepare(sql, params);
      stmt.run(...args);
    },
  };
}

