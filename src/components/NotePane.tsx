import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import type { Page } from "../lib/repo";
import { relativeTime } from "../lib/time";

const SAVE_DELAY_MS = 400;

export function NotePane({ page }: { page: Page }) {
  const savePage = useStore((s) => s.savePage);
  const [title, setTitle] = useState(page.title);
  const [body, setBody] = useState(page.plainText);
  const pending = useRef<{ title?: string; plainText?: string }>({});
  const timer = useRef<number | undefined>(undefined);
  const titleRef = useRef<HTMLInputElement>(null);

  // Saves whatever is pending for this page right away (on switch / unmount).
  const flush = useRef(() => {});
  flush.current = () => {
    window.clearTimeout(timer.current);
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length) savePage(page.id, patch);
  };

  useEffect(() => {
    setTitle(page.title);
    setBody(page.plainText);
    if (!page.title) titleRef.current?.focus();
    return () => flush.current();
    // Only reset when a different page is opened, not on our own saves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id]);

  const queue = (patch: { title?: string; plainText?: string }) => {
    pending.current = { ...pending.current, ...patch };
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => flush.current(), SAVE_DELAY_MS);
  };

  return (
    <section className="note-pane" aria-label="Note editor">
      <div className="note-inner">
        <div className="note-meta">
          <span>Edited {relativeTime(page.updatedAt)}</span>
        </div>

        <input
          ref={titleRef}
          className="note-title"
          aria-label="Page title"
          placeholder="Untitled"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            queue({ title: e.target.value });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") document.getElementById("note-body")?.focus();
          }}
        />

        <textarea
          id="note-body"
          className="note-body"
          aria-label="Note text"
          placeholder="Start writing… (the block editor with slash commands replaces this next)"
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            queue({ plainText: e.target.value });
          }}
        />
      </div>
    </section>
  );
}
