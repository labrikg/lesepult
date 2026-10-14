import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

/**
 * Two-step delete button: the first click arms it ("Delete?"), the second deletes.
 * Disarms after a few seconds. Avoids native dialogs, which behave differently per OS webview.
 */
export function ConfirmDelete({ what, onConfirm }: { what: string; onConfirm(): void }) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  return armed ? (
    <button
      type="button"
      className="row-action row-action--danger"
      onClick={(e) => {
        e.stopPropagation();
        onConfirm();
      }}
    >
      Delete?
    </button>
  ) : (
    <button
      type="button"
      className="row-action"
      aria-label={`Delete ${what}`}
      title={`Delete ${what}`}
      onClick={(e) => {
        e.stopPropagation();
        setArmed(true);
      }}
    >
      <Trash2 size={14} aria-hidden="true" />
    </button>
  );
}
