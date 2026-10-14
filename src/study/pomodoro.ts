/**
 * The Pomodoro timer as pure state transitions (no clocks, sounds or storage): focus rounds
 * alternate with short breaks, and every few rounds a long break. Time is kept as an end
 * timestamp while running, so it stays right even if the app is busy or asleep.
 */

export type Phase = "focus" | "short" | "long";

export interface TimerSettings {
  /** Minutes per phase. */
  focus: number;
  short: number;
  long: number;
  /** A long break after this many focus rounds. */
  longEvery: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  sound: boolean;
}

export const DEFAULT_SETTINGS: TimerSettings = {
  focus: 25,
  short: 5,
  long: 15,
  longEvery: 4,
  autoStartBreaks: true,
  autoStartFocus: false,
  sound: true,
};

export interface TimerState {
  phase: Phase;
  running: boolean;
  /** While running: when the phase ends (ms since epoch). */
  endsAt: number | null;
  /** While stopped: what's left (ms). */
  remaining: number;
  /** When the current focus phase was first started (for the log). */
  startedAt: number | null;
  /** Focus rounds finished in the current cycle. */
  round: number;
  /** The course this focus time counts for. */
  courseId: string | null;
  /** True when picked by hand; otherwise each focus round takes the course you're looking at. */
  courseFixed?: boolean;
}

/** A finished or abandoned stretch of focus to write down. */
export interface FocusLog {
  startedAt: number;
  endedAt: number;
  minutes: number;
  completed: boolean;
  courseId: string | null;
}

export interface Transition {
  state: TimerState;
  log?: FocusLog;
  /** The phase that just ran out (for the chime and notification). */
  finished?: Phase;
}

export const PHASE_LABEL: Record<Phase, string> = { focus: "Focus", short: "Short break", long: "Long break" };

export const durationMs = (phase: Phase, s: TimerSettings) => s[phase] * 60_000;

export function initialState(s: TimerSettings = DEFAULT_SETTINGS): TimerState {
  return { phase: "focus", running: false, endsAt: null, remaining: durationMs("focus", s), startedAt: null, round: 0, courseId: null };
}

export function remainingMs(t: TimerState, now: number): number {
  return t.running && t.endsAt !== null ? Math.max(0, t.endsAt - now) : t.remaining;
}

export function start(t: TimerState, now: number): TimerState {
  if (t.running) return t;
  return {
    ...t,
    running: true,
    endsAt: now + t.remaining,
    startedAt: t.phase === "focus" ? (t.startedAt ?? now) : null,
  };
}

export function pause(t: TimerState, now: number): TimerState {
  if (!t.running) return t;
  return { ...t, running: false, endsAt: null, remaining: remainingMs(t, now) };
}

/** Focus time spent so far in the current phase (ms). */
function focusSpent(t: TimerState, s: TimerSettings, now: number): number {
  return t.phase === "focus" ? durationMs("focus", s) - remainingMs(t, now) : 0;
}

/** A log entry for focus stopped early, if at least a minute was spent. */
function partialLog(t: TimerState, s: TimerSettings, now: number): FocusLog | undefined {
  const spent = focusSpent(t, s, now);
  if (spent < 60_000 || t.startedAt === null) return undefined;
  return { startedAt: t.startedAt, endedAt: now, minutes: spent / 60_000, completed: false, courseId: t.courseId };
}

function enter(t: TimerState, phase: Phase, s: TimerSettings, now: number, run: boolean, round = t.round): TimerState {
  const fresh: TimerState = {
    ...t,
    phase,
    round,
    running: false,
    endsAt: null,
    remaining: durationMs(phase, s),
    startedAt: null,
  };
  return run ? start(fresh, now) : fresh;
}

/** The phase ran out: log a focus round and move on to the right break (or back to focus). */
export function finish(t: TimerState, s: TimerSettings, now: number): Transition {
  if (t.phase === "focus") {
    const round = t.round + 1;
    const next: Phase = round % s.longEvery === 0 ? "long" : "short";
    const end = t.endsAt ?? now;
    return {
      state: enter(t, next, s, end, s.autoStartBreaks, round),
      finished: "focus",
      log: {
        startedAt: t.startedAt ?? end - durationMs("focus", s),
        endedAt: end,
        minutes: s.focus,
        completed: true,
        courseId: t.courseId,
      },
    };
  }
  const round = t.phase === "long" ? 0 : t.round;
  return { state: enter(t, "focus", s, t.endsAt ?? now, s.autoStartFocus, round), finished: t.phase };
}

/** Jumps to the next phase now; focus already spent is still logged. */
export function skip(t: TimerState, s: TimerSettings, now: number): Transition {
  if (t.phase === "focus") {
    const next: Phase = (t.round + 1) % s.longEvery === 0 ? "long" : "short";
    return { state: enter(t, next, s, now, false, t.round + 1), log: partialLog(t, s, now) };
  }
  return { state: enter(t, "focus", s, now, false, t.phase === "long" ? 0 : t.round) };
}

/** Back to the start of the current phase (stopped). */
export function reset(t: TimerState, s: TimerSettings, now: number): Transition {
  return { state: enter(t, t.phase, s, now, false), log: partialLog(t, s, now) };
}

/** Switches to a phase by hand (stopped). */
export function choosePhase(t: TimerState, phase: Phase, s: TimerSettings, now: number): Transition {
  if (phase === t.phase && !t.running && t.remaining === durationMs(phase, s)) return { state: t };
  return { state: enter(t, phase, s, now, false), log: partialLog(t, s, now) };
}

/** After the settings change, a stopped, untouched phase takes its new length. */
export function applySettings(t: TimerState, old: TimerSettings, s: TimerSettings): TimerState {
  if (!t.running && t.remaining === durationMs(t.phase, old)) return { ...t, remaining: durationMs(t.phase, s) };
  return t;
}

/** 1500000 → "25:00"; an hour or more → "1:05:00". */
export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm.padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** 95 → "1 h 35 min", 25 → "25 min", 0 → "0 min". */
export function formatMinutes(minutes: number): string {
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  return h ? `${h} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`;
}
