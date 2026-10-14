import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ChevronDown, ChevronRight, Coffee, Pause, Play, RotateCcw, SkipForward, Timer as TimerIcon } from "lucide-react";
import * as study from "../lib/studyRepo";
import { useStore } from "../store";
import { Popover } from "../components/Popover";
import { durationMs, formatClock, formatMinutes, PHASE_LABEL, remainingMs, type Phase } from "./pomodoro";
import { useTimer } from "./timerStore";
import { useStudy } from "./useStudy";

/** Re-renders every half second while the timer runs. */
function useTick(active: boolean) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setN((n) => n + 1), 500);
    return () => window.clearInterval(t);
  }, [active]);
}

/** Keeps time: finishes phases when they run out and shows the countdown in the window title. */
export function TimerHost() {
  const running = useTimer((s) => s.state.running);
  const lastTitle = useRef("");
  useEffect(() => {
    const update = () => {
      useTimer.getState().check();
      const { state } = useTimer.getState();
      const title = state.running
        ? `${formatClock(remainingMs(state, Date.now()))} · ${PHASE_LABEL[state.phase]} — Lesepult`
        : "Lesepult";
      if (title !== lastTitle.current) {
        lastTitle.current = title;
        document.title = title;
        getCurrentWindow()
          .setTitle(title)
          .catch(() => {});
      }
    };
    update();
    if (!running) return;
    const t = window.setInterval(update, 500);
    return () => window.clearInterval(t);
  }, [running]);
  return null;
}

/** The timer in the top bar; opens the controls. */
export function TimerPill() {
  const state = useTimer((s) => s.state);
  const settings = useTimer((s) => s.settings);
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useTick(state.running);

  const left = remainingMs(state, Date.now());
  const total = durationMs(state.phase, settings);
  const progress = total ? 1 - left / total : 0;
  const isBreak = state.phase !== "focus";
  const touched = state.running || left !== total;

  return (
    <>
      <button
        ref={anchor}
        type="button"
        className={`timer-pill${state.running ? " is-running" : ""}${isBreak ? " is-break" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${PHASE_LABEL[state.phase]} timer, ${formatClock(left)} left${state.running ? "" : ", paused"}`}
        title="Pomodoro timer"
        onClick={() => setOpen((o) => !o)}
      >
        <Ring progress={touched ? progress : 0} size={18}>
          {isBreak ? <Coffee size={10} strokeWidth={2.4} aria-hidden="true" /> : <TimerIcon size={10} strokeWidth={2.4} aria-hidden="true" />}
        </Ring>
        <span className="timer-pill-clock">{touched ? formatClock(left) : "Focus"}</span>
      </button>
      {open && <TimerPanel anchor={anchor} onClose={close} />}
    </>
  );
}

function Ring({ progress, size, children }: { progress: number; size: number; children?: React.ReactNode }) {
  const r = size / 2 - 1.5;
  const c = 2 * Math.PI * r;
  return (
    <span className="timer-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="timer-ring-track" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="timer-ring-fill"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, Math.max(0, progress)))}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {children}
    </span>
  );
}

const PHASES: Phase[] = ["focus", "short", "long"];

