import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import type { Page, PagePatch } from "../lib/repo";
import { relativeTime } from "../lib/time";
import { NoteEditor, type NoteChange } from "../editor/NoteEditor";
import type { NoteEditor as Editor } from "../editor/schema";

const SAVE_DELAY_MS = 400;

export function NotePane({ page }: { page: Page }) {
  const savePage = useStore((s) => s.savePage);
  const [title, setTitle] = useState(page.title);
  const pending = useRef<PagePatch>({});
  const timer = useRef<number | undefined>(undefined);
  const titleRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);

  // Saves whatever is pending for this page right away (on page switch / unmount).
  const flush = useRef(() => {});
  flush.current = () => {
    window.clearTimeout(timer.current);
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length) savePage(page.id, patch);
  };

  useEffect(() => {
    setTitle(page.title);
    if (!page.title) titleRef.current?.focus();
    return () => flush.current();
    // Only reset when a different page is opened, not on our own saves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id]);

  // Keep the title field in sync when the page is renamed elsewhere (e.g. from the sidebar).
  useEffect(() => {
    if (document.activeElement !== titleRef.current) setTitle(page.title);
  }, [page.title]);

  useEffect(() => {
    const onUnload = () => flush.current();
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  const queue = useCallback((patch: PagePatch) => {
    pending.current = { ...pending.current, ...patch };
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => flush.current(), SAVE_DELAY_MS);
  }, []);

  const onEditorChange = useCallback((c: NoteChange) => queue(c), [queue]);
  const onReady = useCallback((e: Editor) => {
    editorRef.current = e;
  }, []);

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
            if (e.key === "Enter" || e.key === "ArrowDown") {
              e.preventDefault();
              const ed = editorRef.current;
              if (ed) {
                ed.setTextCursorPosition(ed.document[0], "start");
                ed.focus();
              }
            }
          }}
        />

        <NoteEditor
          key={page.id}
          content={page.content}
          plainText={page.plainText}
          onChange={onEditorChange}
          onReady={onReady}
        />
      </div>
    </section>
  );
}
