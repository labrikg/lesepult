import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MathText } from "../editor/MathText";
import { createPortal } from "react-dom";
import { Layers, MessageSquarePlus, NotebookPen, Trash2 } from "lucide-react";
import type { Highlight, HighlightColor } from "../lib/repo";
import { HIGHLIGHT_COLORS } from "./highlights";

type Anchor = { left: number; top: number; right: number; bottom: number };

/** Places a floating box above the anchor (or below if there's no room), inside the window. */
function useFloatingPosition(anchor: Anchor, width: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: -9999, left: -9999 });
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 40;
    const above = anchor.top - h - 8;
    const top = above > 8 ? above : Math.min(window.innerHeight - h - 8, anchor.bottom + 8);
    const left = Math.min(Math.max(8, anchor.right - width / 2), window.innerWidth - width - 8);
    setPos({ top, left });
  }, [anchor, width]);
  return { ref, pos };
}

interface ToolbarProps {
  anchor: Anchor;
  onPick(color: HighlightColor): void;
  onComment(): void;
  onSendToNote(): void;
  onMakeCard(): void;
}

/** Appears next to a fresh text selection: pick a colour, or highlight and comment, quote or card it. */
export function SelectionToolbar({ anchor, onPick, onComment, onSendToNote, onMakeCard }: ToolbarProps) {
  const { ref, pos } = useFloatingPosition(anchor, 400);
  return createPortal(
    <div
      ref={ref}
      className="hl-toolbar"
      role="toolbar"
      aria-label="Highlight selection"
      style={pos}
      // Keep the text selection alive while clicking the toolbar.
      onMouseDown={(e) => e.preventDefault()}
    >
      {HIGHLIGHT_COLORS.map((c, i) => (
        <button
          key={c.id}
          type="button"
          className="hl-swatch"
          style={{ background: c.fill }}
          aria-label={`Highlight ${c.label.toLowerCase()} (${i + 1})`}
          title={`${c.label} · ${i + 1}`}
          onClick={() => onPick(c.id)}
        />
      ))}
      <span className="hl-sep" aria-hidden="true" />
      <button type="button" className="hl-action" onClick={onComment} title="Highlight and add a comment">
        <MessageSquarePlus size={16} aria-hidden="true" />
        <span>Comment</span>
      </button>
      <button
        type="button"
        className="hl-action"
        onClick={onSendToNote}
        title="Highlight and send to the note (N)"
      >
        <NotebookPen size={16} aria-hidden="true" />
        <span>To note</span>
      </button>
      <button
        type="button"
        className="hl-action"
        onClick={onMakeCard}
        title="Highlight and make a flashcard in the note, with this text as the answer (C)"
      >
        <Layers size={16} aria-hidden="true" />
        <span>Flashcard</span>
      </button>
    </div>,
    document.body,
  );
}

interface PopoverProps {
  highlight: Highlight;
  anchor: Anchor;
  focusComment: boolean;
  onColor(color: HighlightColor): void;
  onComment(comment: string): void;
  onDelete(): void;
  onClose(): void;
  /** Gets the comment as currently typed, so the quote includes it. */
  onSendToNote(comment: string): void;
  /** Whether the open page's note already quotes this highlight. */
  inNote: boolean;
  /** Adds a flashcard to the note with the highlighted text as the answer. */
  onMakeCard(): void;
}

/** Opens when clicking an existing highlight: recolour, comment, delete. */
export function HighlightPopover({
  highlight,
  anchor,
  focusComment,
  onColor,
  onComment,
  onDelete,
  onClose,
  onSendToNote,
  inNote,
  onMakeCard,
}: PopoverProps) {
  const { ref, pos } = useFloatingPosition(anchor, 300);
  const [comment, setComment] = useState(highlight.comment ?? "");
  const [armed, setArmed] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const saved = useRef(highlight.comment ?? "");

  const save = () => {
    if (comment.trim() !== saved.current.trim()) {
      saved.current = comment;
      onComment(comment);
    }
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    if (focusComment) textRef.current?.focus();
  }, [focusComment]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        saveRef.current();
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        saveRef.current();
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, ref]);

  return createPortal(
    <div ref={ref} className="hl-popover" role="dialog" aria-label="Highlight" style={pos}>
      <div className="hl-popover-head">
        <div className="hl-colors" role="radiogroup" aria-label="Colour">
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={highlight.color === c.id}
              className="hl-swatch hl-swatch--sm"
              style={{ background: c.fill }}
              aria-label={c.label}
              onClick={() => onColor(c.id)}
            />
          ))}
        </div>
        <button
          type="button"
          className={`hl-delete${armed ? " is-armed" : ""}`}
          onClick={() => (armed ? onDelete() : setArmed(true))}
          aria-label={armed ? "Click again to delete highlight" : "Delete highlight"}
        >
          <Trash2 size={14} aria-hidden="true" />
          {armed && <span>Delete?</span>}
        </button>
      </div>
      <blockquote className="hl-quote">
        <MathText text={highlight.text} />
      </blockquote>
      <label className="hl-comment">
        <span className="visually-hidden">Comment</span>
        <textarea
          ref={textRef}
          rows={3}
          placeholder="Add a comment…"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              save();
              onClose();
            }
          }}
        />
      </label>
      <div className="hl-popover-foot">
        <span className="hl-hint">p. {highlight.pageNumber}</span>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          title="A flashcard in the note, with this text as the answer"
          onClick={() => {
            saveRef.current();
            onMakeCard();
          }}
        >
          <Layers size={14} aria-hidden="true" />
          Flashcard
        </button>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={() => {
            saveRef.current();
            onSendToNote(comment);
          }}
        >
          <NotebookPen size={14} aria-hidden="true" />
          {inNote ? "Send again" : "Send to note"}
        </button>
      </div>
    </div>,
    document.body,
  );
}
