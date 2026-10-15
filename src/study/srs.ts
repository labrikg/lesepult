import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  type Card as FsrsCard,
  type Grade,
} from "ts-fsrs";
import type { CardState, ReviewResult } from "../lib/studyRepo";

/**
 * Spaced repetition with FSRS (the scheduler modern Anki uses): each answer updates a memory
 * model per card and picks the next review so you recall it with ~90% probability.
 */
const scheduler = fsrs(generatorParameters({ request_retention: 0.9, maximum_interval: 3650, enable_fuzz: true }));

export const GRADES = [
  { rating: Rating.Again, label: "Again", key: "1" },
  { rating: Rating.Hard, label: "Hard", key: "2" },
  { rating: Rating.Good, label: "Good", key: "3" },
  { rating: Rating.Easy, label: "Easy", key: "4" },
] as const;

function load(srs: string | null, now: Date): FsrsCard {
  if (!srs) return createEmptyCard(now);
  try {
    const raw = JSON.parse(srs);
    return {
      ...raw,
      due: new Date(raw.due),
      last_review: raw.last_review ? new Date(raw.last_review) : undefined,
    } as FsrsCard;
  } catch {
    return createEmptyCard(now);
  }
}

export interface Option {
  rating: Grade;
  label: string;
  key: string;
  /** "1 min", "10 min", "3 d", "2 mo" */
  interval: string;
  result: ReviewResult;
}

/** What each answer would do to the card right now. */
export function preview(srs: string | null, state: CardState, now = new Date()): Option[] {
  const card = load(srs, now);
  const outcomes = scheduler.repeat(card, now);
  return GRADES.map(({ rating, label, key }) => {
    const next = outcomes[rating].card;
    return {
      rating,
      label,
      key,
      interval: formatInterval(next.due.getTime() - now.getTime()),
      result: {
        srs: JSON.stringify(next),
        state: next.state as CardState,
        due: next.due.toISOString(),
        rating,
        previousState: state,
        scheduledDays: next.scheduled_days,
        reviewedAt: now.toISOString(),
      },
    };
  });
}

/** A short human interval: 45 s → "1 min", 3 h → "3 h", 12 d → "12 d", 70 d → "2 mo", 400 d → "1.1 y". */
export function formatInterval(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  if (d < 31) return `${d} d`;
  const mo = d / 30.4;
  if (mo < 12) return `${Math.round(mo)} mo`;
  const y = d / 365;
  return `${y < 10 ? y.toFixed(1).replace(/\.0$/, "") : Math.round(y)} y`;
}

/** How likely the card is remembered at a moment (0..1): FSRS's forgetting curve. New cards: 0. */
export function recallAt(srs: string | null, state: CardState, at: Date): number {
  if (!srs || state === 0) return 0;
  const card = load(srs, at);
  if (!card.stability) return 0;
  const r = scheduler.get_retrievability(card, at, false);
  return Number.isFinite(r) ? Math.min(1, Math.max(0, r)) : 0;
}
