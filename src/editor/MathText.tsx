import { Fragment, useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { fixAccents, splitMath } from "../pdf/mathText";

/** Text with inline `$…$` formulas, rendered with KaTeX (a broken formula shows as its source). */
export function MathText({ text }: { text: string }) {
  const parts = useMemo(
    () =>
      splitMath(text).map((p) => {
        if (!p.math) return { math: false as const, text: fixAccents(p.text) };
        try {
          return { math: true as const, html: katex.renderToString(p.text, { throwOnError: true }) };
        } catch {
          return { math: false as const, text: `$${p.text}$` };
        }
      }),
    [text],
  );
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
