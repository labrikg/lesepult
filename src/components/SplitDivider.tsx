import { useRef } from "react";
import { useStore } from "../store";

/** Width limits for the two panes in split view (px). */
const MIN_PDF = 440;
const MIN_NOTE = 320;
const STEP = 0.02;

/** The PDF pane's share of the split (0..1), kept per window in web storage. */
const SPLIT_KEY = "lesepult.split";

export function readSplit(): number {
  try {
    const v = Number(localStorage.getItem(SPLIT_KEY));
    return v >= 0.15 && v <= 0.85 ? v : 0.5;
  } catch {
    return 0.5;
  }
}

function saveSplit(v: number) {
  try {
    localStorage.setItem(SPLIT_KEY, String(Math.round(v * 1000) / 1000));
  } catch {
    // Only a convenience.
  }
}

/** Keeps both panes at least their minimum width. */
function clamp(ratio: number, width: number): number {
  if (width <= MIN_PDF + MIN_NOTE) return 0.5;
  return Math.min(1 - MIN_NOTE / width, Math.max(MIN_PDF / width, ratio));
}

/**
 * The line between PDF and note: drag it to resize the panes, double-click for half and half,
 * or focus it and use ← / →. While dragging, the PDF keeps its zoom (re-rendering every page on
 * each mouse move would stutter) and redraws once at the end.
 */
export function SplitDivider({
  ratio,
  onChange,
  workspace,
}: {
  ratio: number;
  onChange(ratio: number): void;
  workspace: React.RefObject<HTMLDivElement | null>;
}) {
  const dragging = useRef(false);
  const live = useRef(ratio);

  const apply = (r: number) => {
    live.current = r;
    workspace.current?.style.setProperty("--split", `${r * 100}%`);
  };
  const commit = (r: number) => {
    onChange(r);
    saveSplit(r);
  };
  const width = () => workspace.current?.getBoundingClientRect().width ?? 0;

  return (
    <div
      className="split-divider"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize PDF and note"
      aria-valuemin={15}
      aria-valuemax={85}
      aria-valuenow={Math.round(ratio * 100)}
      tabIndex={0}
      title="Drag to resize · double-click for half and half"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = true;
        live.current = ratio;
        document.body.classList.add("is-resizing-panes");
        useStore.setState({ resizingPanes: true });
      }}
      onPointerMove={(e) => {
        if (!dragging.current || !workspace.current) return;
        const box = workspace.current.getBoundingClientRect();
        apply(clamp((e.clientX - box.left) / box.width, box.width));
      }}
      onPointerUp={() => {
        if (!dragging.current) return;
        dragging.current = false;
        document.body.classList.remove("is-resizing-panes");
        useStore.setState({ resizingPanes: false });
        commit(live.current);
      }}
      onLostPointerCapture={() => {
        if (!dragging.current) return;
        dragging.current = false;
        document.body.classList.remove("is-resizing-panes");
        useStore.setState({ resizingPanes: false });
        commit(live.current);
      }}
      onDoubleClick={() => {
        apply(0.5);
        commit(0.5);
      }}
      onKeyDown={(e) => {
        const d = e.key === "ArrowLeft" ? -STEP : e.key === "ArrowRight" ? STEP : 0;
        if (d) {
          e.preventDefault();
          const r = clamp(ratio + d, width());
          apply(r);
          commit(r);
        } else if (e.key === "Enter" || e.key === "Home") {
          e.preventDefault();
          apply(0.5);
          commit(0.5);
        }
      }}
    />
  );
}
