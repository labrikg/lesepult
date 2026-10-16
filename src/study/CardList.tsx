import { ArrowUpRight } from "lucide-react";
import type { Card } from "../lib/studyRepo";
import { useStore } from "../store";
import { MathText } from "../editor/MathText";
import { formatInterval } from "./srs";

/** The cards of a course: question, where it lives, and when it's due. */
export function CardList({ cards }: { cards: Card[] }) {
  const now = Date.now();
  return (
    <ul className="card-list">
      {cards.map((c) => {
        const due = Date.parse(c.due);
        const chip = c.state === 0 ? "new" : due <= now ? "due" : `in ${formatInterval(due - now)}`;
        return (
          <li key={c.id} className="card-row">
            <span className="card-row-front">{c.front ? <MathText text={c.front} inline /> : <em>(no question yet)</em>}</span>
            <span className={`state-chip${chip === "due" ? " is-due" : ""}`}>{chip}</span>
            <button
              type="button"
              className="pdf-block-jump"
              title={`Open in “${c.pageTitle || "Untitled"}”`}
              onClick={() => useStore.getState().focusNoteBlock(c.pageId, c.blockId)}
            >
              {c.pageTitle || "Untitled"}
              <ArrowUpRight size={12} aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
