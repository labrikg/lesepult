import { useMemo } from "react";
import katex from "katex";
import { createReactBlockSpec, SourceBlockWithPreview } from "@blocknote/react";
import "katex/dist/katex.min.css";

/** Concatenates a plain-content block's text runs into one source string. */
export function sourceOf(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content.map((c) => (c && typeof c === "object" && "text" in c ? String(c.text) : "")).join("");
}

function renderLatex(source: string): { html?: string; error?: string } {
  try {
    return { html: katex.renderToString(source, { displayMode: true, throwOnError: true }) };
  } catch (e) {
    return { error: e instanceof Error ? e.message.replace(/^KaTeX parse error: /, "") : String(e) };
  }
}

/**
 * Display-math block: shows the rendered formula; clicking it opens the LaTeX source
 * in a popup (BlockNote's source-with-preview pattern). The source is the block's plain content,
 * so it is searchable and survives export.
 */
export const createLatexBlock = createReactBlockSpec(
  {
    type: "latex",
    propSchema: {},
    content: "plain",
  },
  {
    meta: {
      hasPreview: true,
      code: true,
      highlight: () => "latex",
    },
    render: function LatexBlockView({ block, editor, contentRef }) {
      const source = sourceOf(block.content);
      const { html, error } = useMemo(() => renderLatex(source), [source]);
      return (
        <SourceBlockWithPreview
          block={block}
          editor={editor}
          contentRef={contentRef}
          source={source}
          preview={
            html ? <div className="latex-preview" dangerouslySetInnerHTML={{ __html: html }} /> : undefined
          }
          error={error}
          emptySourcePlaceholder="Add a LaTeX formula"
          errorPreview="Formula has an error — click to fix"
          sourcePlaceholder="e.g. h(k, i) = (h'(k) + i) \bmod m"
        />
      );
    },
    toExternalHTML: ({ block }) => {
      const source = sourceOf(block.content);
      const { html } = renderLatex(source);
      return html ? <div dangerouslySetInnerHTML={{ __html: html }} /> : <pre>{source}</pre>;
    },
  },
);
