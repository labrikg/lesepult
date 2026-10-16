import { NotebookPen, PenLine } from "lucide-react";
import { useStore } from "../store";

/** Note or Pad: what sits next to the PDF. */
export function PaneSwitch() {
  const rightPane = useStore((s) => s.rightPane);
  const setRightPane = useStore((s) => s.setRightPane);
  return (
    <div className="segmented segmented--sm" role="group" aria-label="Note or handwriting">
      <button type="button" aria-pressed={rightPane === "note"} onClick={() => setRightPane("note")}>
        <NotebookPen size={13} aria-hidden="true" />
        Note
      </button>
      <button
        type="button"
        aria-pressed={rightPane === "pad"}
        title="Handwriting: write with a pen, a tablet or the mouse"
        onClick={() => setRightPane("pad")}
      >
        <PenLine size={13} aria-hidden="true" />
        Pad
      </button>
    </div>
  );
}
