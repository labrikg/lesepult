import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Eraser, FilePlus2, Highlighter, PenLine, Redo2, SlidersHorizontal, Undo2 } from "lucide-react";
import { getDb } from "../lib/db";
import type { Page } from "../lib/repo";
import { isMac, shortcut } from "../lib/platform";
import { useDevicePixelRatio } from "../lib/useDevicePixelRatio";
import { useStore } from "../store";
import { PaneSwitch } from "../components/PaneSwitch";
import { Popover } from "../components/Popover";
import * as inkRepo from "./inkRepo";
import {
  MARKER_COLORS,
  MARKER_SIZES,
  PAPERS,
  PEN_COLORS,
  PEN_SIZES,
  isPaper,
  type Paper,
  type Sheet,
  type Stroke,
  type Tool,
} from "./model";
import { screenPalette } from "./render";
import { SheetView, type Brush } from "./SheetView";

/* Tool settings are a per-computer preference, like the sidebar. */
const PREFS_KEY = "lesepult.pad";
interface Prefs {
  tool: Tool;
  penColor: string;
  penSize: number;
  markerColor: string;
  markerSize: number;
  paper: Paper;
  fingerDraws: boolean;
}
const DEFAULT_PREFS: Prefs = {
  tool: "pen",
  penColor: "ink",
  penSize: 1,
  markerColor: "yellow",
  markerSize: 1,
  paper: "lined",
  fingerDraws: false,
};
function readPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
    return { ...DEFAULT_PREFS, ...p, paper: isPaper(p.paper) ? p.paper : DEFAULT_PREFS.paper };
  } catch {
    return DEFAULT_PREFS;
  }
}

interface Change {
  sheetId: string;
  before: Stroke[];
  after: Stroke[];
}

const SAVE_DELAY_MS = 500;

