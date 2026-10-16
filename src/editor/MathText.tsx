import { Fragment, useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { BULLET_CHARS, fixAccents, splitMath } from "../pdf/mathText";

function renderParts(text: string) {
  return splitMath(text).map((p) => {
    if (!p.math) return { math: false as const, text: fixAccents(p.text) };
    try {
      return { math: true as const, html: katex.renderToString(p.text, { throwOnError: true }) };
    } catch {
      return { math: false as const, text: `$${p.text}$` };
    }
  });
}

function Inline({ text }: { text: string }) {
  const parts = useMemo(() => renderParts(text), [text]);
  return (
    <>
      {parts.map((p, i) =>
        p.math ? (
          <span key={i} className="inline-math" dangerouslySetInnerHTML={{ __html: p.html }} />
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </>
  );
}

const BULLET = new RegExp(`^[${BULLET_CHARS}]\\s`, "u");

/**
 * Text with inline `$…$` formulas, rendered with KaTeX (a broken formula shows as its source).
 * Text with line breaks (a list from a slide, or typed in "Edit text") keeps them: each line is
 * indented by its leading spaces, and a bulleted line wraps under its own words, not its bullet.
 * `inline` joins the lines instead (for one-line previews).
 */
export function MathText({ text, inline = false }: { text: string; inline?: boolean }) {
  const lines = useMemo(() => text.split("\n"), [text]);
  if (inline || lines.length === 1) return <Inline text={inline ? text.replace(/\s*\n\s*/g, " ") : text} />;
  return (
    <>
      {lines.map((line, i) => {
        const indent = /^[ \t]*/.exec(line)![0].replace(/\t/g, "   ").length;
        const rest = line.slice(/^[ \t]*/.exec(line)![0].length);
        if (!rest) return <span key={i} className="math-line math-line--empty" />;
        return (
          <span
            key={i}
            className={`math-line${BULLET.test(rest) ? " math-line--item" : ""}`}
            style={{ "--indent": indent } as React.CSSProperties}
          >
            <Inline text={rest} />
          </span>
        );
      })}
    </>
  );
}
