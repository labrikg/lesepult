import { ChevronDown, ChevronUp, Search, X } from "lucide-react";

interface Props {
  inputRef: React.RefObject<HTMLInputElement | null>;
  query: string;
  onQuery(q: string): void;
  total: number;
  /** 1-based number of the current match (0: none). */
  position: number;
  loading: boolean;
  /** True once the query is long enough to search. */
  searching: boolean;
  onNext(): void;
  onPrev(): void;
  onClose(): void;
}

/** The find-in-PDF row under the PDF toolbar: Enter / ⇧Enter step through matches, Esc closes. */
export function FindBar({ inputRef, query, onQuery, total, position, loading, searching, onNext, onPrev, onClose }: Props) {
  const status = loading ? "Reading…" : !searching ? "" : total ? `${position} of ${total}` : "No matches";
  return (
    <div className="find-bar" role="search" aria-label="Find in this PDF">
      <Search size={14} aria-hidden="true" />
      <input
        ref={inputRef}
        autoFocus
        className="find-input"
        aria-label="Find in this PDF"
        placeholder="Find in this PDF"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) onPrev();
            else onNext();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
      />
      <span className={`find-status${searching && !loading && !total ? " is-empty" : ""}`} aria-live="polite">
        {status}
      </span>
      <button type="button" className="tool-btn" aria-label="Previous match" title="Previous (⇧↩)" disabled={!total} onClick={onPrev}>
        <ChevronUp size={16} aria-hidden="true" />
      </button>
      <button type="button" className="tool-btn" aria-label="Next match" title="Next (↩)" disabled={!total} onClick={onNext}>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      <button type="button" className="tool-btn" aria-label="Close find" title="Close (Esc)" onClick={onClose}>
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
