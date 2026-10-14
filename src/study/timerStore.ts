import { create } from "zustand";
import { getDb } from "../lib/db";
import * as study from "../lib/studyRepo";
import { useStore } from "../store";
import * as P from "./pomodoro";
import type { Phase, TimerSettings, TimerState, Transition } from "./pomodoro";

/*
 * The live Pomodoro timer: pure transitions from pomodoro.ts plus the side effects (writing
 * focus time to the database, chime, notification). State is kept in web storage, so a
 * running timer carries on after a restart.
 */

const STATE_KEY = "lesepult.timer";
const SETTINGS_KEY = "lesepult.timerSettings";

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // only a convenience
  }
}

interface Timer {
  state: TimerState;
  settings: TimerSettings;
  start(): void;
  pause(): void;
  reset(): void;
  skip(): void;
  choosePhase(phase: Phase): void;
  setCourse(courseId: string | null): void;
  updateSettings(patch: Partial<TimerSettings>): void;
  /** Called every tick: finishes the phase when it has run out. */
  check(): void;
}

const initialSettings = load(SETTINGS_KEY, P.DEFAULT_SETTINGS);

export const useTimer = create<Timer>((set, get) => {
  /** Applies a transition: new state, then its log, chime and notification. */
  const apply = (t: Transition) => {
    set({ state: t.state });
    save(STATE_KEY, t.state);
    if (t.log) {
      const log = t.log;
      getDb()
        .then((db) =>
          study.logFocus(db, {
            courseId: log.courseId,
            startedAt: new Date(log.startedAt).toISOString(),
            endedAt: new Date(log.endedAt).toISOString(),
            minutes: log.minutes,
            completed: log.completed,
          }),
        )
        .then(() => useStore.getState().bumpStudy())
        .catch((e) => console.warn("focus log failed", e));
    }
    if (t.finished) announce(t.finished, t.state, get().settings);
  };

  return {
    state: load(STATE_KEY, P.initialState(initialSettings)),
    settings: initialSettings,
    start() {
      const { state } = get();
      // Focus time counts for the course you're looking at, unless one was picked by hand.
      const keep = state.courseFixed || state.startedAt !== null; // picked by hand, or resuming a round
      const courseId = keep ? state.courseId : currentCourseId();
      apply({ state: P.start({ ...state, courseId }, Date.now()) });
    },
    pause() {
      apply({ state: P.pause(get().state, Date.now()) });
    },
    reset() {
      apply(P.reset(get().state, get().settings, Date.now()));
    },
    skip() {
      apply(P.skip(get().state, get().settings, Date.now()));
    },
    choosePhase(phase) {
      apply(P.choosePhase(get().state, phase, get().settings, Date.now()));
    },
    setCourse(courseId) {
      apply({ state: { ...get().state, courseId, courseFixed: true } });
    },
    updateSettings(patch) {
      const old = get().settings;
      const settings = { ...old, ...patch };
      save(SETTINGS_KEY, settings);
      set({ settings });
      apply({ state: P.applySettings(get().state, old, settings) });
    },
    check() {
      const { state, settings } = get();
      if (state.running && P.remainingMs(state, Date.now()) <= 0) apply(P.finish(state, settings, Date.now()));
    },
  };
});

/** The course of the open page or course overview, if any. */
export function currentCourseId(): string | null {
  const { view, page } = useStore.getState();
  if (view.kind === "course") return view.courseId;
  if (view.kind === "page" && page) return page.courseId;
  return null;
}

/* ---------- Chime and notification ---------- */

let audio: AudioContext | null = null;

/** A soft two-note bell, made with Web Audio (no sound files). */
export function chime(rising: boolean) {
  try {
    audio ??= new AudioContext();
    const ctx = audio;
    const notes = rising ? [659.25, 987.77] : [987.77, 659.25];
    notes.forEach((freq, i) => {
      const t = ctx.currentTime + i * 0.22;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 1.5);
    });
  } catch {
    // no audio device: stay quiet
  }
}

async function announce(finished: Phase, next: TimerState, settings: TimerSettings) {
  if (settings.sound) chime(finished !== "focus");
  if (document.hasFocus()) return; // the timer is in view anyway
  const title = finished === "focus" ? "Focus round done" : "Break is over";
  const body =
    finished === "focus"
      ? `Time for a ${next.phase === "long" ? `${settings.long}-minute long` : `${settings.short}-minute`} break.`
      : `Ready for ${settings.focus} minutes of focus?`;
  try {
    const n = await import("@tauri-apps/plugin-notification");
    let granted = await n.isPermissionGranted();
    if (!granted) granted = (await n.requestPermission()) === "granted";
    if (granted) n.sendNotification({ title, body });
  } catch {
    // outside the app (tests, browser)
  }
}