function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function TimerPanel({ anchor, onClose }: { anchor: React.RefObject<HTMLElement | null>; onClose(): void }) {
  const state = useTimer((s) => s.state);
  const settings = useTimer((s) => s.settings);
  const timer = useTimer.getState();
  const tree = useStore((s) => s.tree);
  const [showSettings, setShowSettings] = useState(false);
  useTick(state.running);

  const today = useStudy((db) => study.focusStats(db, startOfToday()), []);
  const left = remainingMs(state, Date.now());
  const total = durationMs(state.phase, settings);
  const courses = tree.flatMap((s) => s.courses.map((c) => ({ ...c, semester: s.name })));
  // What this focus time counts for: picked by hand, the running round's, or what's open now.
  const view = useStore((s) => s.view);
  const page = useStore((s) => s.page);
  const contextCourse = view.kind === "course" ? view.courseId : view.kind === "page" ? (page?.courseId ?? null) : null;
  const shownCourse = state.courseFixed || state.startedAt !== null ? state.courseId : contextCourse;

  return (
    <Popover anchor={anchor} onClose={onClose} label="Pomodoro timer" width={312} role="dialog" className="timer-panel">
      <div className="segmented segmented--sm timer-phases" role="radiogroup" aria-label="Phase">
        {PHASES.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={state.phase === p}
            aria-pressed={state.phase === p}
            onClick={() => timer.choosePhase(p)}
          >
            {PHASE_LABEL[p]}
          </button>
        ))}
      </div>

      <div className={`timer-face${state.phase !== "focus" ? " is-break" : ""}`}>
        <Ring progress={1 - left / total} size={132}>
          <span className="timer-clock" aria-live="off">
            {formatClock(left)}
          </span>
        </Ring>
        <div className="timer-rounds" aria-label={`Round ${Math.min(state.round + 1, settings.longEvery)} of ${settings.longEvery}`}>
          {Array.from({ length: settings.longEvery }, (_, i) => (
            <span key={i} className={`timer-dot${i < state.round ? " is-done" : ""}`} aria-hidden="true" />
          ))}
        </div>
      </div>

      <div className="timer-controls">
        <button type="button" className="row-action timer-small" aria-label="Reset" title="Reset" onClick={timer.reset}>
          <RotateCcw size={16} aria-hidden="true" />
        </button>
        {state.running ? (
          <button type="button" className="btn btn--primary timer-main" onClick={timer.pause}>
            <Pause size={15} aria-hidden="true" />
            Pause
          </button>
        ) : (
          <button type="button" className="btn btn--primary timer-main" onClick={timer.start}>
            <Play size={15} aria-hidden="true" />
            {left === total ? "Start" : "Resume"}
          </button>
        )}
        <button type="button" className="row-action timer-small" aria-label="Skip to the next phase" title="Skip" onClick={timer.skip}>
          <SkipForward size={16} aria-hidden="true" />
        </button>
      </div>

      <label className="timer-course">
        <span>Counts for</span>
        <select
          className="todo-add-course"
          value={shownCourse ?? ""}
          onChange={(e) => timer.setCourse(e.target.value || null)}
        >
          <option value="">No course</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {today && (
        <div className="timer-today">
          Today: <strong>{formatMinutes(today.minutes)}</strong> focused
          {today.rounds > 0 && ` · ${today.rounds} ${today.rounds === 1 ? "round" : "rounds"}`}
        </div>
      )}

      <div className="menu-divider" role="separator" />
      <button type="button" className="tree-add tree-add--muted" aria-expanded={showSettings} onClick={() => setShowSettings((s) => !s)}>
        {showSettings ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
        <span>Settings</span>
      </button>
      {showSettings && (
        <div className="timer-settings">
          <NumberField label="Focus" unit="min" value={settings.focus} min={1} max={180} onChange={(v) => timer.updateSettings({ focus: v })} />
          <NumberField label="Short break" unit="min" value={settings.short} min={1} max={60} onChange={(v) => timer.updateSettings({ short: v })} />
          <NumberField label="Long break" unit="min" value={settings.long} min={1} max={90} onChange={(v) => timer.updateSettings({ long: v })} />
          <NumberField
            label="Long break after"
            unit="rounds"
            value={settings.longEvery}
            min={2}
            max={10}
            onChange={(v) => timer.updateSettings({ longEvery: v })}
          />
          <Toggle label="Start breaks automatically" on={settings.autoStartBreaks} onChange={(v) => timer.updateSettings({ autoStartBreaks: v })} />
          <Toggle label="Start focus after a break" on={settings.autoStartFocus} onChange={(v) => timer.updateSettings({ autoStartFocus: v })} />
          <Toggle label="Chime" on={settings.sound} onChange={(v) => timer.updateSettings({ sound: v })} />
        </div>
      )}
    </Popover>
  );
}

function NumberField({
  label,
  unit,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  onChange(v: number): void;
}) {
  return (
    <label className="timer-setting">
      <span>{label}</span>
      <input
        type="number"
        className="field timer-number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const v = Math.round(Number(e.target.value));
          if (Number.isFinite(v) && v >= min && v <= max) onChange(v);
        }}
      />
      <span className="timer-unit">{unit}</span>
    </label>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange(v: boolean): void }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="timer-setting timer-toggle" onClick={() => onChange(!on)}>
      <span>{label}</span>
      <span className={`switch${on ? " is-on" : ""}`} aria-hidden="true" />
    </button>
  );
}
