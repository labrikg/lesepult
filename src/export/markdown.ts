/**
 * Converts note blocks (BlockNote JSON as stored in pages.content) to Markdown.
 * Pure and dependency-free so it can be unit-tested and reused for single and bulk exports.
 */

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

export interface ExportAsset {
  /** Path inside Lesepult's data folder (documents/….png). */
  storedPath: string;
  /** Path the Markdown links to, relative to the .md file. */
  linkPath: string;
}

export interface MarkdownResult {
  markdown: string;
  assets: ExportAsset[];
}

export interface MarkdownOptions {
  /** Folder (relative to the .md file) that snip images are copied into. */
  assetDir?: string;
  /** Added to every heading level; 1 when the page title is the document's # heading. */
  headingOffset?: number;
}

/* ---------- Inline content ---------- */

const ESCAPE = /([\\`*_[\]<>|~])/g;
const escapeText = (s: string) => s.replace(ESCAPE, "\\$1");

/** Wraps text in a marker, keeping surrounding spaces outside (`** bold**` doesn't render). */
function wrap(text: string, open: string, close = open): string {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
  if (!m || !m[2]) return text;
  return `${m[1]}${open}${m[2]}${close}${m[3]}`;
}

function codeSpan(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((r) => r.length));
  const fence = "`".repeat(longest + 1);
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${fence}${pad}${text}${pad}${fence}`;
}

function styledText(item: Json): string {
  const text = typeof item.text === "string" ? item.text : "";
  if (!text) return "";
  const styles = isObj(item.styles) ? item.styles : {};
  return wrapStyles(styles.code ? codeSpan(text) : escapeText(text), styles);
}

function wrapStyles(out: string, styles: Json): string {
  if (styles.strike) out = wrap(out, "~~");
  if (styles.italic) out = wrap(out, "*");
  if (styles.bold) out = wrap(out, "**");
  if (styles.underline) out = wrap(out, "<u>", "</u>");
  return out;
}

export function inlineToMarkdown(content: unknown): string {
  if (typeof content === "string") return escapeText(content);
  if (!Array.isArray(content)) return "";
  return content
    .map((c) => {
      if (!isObj(c)) return "";
      if (c.type === "link") {
        const label = inlineToMarkdown(c.content) || escapeText(String(c.href ?? ""));
        return `[${label}](<${String(c.href ?? "").replace(/[<>]/g, encodeURIComponent)}>)`;
      }
      if (c.type === "text") return styledText(c);
      return typeof c.text === "string" ? escapeText(c.text) : "";
    })
    .join("")
    .replace(/\n/g, "  \n"); // soft line breaks inside a block
}

/** Raw text of plain content (code, LaTeX). */
function plainText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((c) => (isObj(c) && typeof c.text === "string" ? c.text : "")).join("");
}

/* ---------- Blocks ---------- */

const indentLines = (text: string, prefix: string, firstPrefix = prefix) =>
  text
    .split("\n")
    .map((line, i) => (line ? (i === 0 ? firstPrefix : prefix) + line : line.trimEnd()))
    .join("\n");

const quoteLines = (text: string) =>
  text
    .split("\n")
    .map((l) => (l ? `> ${l}` : ">"))
    .join("\n");

function fenced(code: string, lang: string): string {
  const longest = Math.max(2, ...(code.match(/`{3,}/g) ?? []).map((r) => r.length));
  const fence = "`".repeat(longest + 1);
  return `${fence}${lang}\n${code}\n${fence}`;
}

function tableToMarkdown(content: unknown): string {
  if (!isObj(content) || !Array.isArray(content.rows)) return "";
  const rows = content.rows.map((row) =>
    isObj(row) && Array.isArray(row.cells)
      ? row.cells.map((cell) =>
          // "|" is already escaped by inlineToMarkdown; line breaks become <br> inside cells.
          inlineToMarkdown(Array.isArray(cell) ? cell : isObj(cell) ? cell.content : "").replace(
            / {2}\n/g,
            "<br>",
          ),
        )
      : [],
  );
  if (!rows.length) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => [...r, ...Array(width - r.length).fill("")];
  const line = (r: string[]) => `| ${pad(r).join(" | ")} |`;
  return [line(rows[0]), `| ${Array(width).fill("---").join(" | ")} |`, ...rows.slice(1).map(line)].join(
    "\n",
  );
}

interface Ctx {
  assets: ExportAsset[];
  assetDir: string;
  headingOffset: number;
}

const fileNameOf = (path: string) => path.split("/").pop() ?? path;