export function PadPane({ page }: { page: Page }) {
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [prefs, setPrefs] = useState(readPrefs);
  const [paperOpen, setPaperOpen] = useState(false);
  const paperButton = useRef<HTMLButtonElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const dpr = useDevicePixelRatio();

  const updatePrefs = (patch: Partial<Prefs>) =>
    setPrefs((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        /* web storage unavailable: settings last for this session */
      }
      return next;
    });

  // The theme and colour theme decide paper and ink colours on screen.
  const theme = useStore((s) => s.theme);
  const skin = useStore((s) => s.skin);
  const palette = useMemo(() => screenPalette(), [theme, skin]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- Loading and saving ---- */

  const dirty = useRef(new Map<string, Stroke[]>());
  const timer = useRef<number | undefined>(undefined);
  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    const pending = [...dirty.current];
    dirty.current.clear();
    if (!pending.length) return;
    const db = await getDb();
    for (const [id, strokes] of pending) await inkRepo.saveStrokes(db, id, strokes);
  }, []);
  const queueSave = (sheetId: string, strokes: Stroke[]) => {
    dirty.current.set(sheetId, strokes);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS);
  };

  const [history, setHistory] = useState<{ undo: Change[]; redo: Change[] }>({ undo: [], redo: [] });

  useEffect(() => {
    let cancelled = false;
    setSheets(null);
    setHistory({ undo: [], redo: [] });
    (async () => {
      const db = await getDb();
      const list = await inkRepo.openSheets(db, page.id, readPrefs().paper);
      if (!cancelled) setSheets(list);
    })().catch((e) => useStore.setState({ error: String(e) }));
    return () => {
      cancelled = true;
      void flush();
    };
  }, [page.id, flush]);

  useEffect(() => {
    const onUnload = () => void flush();
    window.addEventListener("beforeunload", onUnload);
    useStore.setState({ flushPad: flush });
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      useStore.setState({ flushPad: null });
    };
  }, [flush]);

  /* ---- Editing ---- */

  const setStrokes = (sheetId: string, strokes: Stroke[]) => {
    setSheets((list) => list?.map((s) => (s.id === sheetId ? { ...s, strokes } : s)) ?? list);
    queueSave(sheetId, strokes);
  };

  const onChange = (sheetId: string, before: Stroke[], after: Stroke[]) => {
    setStrokes(sheetId, after);
    setHistory((h) => ({ undo: [...h.undo.slice(-199), { sheetId, before, after }], redo: [] }));
  };

  const undo = () => {
    const last = history.undo[history.undo.length - 1];
    if (!last) return;
    setStrokes(last.sheetId, last.before);
    setHistory((h) => ({ undo: h.undo.slice(0, -1), redo: [...h.redo, last] }));
  };
  const redo = () => {
    const next = history.redo[history.redo.length - 1];
    if (!next) return;
    setStrokes(next.sheetId, next.after);
    setHistory((h) => ({ undo: [...h.undo, next], redo: h.redo.slice(0, -1) }));
  };

  const addSheet = async () => {
    const db = await getDb();
    const sheet = await inkRepo.addSheet(db, page.id, sheets?.[0]?.paper ?? prefs.paper);
    setSheets((list) => [...(list ?? []), sheet]);
    requestAnimationFrame(() =>
      scroller.current?.querySelector(`[data-sheet="${(sheets?.length ?? 0) + 1}"]`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    );
  };

  const deleteSheet = async (sheetId: string) => {
    const db = await getDb();
    dirty.current.delete(sheetId);
    await inkRepo.deleteSheet(db, sheetId);
    const rest = (sheets ?? []).filter((s) => s.id !== sheetId);
    setSheets(rest.length ? rest : [await inkRepo.addSheet(db, page.id, prefs.paper)]);
    // Undo steps on a deleted sheet can't be replayed.
    setHistory((h) => ({
      undo: h.undo.filter((c) => c.sheetId !== sheetId),
      redo: h.redo.filter((c) => c.sheetId !== sheetId),
    }));
  };

  const choosePaper = async (paper: Paper) => {
    setPaperOpen(false);
    updatePrefs({ paper });
    setSheets((list) => list?.map((s) => ({ ...s, paper })) ?? list);
    await inkRepo.setPaper(await getDb(), page.id, paper);
  };

  /* ---- Layout: sheets fill the pane's width, up to a comfortable size ---- */

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      setWidth(Math.max(240, Math.min(900, Math.floor(w - 48))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---- Keys: P pen, H highlighter, E eraser, ⌘Z / ⇧⌘Z ---- */

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest("input, textarea, select, [contenteditable='true']")) return;
    if (useStore.getState().searchOpen || useStore.getState().review) return;
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (mod && !e.altKey && k === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (mod && !e.altKey && !e.shiftKey && k === "y") {
      e.preventDefault();
      redo();
    } else if (!mod && !e.altKey) {
      const tool = ({ p: "pen", h: "marker", e: "eraser" } as const)[k as "p" | "h" | "e"];
      if (tool) {
        e.preventDefault();
        updatePrefs({ tool });
      }
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const brush: Brush =
    prefs.tool === "marker"
      ? { tool: "marker", color: prefs.markerColor, size: MARKER_SIZES[prefs.markerSize] ?? MARKER_SIZES[1] }
      : { tool: prefs.tool, color: prefs.penColor, size: PEN_SIZES[prefs.penSize] ?? PEN_SIZES[1] };

  const colors = prefs.tool === "marker" ? MARKER_COLORS : PEN_COLORS;
  const currentColor = prefs.tool === "marker" ? prefs.markerColor : prefs.penColor;
  const sizeIndex = prefs.tool === "marker" ? prefs.markerSize : prefs.penSize;
  const swatch = (id: string) => (prefs.tool === "marker" ? palette.marker[id] : palette.pen[id]);
  const paper = sheets?.[0]?.paper ?? prefs.paper;
  const undoKeys = shortcut("Z");

  return (
    <section className="pad-pane" aria-label="Handwriting">
      <div className="pane-toolbar pad-toolbar">
        <PaneSwitch />
        <span className="toolbar-divider" aria-hidden="true" />
        <div className="pad-tools" role="group" aria-label="Tool">
          <button
            type="button"
            className="tool-btn"
            aria-pressed={prefs.tool === "pen"}
            aria-label="Pen (P)"
            title="Pen · P"
            onClick={() => updatePrefs({ tool: "pen" })}
          >
            <PenLine size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="tool-btn"
            aria-pressed={prefs.tool === "marker"}
            aria-label="Highlighter (H)"
            title="Highlighter · H"
            onClick={() => updatePrefs({ tool: "marker" })}
          >
            <Highlighter size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="tool-btn"
            aria-pressed={prefs.tool === "eraser"}
            aria-label="Eraser (E)"
            title="Eraser · E (or the pen's eraser end)"
            onClick={() => updatePrefs({ tool: "eraser" })}
          >
            <Eraser size={16} aria-hidden="true" />
          </button>
        </div>
        {prefs.tool !== "eraser" && (
          <>
            <div className="pad-colors" role="radiogroup" aria-label="Colour">
              {colors.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={currentColor === c.id}
                  aria-label={c.label}
                  title={c.label}
                  className="pad-swatch"
                  style={{ "--swatch": swatch(c.id) } as React.CSSProperties}
                  onClick={() =>
                    updatePrefs(prefs.tool === "marker" ? { markerColor: c.id } : { penColor: c.id })
                  }
                />
              ))}
            </div>
            <div className="pad-sizes" role="radiogroup" aria-label="Thickness">
              {["Fine", "Medium", "Bold"].map((label, i) => (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={sizeIndex === i}
                  aria-label={label}
                  title={label}
                  className="pad-size"
                  onClick={() => updatePrefs(prefs.tool === "marker" ? { markerSize: i } : { penSize: i })}
                >
                  <span style={{ width: 4 + i * 3, height: 4 + i * 3 }} />
                </button>
              ))}
            </div>
          </>
        )}
        <div className="toolbar-spacer" />
        <button
          type="button"
          className="tool-btn"
          aria-label="Undo"
          title={`Undo · ${undoKeys}`}
          disabled={!history.undo.length}
          onClick={undo}
        >
          <Undo2 size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="tool-btn"
          aria-label="Redo"
          title={`Redo · ${isMac ? "⇧⌘Z" : "Ctrl+Y"}`}
          disabled={!history.redo.length}
          onClick={redo}
        >
          <Redo2 size={16} aria-hidden="true" />
        </button>
        <button
          ref={paperButton}
          type="button"
          className="tool-btn"
          aria-label="Paper and input"
          title="Paper and input"
          aria-haspopup="menu"
          aria-expanded={paperOpen}
          onClick={() => setPaperOpen((o) => !o)}
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
        </button>
        {paperOpen && (
          <Popover anchor={paperButton} onClose={() => setPaperOpen(false)} label="Paper and input" width={250}>
            <div className="menu-label">Paper</div>
            {PAPERS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="menuitemradio"
                aria-checked={paper === p.id}
                className="menu-item"
                onClick={() => void choosePaper(p.id)}
              >
                <span className={`paper-icon paper-icon--${p.id}`} aria-hidden="true" />
                {p.label}
                {paper === p.id && <Check size={14} className="menu-check" aria-hidden="true" />}
              </button>
            ))}
            <div className="menu-divider" role="separator" />
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={prefs.fingerDraws}
              className="menu-item menu-item--two-line"
              onClick={() => updatePrefs({ fingerDraws: !prefs.fingerDraws })}
            >
              <span>
                <span className="menu-item-title">Draw with finger</span>
                <span className="menu-item-sub">
                  {prefs.fingerDraws
                    ? "Fingers draw; scroll with the scrollbar"
                    : "Off: fingers scroll, so a resting hand leaves no marks"}
                </span>
              </span>
              <span className={`switch${prefs.fingerDraws ? " is-on" : ""}`} aria-hidden="true" />
            </button>
          </Popover>
        )}
      </div>

      <div ref={scroller} className="pad-scroll">
        {sheets && width > 0 && (
          <div className="pad-stack">
            {sheets.map((s, i) => (
              <SheetView
                key={s.id}
                sheet={s}
                index={i}
                width={width}
                dpr={dpr}
                palette={palette}
                brush={brush}
                fingerDraws={prefs.fingerDraws}
                scroller={scroller}
                onChange={onChange}
                canDelete={sheets.length > 1 || s.strokes.length > 0}
                onDelete={(id) => void deleteSheet(id)}
              />
            ))}
            <button type="button" className="pad-add" style={{ width }} onClick={() => void addSheet()}>
              <FilePlus2 size={16} aria-hidden="true" />
              New sheet
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
