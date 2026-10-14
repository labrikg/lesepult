import { type ReactNode, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

interface Props {
  what: string;
  onConfirm(): void;
  /** Icon for the unarmed state (defaults to a bin). */
  icon?: ReactNode;
}

/**
 * Two-step delete button: the first click arms it ("Delete?"), the second deletes.
 * Disarms after a few seconds. Avoids native dialogs, which behave differently per OS webview.
 */
export function ConfirmDelete({ what, onConfirm, icon }: Props) {
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
        setArmed(false);
        onConfirm();
      }}
    >
      {icon ? "Remove?" : "Delete?"}
    </button>
  ) : (
    <button
      type="button"
      className="row-action"
      aria-label={`${icon ? "Remove" : "Delete"} ${what}`}
      title={`${icon ? "Remove" : "Delete"} ${what}`}
      onClick={(e) => {
        e.stopPropagation();
        setArmed(true);
      }}
    >
      {icon ?? <Trash2 size={14} aria-hidden="true" />}
    </button>
  );
}
