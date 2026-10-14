/**
 * Pure helpers for note content: turning stored JSON into editor blocks and editor blocks
 * into plain text for the search index. No editor or DOM dependencies, so they are unit-tested.
 */

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null;

/** Text of inline content: styled text, links (which nest text), mentions etc. */
function inlineText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((c) => {
      if (!isObj(c)) return "";
      if (typeof c.text === "string") return c.text;
      if (Array.isArray(c.content)) return inlineText(c.content);
      return "";
    })
    .join("");
}

/** Text of one block's own content (paragraph text, code, LaTeX source, table cells, quoted highlights). */
function blockOwnText(block: Json): string {
  if (block.type === "pdfQuote" && isObj(block.props)) {
    const { text, comment } = block.props;
    return [text, comment].filter((t) => typeof t === "string" && t).join("\n");
  }
  const content = block.content;
  if (Array.isArray(content)) return inlineText(content);
  if (isObj(content) && content.type === "tableContent" && Array.isArray(content.rows)) {
    return content.rows
      .map((row) =>
        isObj(row) && Array.isArray(row.cells)
          ? row.cells
              .map((cell) =>
                Array.isArray(cell) ? inlineText(cell) : isObj(cell) ? inlineText(cell.content) : "",
              )
              .join(" ")
          : "",
      )
      .join("\n");
  }
  return "";
}

/** Flattens a block tree into plain text, one block per line, for search and previews. */
export function blocksToPlainText(blocks: unknown): string {
  if (!Array.isArray(blocks)) return "";
  const lines: string[] = [];
  const walk = (list: unknown[]) => {
    for (const b of list) {
      if (!isObj(b)) continue;
      const text = blockOwnText(b).trim();
      if (text) lines.push(text);
      if (Array.isArray(b.children)) walk(b.children);
    }
  };
  walk(blocks);
  return lines.join("\n");
}

/**
 * Initial blocks for a page. Uses the stored block JSON; pages written before the block editor
 * existed only have plain text, which becomes one paragraph per line.
 * Returns `undefined` for an empty page (the editor then starts with one empty paragraph).
 */
export function initialBlocks(content: string, plainText: string): Json[] | undefined {
  try {
    const parsed: unknown = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as Json[];
  } catch {
    // fall through to plain text
  }
  const lines = plainText.split(/\r?\n/);
  if (!plainText.trim()) return undefined;
  return lines.map((line) => ({ type: "paragraph", content: line }));
}

/** Links from note blocks to the highlights and snips they show (see repo.syncNoteRefs). */
export function extractNoteRefs(
  blocks: unknown,
): { blockId: string; highlightId?: string; snipId?: string }[] {
  const refs: { blockId: string; highlightId?: string; snipId?: string }[] = [];
  const walk = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const b of list) {
      if (!isObj(b)) continue;
      const props = isObj(b.props) ? b.props : {};
      if (typeof b.id === "string") {
        if (b.type === "pdfQuote" && typeof props.highlightId === "string" && props.highlightId)
          refs.push({ blockId: b.id, highlightId: props.highlightId });
        if (b.type === "pdfSnip" && typeof props.snipId === "string" && props.snipId)
          refs.push({ blockId: b.id, snipId: props.snipId });
      }
      walk(b.children);
    }
  };
  walk(blocks);
  return refs;
}
