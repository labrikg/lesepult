import { describe, expect, it } from "vitest";
import {
  applySettings,
  choosePhase,
  DEFAULT_SETTINGS as S,
  finish,
  formatClock,
  formatMinutes,
  initialState,
  pause,
  remainingMs,
  reset,
  skip,
  start,
  type TimerState,
} from "./pomodoro";

const MIN = 60_000;
const T0 = 1_000_000;

describe("Pomodoro timer", () => {
  it("runs, pauses and resumes against the clock", () => {
    let t: TimerState = { ...initialState(), courseId: "c1" };
    t = start(t, T0);
    expect(remainingMs(t, T0 + 5 * MIN)).toBe(20 * MIN);
    t = pause(t, T0 + 5 * MIN);
    expect(remainingMs(t, T0 + 60 * MIN)).toBe(20 * MIN); // paused time doesn't count
    t = start(t, T0 + 10 * MIN);
    expect(t.startedAt).toBe(T0); // the focus round started at the first start
    expect(remainingMs(t, T0 + 30 * MIN)).toBe(0);
  });

  it("logs a finished focus round and goes on to a break", () => {
    const t = start({ ...initialState(), courseId: "c1" }, T0);
    const { state, log, finished } = finish(t, S, T0 + 25 * MIN);
    expect(finished).toBe("focus");
    expect(log).toEqual({ startedAt: T0, endedAt: T0 + 25 * MIN, minutes: 25, completed: true, courseId: "c1" });
    expect(state).toMatchObject({ phase: "short", round: 1, running: true, endsAt: T0 + 30 * MIN });
  });

  it("takes a long break after every fourth round, then starts over", () => {
    let t = initialState();
    const phases: string[] = [];
    for (let i = 0; i < 8; i++) {
      t = finish(start(t, T0), S, T0).state;
      phases.push(t.phase);
    }
    expect(phases).toEqual(["short", "focus", "short", "focus", "short", "focus", "long", "focus"]);
    expect(t.round).toBe(0);
    expect(t.running).toBe(false); // focus doesn't start by itself unless chosen
  });

  it("logs focus stopped early only after a minute", () => {
    const t = start({ ...initialState(), courseId: "c1" }, T0);
    expect(reset(t, S, T0 + 30_000).log).toBeUndefined();
    const r = reset(t, S, T0 + 10 * MIN);
    expect(r.log).toMatchObject({ minutes: 10, completed: false, courseId: "c1" });
    expect(r.state).toMatchObject({ phase: "focus", running: false, remaining: 25 * MIN });

    const s = skip(t, S, T0 + 3 * MIN);
    expect(s.log?.minutes).toBe(3);
    expect(s.state).toMatchObject({ phase: "short", round: 1, running: false });
    expect(skip(s.state, S, T0).state.phase).toBe("focus");

    expect(choosePhase(t, "long", S, T0 + 2 * MIN).log?.minutes).toBe(2);
  });

  it("gives an untouched phase its new length when settings change", () => {
    const t = initialState();
    const longer = { ...S, focus: 50 };
    expect(applySettings(t, S, longer).remaining).toBe(50 * MIN);
    const running = start(t, T0);
    expect(applySettings(running, S, longer)).toBe(running);
  });

  it("formats times", () => {
    expect(formatClock(25 * MIN)).toBe("25:00");
    expect(formatClock(5 * 1000 + 1)).toBe("00:06");
    expect(formatClock(65 * MIN)).toBe("1:05:00");
    expect(formatMinutes(25)).toBe("25 min");
    expect(formatMinutes(95)).toBe("1 h 35 min");
    expect(formatMinutes(120)).toBe("2 h");
  });
});
