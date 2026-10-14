import { useEffect, useRef, useState } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { Layers } from "lucide-react";
import { MathText } from "./MathText";

/**
 * A flashcard inside a note: a question (front) and an answer (back). Both sides show formulas
 * ($…$) typeset; clicking a side edits it. Saved cards are reviewed with spaced repetition.
 */

type Side = "front" | "back";

/*
 * A card that was just added (slash menu, "Flashcard" on a highlight) opens its question for
 * typing. Requests may arrive before or after the block renders, so they're kept in a set and
 * also announced with an event.
 */
const editRequests = new Set<string>();
const EDIT_EVENT = "lesepult:edit-card";

export function requestCardEdit(blockId: string) {
  editRequests.add(blockId);
  window.dispatchEvent(new CustomEvent(EDIT_EVENT, { detail: blockId }));
}

interface CardProps {
  front: string;
  back: string;
  highlightId: string;
}

function CardView({
  blockId,
  props,
  onSave,
}: {
  blockId: string;
  props: CardProps;
  onSave(side: Side, text: string): void;
}) {
  const [editing, setEditing] = useState<Side | null>(() => (editRequests.delete(blockId) ? "front" : null));
  useEffect(() => {
    const onRequest = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== blockId) return;
      editRequests.delete(blockId);
      setEditing("front");
    };
    window.addEventListener(EDIT_EVENT, onRequest);
    return () => window.removeEventListener(EDIT_EVENT, onRequest);
  }, [blockId]);

  return (
    <div className="flashcard" contentEditable={false}>
      <div className="flashcard-head">
        <Layers size={13} aria-hidden="true" />
        <span className="pdf-block-kind">Flashcard</span>
      </div>
      <CardSide
        side="front"
        label="Question"
        value={props.front}
        editing={editing === "front"}
        onEdit={() => setEditing("front")}
        onDone={(text, next) => {
          onSave("front", text);
          setEditing(next ? "back" : null);
        }}
      />
      <div className="flashcard-divider" aria-hidden="true" />
      <CardSide
        side="back"
        label="Answer"
        value={props.back}
        editing={editing === "back"}
        onEdit={() => setEditing("back")}
        onDone={(text, next) => {
          onSave("back", text);
          setEditing(next ? "front" : null);
        }}
      />
    </div>
  );
}

function CardSide({
  side,
  label,
  value,
  editing,
  onEdit,
  onDone,
}: {
  side: Side;
  label: string;
  value: string;
  editing: boolean;
  onEdit(): void;
  /** `next`: move on to the other side (Tab, or Enter on the question). */
  onDone(text: string, next: boolean): void;
}) {
  const [draft, setDraft] = useState(value);
  const field = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);

  useEffect(() => {
    if (!editing) return;
    setDraft(value);
    done.current = false;
    requestAnimationFrame(() => {
      const el = field.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    });
    // Only when editing starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const finish = (next: boolean) => {
    if (done.current) return;
    done.current = true;
    onDone(draft.trim(), next);
  };

  return (
    <div className={`flashcard-side flashcard-side--${side}`}>
      <span className="flashcard-label">{label}</span>
      {editing ? (
        <textarea
          ref={field}
          className="flashcard-input"
          aria-label={label}
          placeholder={side === "front" ? "What do you want to remember?" : "The answer"}
          rows={1}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onBlur={() => finish(false)}
          onKeyDown={(e) => {
            e.stopPropagation(); // keep the note editor's shortcuts out of this field
            if (e.key === "Tab") {
              e.preventDefault();
              finish(true);
            } else if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              finish(side === "front");
            } else if (e.key === "Escape") {
              e.preventDefault();
              finish(false);
            }
          }}
        />
      ) : (
        <button
          type="button"
          className={`flashcard-text${value ? "" : " is-empty"}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onEdit}
        >
          {value ? <MathText text={value} /> : side === "front" ? "Add a question…" : "Add the answer…"}
        </button>
      )}
    </div>
  );
}

export const createFlashcardBlock = createReactBlockSpec(
  {
    type: "flashcard",
    propSchema: {
      front: { default: "" },
      back: { default: "" },
      /** The highlight the card was made from, if any. */
      highlightId: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => (
      <CardView
        blockId={block.id}
        props={block.props}
        onSave={(side, text) => {
          if (text !== block.props[side]) editor.updateBlock(block, { props: { [side]: text } });
        }}
      />
    ),
    toExternalHTML: ({ block }) => (
      <div>
        <p>
          <strong>Q:</strong> {block.props.front}
        </p>
        <p>
          <strong>A:</strong> {block.props.back}
        </p>
      </div>
    ),
  },
);
