// Copies PDF.js runtime assets (character maps, standard fonts, wasm decoders, colour profiles)
// into public/pdfjs so the viewer works fully offline. Runs before `dev` and `build`.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pdfjsRoot = dirname(require.resolve("pdfjs-dist/package.json"));
const target = join(import.meta.dirname, "..", "public", "pdfjs");

mkdirSync(target, { recursive: true });
for (const dir of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  const from = join(pdfjsRoot, dir);
  if (existsSync(from)) cpSync(from, join(target, dir), { recursive: true });
}