/** One block (without its children) → Markdown. */
function blockBody(b: Json, ctx: Ctx, listIndex: number): { text: string; listMarker?: string } {
  const props = isObj(b.props) ? b.props : {};
  switch (b.type) {
    case "heading": {
      const level = Math.min(6, Number(props.level ?? 1) + ctx.headingOffset);
      return { text: `${"#".repeat(level)} ${inlineToMarkdown(b.content)}` };
    }
    case "bulletListItem":
    case "toggleListItem":
      return { text: inlineToMarkdown(b.content), listMarker: "- " };
    case "numberedListItem":
      return { text: inlineToMarkdown(b.content), listMarker: `${listIndex}. ` };
    case "checkListItem":
      return { text: inlineToMarkdown(b.content), listMarker: props.checked ? "- [x] " : "- [ ] " };
    case "quote":
      return { text: quoteLines(inlineToMarkdown(b.content)) };
    case "codeBlock": {
      const lang = typeof props.language === "string" && props.language !== "text" ? props.language : "";
      return { text: fenced(plainText(b.content), lang) };
    }
    case "latex":
      return { text: `$$\n${plainText(b.content).trim()}\n$$` };
    case "divider":
      return { text: "---" };
    case "table":
      return { text: tableToMarkdown(b.content) };
    case "pdfQuote": {
      const source = [
        props.source ? `*${escapeText(String(props.source))}*` : "",
        `p. ${props.pageNumber ?? "?"}`,
      ]
        .filter(Boolean)
        .join(", ");
      const parts = [escapeText(String(props.text ?? "")), "", `— ${source}`];
      if (props.comment) parts.push("", `**Note:** ${escapeText(String(props.comment))}`);
      return { text: quoteLines(parts.join("\n")) };
    }
    case "pdfSnip": {
      const label = `Snip from ${props.source ? `${props.source}, ` : ""}page ${props.pageNumber ?? "?"}`;
      const stored = typeof props.imagePath === "string" ? props.imagePath : "";
      if (!stored) return { text: `*[${escapeText(label)}]*` };
      const linkPath = `${ctx.assetDir}/${fileNameOf(stored)}`;
      if (!ctx.assets.some((a) => a.storedPath === stored)) ctx.assets.push({ storedPath: stored, linkPath });
      return { text: `![${escapeText(label)}](<${linkPath}>)` };
    }
    case "paragraph":
    default:
      return { text: inlineToMarkdown(b.content) };
  }
}

function blocksToLines(blocks: unknown[], ctx: Ctx): string[] {
  const out: string[] = [];
  let numbered = 0;
  let prevWasList = false;
  for (const raw of blocks) {
    if (!isObj(raw)) continue;
    numbered = raw.type === "numberedListItem" ? numbered + 1 : 0;
    const { text, listMarker } = blockBody(raw, ctx, numbered);
    const children = Array.isArray(raw.children) ? raw.children : [];
    const childText = children.length ? blocksToLines(children, ctx).join("\n") : "";

    if (listMarker) {
      const indent = " ".repeat(listMarker.length);
      let item = indentLines(text || "", indent, listMarker) || listMarker.trimEnd();
      if (childText) item += `\n${indentLines(childText, indent)}`;
      // Consecutive list items stay together; anything else gets a blank line around it.
      if (out.length && !prevWasList) out.push("");
      out.push(item);
      prevWasList = true;
    } else {
      if (out.length) out.push("");
      if (text.trim()) out.push(text);
      else if (out.length) out.pop(); // drop empty paragraphs
      if (childText) {
        out.push("");
        out.push(childText);
      }
      prevWasList = false;
    }
  }
  return out;
}

export function blocksToMarkdown(blocks: unknown, options: MarkdownOptions = {}): MarkdownResult {
  const ctx: Ctx = {
    assets: [],
    assetDir: options.assetDir ?? "assets",
    headingOffset: options.headingOffset ?? 0,
  };
  const lines = Array.isArray(blocks) ? blocksToLines(blocks, ctx) : [];
  const markdown = lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { markdown: markdown ? `${markdown}\n` : "", assets: ctx.assets };
}

export interface PageForExport {
  title: string;
  content: string;
  plainText: string;
  courseName?: string;
  semesterName?: string;
  /** Link to the page's PDF, relative to the .md file, if it is exported alongside. */
  pdfLink?: { title: string; path?: string };
  tags?: string[];
}

/**
 * A tag as a hashtag that Obsidian and similar apps recognise: no spaces or punctuation
 * ("AVL trees" → "#AVL-trees"). Returns "" if nothing usable is left.
 */
export function toHashtag(name: string): string {
  const body = name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_\-/]/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/^[-/]+|[-/]+$/g, "");
  return body ? `#${body}` : "";
}

/** A whole page: title, where it belongs, its PDF, then the note. */
export function pageToMarkdown(page: PageForExport, options: MarkdownOptions = {}): MarkdownResult {
  let blocks: unknown = [];
  try {
    blocks = JSON.parse(page.content);
  } catch {
    blocks = [];
  }
  // Notes from before the block editor only have plain text.
  if ((!Array.isArray(blocks) || blocks.length === 0) && page.plainText.trim()) {
    blocks = page.plainText.split(/\r?\n/).map((line) => ({ type: "paragraph", content: line }));
  }
  const body = blocksToMarkdown(blocks, { headingOffset: 1, ...options });
  const header = [`# ${escapeText(page.title || "Untitled")}`];
  const meta = [page.semesterName, page.courseName].filter(Boolean).map((s) => escapeText(String(s)));
  if (meta.length) header.push("", `*${meta.join(" · ")}*`);
  const hashtags = (page.tags ?? []).map(toHashtag).filter(Boolean);
  if (hashtags.length) header.push("", `Tags: ${hashtags.join(" ")}`);
  if (page.pdfLink)
    header.push(
      "",
      page.pdfLink.path
        ? `PDF: [${escapeText(page.pdfLink.title)}](<${page.pdfLink.path}>)`
        : `PDF: ${escapeText(page.pdfLink.title)}`,
    );
  const markdown = `${header.join("\n")}\n${body.markdown ? `\n${body.markdown}` : ""}`;
  return { markdown, assets: body.assets };
}
