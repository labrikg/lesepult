import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, PartyPopper, RotateCcw, Check, X } from "lucide-react";
import { getDb } from "../lib/db";
import * as study from "../lib/studyRepo";
import type { Card } from "../lib/studyRepo";
import { useStore } from "../store";
import { MathText } from "../editor/MathText";
import { preview, recallAt } from "./srs";

/** Cards due within this window come back in the same session (like Anki's learn-ahead). */
const LEARN_AHEAD_MS = 20 * 60_000;
/** In cram mode, a missed card comes back after this many others. */
const CRAM_AGAIN_GAP = 3;

/**
 * A review session over the due cards of one course (or all): question, reveal, rate.
 * Space shows the answer, 1–4 rate it (Space after revealing = Good), Esc ends the session.
 *
 * Cram mode goes through every card of the course, weakest first, before an exam: "Again" (1)
 * brings a card back a little later, "Knew it" (2 or Space) puts it away. Cram answers count as
 * study activity but don't change when cards are due.
 */
export function ReviewSession({
  courseId,
  cram = false,
}: {
  courseId: string | null;
  cram?: boolean;
}) {
  const tree = useStore((s) => s.tree);
  const endReview = useStore((s) => s.endReview);
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [startTotal, setStartTotal] = useState(0);

  useEffect(() => {
    getDb()
      .then(async (db) => {
        if (!cram)
          return study.dueCards(
            db,
            new Date().toISOString(),
            courseId ?? undefined,
          );
        const now = new Date();
        const all = await study.listCards(db, courseId ?? undefined);
        const recall = new Map(
          all.map((c) => [c.id, recallAt(c.srs, c.state, now)]),
        );
        return all.sort((a, b) => recall.get(a.id)! - recall.get(b.id)!);
      })
      .then((cards) => {
        setQueue(cards);
        setStartTotal(cards.length);
      })
      .catch((e) => useStore.setState({ error: String(e) }));
  }, [courseId, cram]);

  const card = queue?.[0] ?? null;
  const options = useMemo(
    () => (card ? preview(card.srs, card.state) : []),
    [card],
  );
  const cramAnswer = useCallback(
    async (knew: boolean) => {
      if (!card || !revealed) return;
      await study.recordCramAnswer(await getDb(), card.id, knew, card.state);
      setReviewed((n) => n + 1);
      setRevealed(false);
      if (knew) setSeen((s) => new Set(s).add(card.id));
      setQueue((q) => {
        if (!q) return q;
        const rest = q.slice(1);
        if (!knew) rest.splice(Math.min(CRAM_AGAIN_GAP, rest.length), 0, card);
        return rest;
      });
    },
    [card, revealed],
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
      } else if (
        cram &&
        revealed &&
        (e.key === " " || e.key === "Enter" || e.key === "2")
      ) {
        e.preventDefault();
        cramAnswer(true);
      } else if (cram && revealed && e.key === "1") {
        e.preventDefault();
        cramAnswer(false);
      } else if (cram) {
        return;
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
  }, [answer, cramAnswer, cram, card, revealed, endReview]);

  return (
    <div
      className="review"
      role="dialog"
      aria-modal="true"
      aria-label={`${cram ? "Cram" : "Review"}: ${courseName}`}
    >
      <header className="review-bar">
        <span className="review-course">
          {cram && <span className="cram-chip">Cram</span>}
          {courseName}
        </span>
        {queue && startTotal > 0 && (
          <span className="review-progress" aria-live="polite">
            {cram
              ? `${seen.size} of ${startTotal} known`
              : `${reviewed} reviewed`}{" "}
            · {queue.length} left
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
              width: `${Math.min(100, cram ? (seen.size / Math.max(1, startTotal)) * 100 : (reviewed / Math.max(1, reviewed + queue.length)) * 100)}%`,
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
            {revealed && cram ? (
              <div
                className="grade-row grade-row--cram"
                role="group"
                aria-label="Did you know it?"
              >
                <button
                  type="button"
                  className="grade grade--again"
                  onClick={() => cramAnswer(false)}
                >
                  <span className="grade-label">
                    <RotateCcw size={14} aria-hidden="true" /> Again
                  </span>
                  <span className="grade-interval">comes back soon</span>
                  <kbd>1</kbd>
                </button>
                <button
                  type="button"
                  className="grade grade--good"
                  onClick={() => cramAnswer(true)}
                >
                  <span className="grade-label">
                    <Check size={14} aria-hidden="true" /> Knew it
                  </span>
                  <span className="grade-interval">done for this session</span>
                  <kbd>2</kbd>
                </button>
              </div>
            ) : revealed ? (
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
              {startTotal === 0
                ? cram
                  ? "No cards in this course"
                  : "Nothing due right now"
                : cram
                  ? "You knew every card"
                  : "All done for now"}
            </h2>
            <p>
              {startTotal === 0
                ? cram
                  ? "Add flashcards to this course's notes to cram them."
                  : "There are no cards to review in this course at the moment. New cards show up as soon as you add them to a note."
                : cram
                  ? `${startTotal} ${startTotal === 1 ? "card" : "cards"}, ${reviewed} answers. Cramming doesn't change when cards are due, so your regular reviews stay as they were.`
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
          {cram && (
            <span className="review-foot-note">
              Cramming doesn't change when cards are due.
            </span>
          )}
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
