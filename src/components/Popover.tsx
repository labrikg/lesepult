import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  anchor: RefObject<HTMLElement | null>;
  onClose(): void;
  children: ReactNode;
  label: string;
  /** Preferred width in px. */
  width?: number;
  /** What gets focus when it opens (default: the first enabled button). */
  focusSelector?: string;
  role?: "menu" | "dialog";
  className?: string;
}

/**
 * A small menu anchored below an element. Rendered in a portal with fixed positioning so the
 * sidebar's overflow can't clip it. Closes on outside click, Escape, scroll or resize.
 */
export function Popover({
  anchor,
  onClose,
  children,
  label,
  width = 240,
  focusSelector = "button:not(:disabled)",
  role = "menu",
  className,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const a = anchor.current?.getBoundingClientRect();
    if (!a) return;
    const height = ref.current?.offsetHeight ?? 0;
    const left = Math.min(Math.max(8, a.left), window.innerWidth - width - 8);
    const below = a.bottom + 4;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, a.top - height - 4) : below;
    setPos({ top, left });
  }, [anchor, width, children]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor.current?.contains(t)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onScroll = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [anchor, onClose]);

  // Focus the first item when the menu opens, so it works from the keyboard.
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(focusSelector)?.focus();
    // Only on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div
      ref={ref}
      className={`popover${className ? ` ${className}` : ""}`}
      role={role}
      aria-label={label}
      style={{ width, top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      onKeyDown={(e) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        if (e.defaultPrevented) return; // handled inside (e.g. a list with its own keyboard logic)
        e.preventDefault();
        const items = [...(ref.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [])];
        const i = items.indexOf(document.activeElement as HTMLElement);
        const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
        items[next]?.focus();
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
