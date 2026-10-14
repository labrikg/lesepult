import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, PartyPopper, X } from "lucide-react";
import { getDb } from "../lib/db";
import * as study from "../lib/studyRepo";
import type { Card } from "../lib/studyRepo";
import { useStore } from "../store";
import { MathText } from "../editor/MathText";
import { preview } from "./srs";

/** Cards due within this window come back in the same session (like Anki's learn-ahead). */
const LEARN_AHEAD_MS = 20 * 60_000;

/**
 * A review session over the due cards of one course (or all): question, reveal, rate.
 * Space shows the answer, 1–4 rate it (Space after revealing = Good), Esc ends the session.
 */
export function ReviewSession({ courseId }: { courseId: string | null }) {
  const tree = useStore((s) => s.tree);
  const endReview = useStore((s) => s.endReview);
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [startTotal, setStartTotal] = useState(0);

  useEffect(() => {
    getDb()
      .then((db) =>
        study.dueCards(db, new Date().toISOString(), courseId ?? undefined),
      )
      .then((cards) => {
        setQueue(cards);
        setStartTotal(cards.length);
      })
      .catch((e) => useStore.setState({ error: String(e) }));
  }, [courseId]);

  const card = queue?.[0] ?? null;
  const options = useMemo(
    () => (card ? preview(card.srs, card.state) : []),
    [card],
  );
  const courseName = courseId
    ? (tree.flatMap((s) => s.courses).find((c) => c.id === courseId)?.name ??
      "Course")
    : "All courses";

  const answer = useCallback(
    async (index: number) => {
      if (!card || !revealed) return;
      // Exactly what the button showed (intervals have a little random fuzz).
      const option = options[index];
      if (!option) return;
      await study.recordReview(await getDb(), card.id, option.result);
      setReviewed((n) => n + 1);
      setSeen((s) => new Set(s).add(card.id));
      setRevealed(false);
      setQueue((q) => {
        if (!q) return q;
        const rest = q.slice(1);
        const due = new Date(option.result.due).getTime();
        // Missed or still-learning cards come back later in this session.
        if (due - Date.now() <= LEARN_AHEAD_MS) {
          rest.push({
            ...card,
            srs: option.result.srs,
            state: option.result.state,
            due: option.result.due,
          });
        }
        return rest;
      });
    },
    [card, revealed, options],
  );

  const openNote = useCallback(() => {
    if (!card) return;
    endReview();
    useStore.getState().focusNoteBlock(card.pageId, card.blockId);
  }, [card, endReview]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        e.preventDefault();
        endReview();
      } else if (!revealed && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        if (card) setRevealed(true);
      } else if (revealed && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        answer(2);
      } else if (revealed && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        answer(Number(e.key) - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer, card, revealed, endReview]);

  return (
    <div
      className="review"
      role="dialog"
      aria-modal="true"
      aria-label={`Review: ${courseName}`}
    >
      <header className="review-bar">
        <span className="review-course">{courseName}</span>
        {queue && startTotal > 0 && (
          <span className="review-progress" aria-live="polite">
            {reviewed} reviewed · {queue.length} left
          </span>
        )}
        <span className="toolbar-spacer" />
        <button
          type="button"
          className="row-action"
          aria-label="End review"
          title="End review (Esc)"
          onClick={endReview}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      {queue && startTotal > 0 && (
        <div className="review-meter" aria-hidden="true">
          <div
            style={{
              width: `${Math.min(100, (reviewed / Math.max(1, reviewed + queue.length)) * 100)}%`,
            }}
          />
        </div>
      )}

      <main className="review-stage">
        {queue === null ? null : card ? (
          <div className="review-column">
            <article className="review-card" key={`${card.id}-${reviewed}`}>
              <div className="review-source">
                <span
                  className="course-dot"
                  style={{ background: card.courseColor }}
                  aria-hidden="true"
                />
                {card.courseName} · {card.pageTitle || "Untitled"}
                {card.state === 0 && <span className="state-chip">new</span>}
              </div>
              <div className="review-front">
                {card.front ? (
                  <MathText text={card.front} />
                ) : (
                  <em>(no question)</em>
                )}
              </div>
              {revealed ? (
                <>
                  <div className="review-divider" aria-hidden="true" />
                  <div className="review-back">
                    {card.back ? (
                      <MathText text={card.back} />
                    ) : (
                      <em>(no answer)</em>
                    )}
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn--primary review-reveal"
                  onClick={() => setRevealed(true)}
                >
                  Show answer <kbd>Space</kbd>
                </button>
              )}
            </article>
            {revealed ? (
              <div
                className="grade-row"
                role="group"
                aria-label="How well did you know it?"
              >
                {options.map((o, i) => (
                  <button
                    key={o.label}
                    type="button"
                    className={`grade grade--${o.label.toLowerCase()}`}
                    onClick={() => answer(i)}
                  >
                    <span className="grade-label">{o.label}</span>
                    <span className="grade-interval">{o.interval}</span>
                    <kbd>{o.key}</kbd>
                  </button>
                ))}
              </div>
            ) : (
              <span className="review-hint">
                Think of the answer first, then reveal it.
              </span>
            )}
          </div>
        ) : (
          <div className="review-done">
            <PartyPopper size={36} strokeWidth={1.5} aria-hidden="true" />
            <h2>
              {startTotal === 0 ? "Nothing due right now" : "All done for now"}
            </h2>
            <p>
              {startTotal === 0
                ? "There are no cards to review in this course at the moment. New cards show up as soon as you add them to a note."
                : `You went through ${seen.size} ${seen.size === 1 ? "card" : "cards"}${reviewed > seen.size ? ` (${reviewed} answers)` : ""}. They come back when they're due.`}
            </p>
            <button
              type="button"
              className="btn btn--primary"
              onClick={endReview}
              autoFocus
            >
              Close
            </button>
          </div>
        )}
      </main>

      {card && (
        <footer className="review-foot">
          <button
            type="button"
            className="pdf-block-jump review-open"
            onClick={openNote}
          >
            Open note
            <ArrowUpRight size={13} aria-hidden="true" />
          </button>
        </footer>
      )}
    </div>
  );
}
