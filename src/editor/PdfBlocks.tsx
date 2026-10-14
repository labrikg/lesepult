import { useEffect, useState } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { ArrowUpRight, Scissors } from "lucide-react";
import { useStore } from "../store";
import { storedFileUrl } from "../lib/files";

/**
 * Note blocks that point back into a PDF. Both keep a copy of what they show (the quoted text,
 * the snip image), so a note still reads fine if the highlight is deleted later; the ids are
 * what "Jump to page" and the "In note" chips use.
 */

function JumpButton({
  documentId,
  pageNumber,
  highlightId,
}: {
  documentId: string;
  pageNumber: number;
  highlightId?: string;
}) {
  return (
    <button
      type="button"
      className="pdf-block-jump"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => useStore.getState().jumpToPdf(documentId, pageNumber, highlightId || undefined)}
      disabled={!documentId}
    >
      Jump to page
      <ArrowUpRight size={13} aria-hidden="true" />
    </button>
  );
}

export const createPdfQuoteBlock = createReactBlockSpec(
  {
    type: "pdfQuote",
    propSchema: {
      highlightId: { default: "" },
      documentId: { default: "" },
      pageNumber: { default: 1 },
      color: { default: "yellow", values: ["yellow", "blue", "green"] as const },
      text: { default: "" },
      comment: { default: "" },
      source: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ block }) => {
      const p = block.props;
      return (
        <figure className="pdf-quote" data-color={p.color} contentEditable={false}>
          <div className="pdf-block-head">
            <span className="pdf-quote-swatch" aria-hidden="true" />
            <span className="pdf-block-kind">Highlight</span>
            <span className="pdf-block-source">
              {p.source ? `${p.source} · ` : ""}p. {p.pageNumber}
            </span>
            <span className="pdf-block-spacer" />
            <JumpButton documentId={p.documentId} pageNumber={p.pageNumber} highlightId={p.highlightId} />
          </div>
          <blockquote className="pdf-quote-text">{p.text}</blockquote>
          {p.comment && <figcaption className="pdf-quote-comment">{p.comment}</figcaption>}
        </figure>
      );
    },
    toExternalHTML: ({ block }) => (
      <blockquote>
        <p>{block.props.text}</p>
        <p>
          <em>
            {block.props.source} p. {block.props.pageNumber}
          </em>
        </p>
      </blockquote>
    ),
  },
);

function SnipImage({ imagePath, alt }: { imagePath: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (imagePath) storedFileUrl(imagePath).then((u) => alive && setSrc(u));
    return () => {
      alive = false;
    };
  }, [imagePath]);
  return src ? (
    <img className="pdf-snip-img" src={src} alt={alt} draggable={false} />
  ) : (
    <div className="pdf-snip-img is-loading" />
  );
}

export const createPdfSnipBlock = createReactBlockSpec(
  {
    type: "pdfSnip",
    propSchema: {
      snipId: { default: "" },
      documentId: { default: "" },
      pageNumber: { default: 1 },
      imagePath: { default: "" },
      source: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ block }) => {
      const p = block.props;
      const label = `${p.source ? `${p.source}, ` : ""}page ${p.pageNumber}`;
      return (
        <figure className="pdf-snip" contentEditable={false}>
          <div className="pdf-snip-frame">
            <SnipImage imagePath={p.imagePath} alt={`Snip from ${label}`} />
          </div>
          <figcaption className="pdf-block-head">
            <Scissors size={13} aria-hidden="true" />
            <span className="pdf-block-kind">Snip</span>
            <span className="pdf-block-source">
              {p.source ? `${p.source} · ` : ""}p. {p.pageNumber}
            </span>
            <span className="pdf-block-spacer" />
            <JumpButton documentId={p.documentId} pageNumber={p.pageNumber} />
          </figcaption>
        </figure>
      );
    },
    toExternalHTML: ({ block }) => (
      <p>
        <em>
          [Snip: {block.props.source} p. {block.props.pageNumber}]
        </em>
      </p>
    ),
  },
);
