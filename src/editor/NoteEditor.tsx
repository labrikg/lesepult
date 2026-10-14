import { useEffect, useRef } from "react";
import { Sigma } from "lucide-react";
import { SourceBlockWithPreviewExtension } from "@blocknote/core";
import {
  filterSuggestionItems,
  insertOrUpdateBlockForSlashMenu,
  SuggestionMenu,
} from "@blocknote/core/extensions";
import { BlockNoteView, type Theme } from "@blocknote/mantine";
import {
  BlockNoteContext,
  type DefaultReactSuggestionItem,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
} from "@blocknote/react";
import { syntaxHighlighter } from "@blocknote/code-block";
import "@blocknote/core/style.css";
import "@blocknote/mantine/style.css";
import { schema, type NoteEditor as Editor, type NotePartialBlock } from "./schema";
import { blocksToPlainText, initialBlocks } from "./content";
import { findExactSlashItem } from "./slashMatch";
import { useStore } from "../store";

/**
 * BlockNote colours mapped onto the library-desk tokens. They are CSS variables, so the editor
 * follows the light/dark theme (and prints light) without re-rendering.
 */
const libraryTheme: Theme = {
  colors: {
    editor: { text: "var(--ink)", background: "var(--surface)" },
    menu: { text: "var(--ink)", background: "var(--paper)" },
    tooltip: { text: "var(--surface)", background: "var(--ink)" },
    hovered: { text: "var(--ink)", background: "var(--hover-menu)" },
    selected: { text: "var(--on-accent)", background: "var(--accent)" },
    disabled: { text: "var(--faint)", background: "var(--toolbar)" },
    shadow: "var(--backdrop)",
    border: "var(--line)",
    sideMenu: "var(--faint)",
    highlights: {
      yellow: { text: "var(--quote-yellow-head)", background: "var(--quote-yellow-tint)" },
      blue: { text: "var(--quote-blue-head)", background: "var(--quote-blue-tint)" },
      green: { text: "var(--quote-green-head)", background: "var(--quote-green-tint)" },
    },
  },
  borderRadius: 8,
  fontFamily: '"Figtree Variable", system-ui, sans-serif',
};

const schemeContext = { light: { colorSchemePreference: "light" as const }, dark: { colorSchemePreference: "dark" as const } };

function slashMenuItems(editor: Editor): DefaultReactSuggestionItem[] {
  const items = getDefaultReactSlashMenuItems(editor).filter((item) => item.group !== "Media");
  const latex: DefaultReactSuggestionItem = {
    title: "LaTeX formula",
    subtext: "Rendered math on its own line",
    aliases: ["latex", "math", "formula", "equation", "tex", "katex"],
    group: "Basic blocks",
    icon: <Sigma size={18} />,
    onItemClick: () => {
      const block = insertOrUpdateBlockForSlashMenu(editor, { type: "latex" } as NotePartialBlock);
      // Open the source popup right away so the formula can be typed immediately.
      editor
        .getExtension(SourceBlockWithPreviewExtension)
        ?.store.setState((s) => ({ ...s, popupOpen: block.id }));
      editor.setTextCursorPosition(block.id, "end");
      editor.focus();
    },
  };
  // Keep groups contiguous: put LaTeX right after the last "Basic blocks" item.
  const lastBasic = items.map((i) => i.group).lastIndexOf("Basic blocks");
  items.splice(lastBasic + 1, 0, latex);
  return items;
}

export interface NoteChange {
  content: string;
  plainText: string;
}

interface Props {
  pageId: string;
  content: string;
  plainText: string;
  onChange(change: NoteChange): void;
  onReady?(editor: Editor): void;
}

/** Puts the cursor in an empty paragraph at the end, adding one if the last block isn't one. */
function focusEnd(editor: Editor) {
  const last = editor.document[editor.document.length - 1];
  const lastIsEmptyParagraph =
    last?.type === "paragraph" && Array.isArray(last.content) && last.content.length === 0;
  if (last && !lastIsEmptyParagraph) editor.insertBlocks([{ type: "paragraph" }], last, "after");
  editor.setTextCursorPosition(editor.document[editor.document.length - 1], "end");
  editor.focus();
}

/** Scrolls a block into view and briefly flashes it. */
function revealBlock(blockId: string) {
  window.setTimeout(() => {
    const el = document.querySelector<HTMLElement>(
      `.note-editor .bn-block-outer[data-id="${CSS.escape(blockId)}"]`,
    );
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    // Web Animations rather than a class: ProseMirror owns the block's attributes and may reset them.
    const target = el.querySelector<HTMLElement>(".bn-block-content") ?? el;
    target.animate(
      [
        { boxShadow: "0 0 0 3px rgba(74, 103, 65, 0.55)", borderRadius: "12px", offset: 0 },
        { boxShadow: "0 0 0 3px rgba(74, 103, 65, 0.55)", borderRadius: "12px", offset: 0.35 },
        { boxShadow: "0 0 0 3px rgba(74, 103, 65, 0)", borderRadius: "12px", offset: 1 },
      ],
      { duration: 1600, easing: "ease-out" },
    );
  }, 60);
}

/**
 * Inserts blocks after the block the cursor was last in (or at the end). An empty paragraph
 * there is replaced instead, so sending several highlights doesn't leave gaps.
 */
function insertNear(editor: Editor, blocks: NotePartialBlock[], afterId: string | null): string | null {
  const doc = editor.document;
  const ref = (afterId && editor.getBlock(afterId)) || doc[doc.length - 1];
  if (!ref) return null;
  const isEmptyParagraph = ref.type === "paragraph" && Array.isArray(ref.content) && ref.content.length === 0;
  const inserted = isEmptyParagraph
    ? editor.replaceBlocks([ref], blocks).insertedBlocks
    : editor.insertBlocks(blocks, ref, "after");
  return inserted[inserted.length - 1]?.id ?? null;
}

/** The block editor for one page. Mount with `key={page.id}` so each page gets a fresh editor. */
export function NoteEditor({ pageId, content, plainText, onChange, onReady }: Props) {
  const editor = useCreateBlockNote({
    schema,
    initialContent: initialBlocks(content, plainText) as NotePartialBlock[] | undefined,
    extensions: [syntaxHighlighter],
  });

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    onReady?.(editor);
  }, [editor, onReady]);

  // Remember where the cursor last was, so "Send to note" lands there.
  const lastBlockId = useRef<string | null>(null);

  // Blocks sent from the PDF ("Send to note", snips).
  const noteQueue = useStore((s) => s.noteQueue);
  useEffect(() => {
    if (!noteQueue.length) return;
    const blocks = useStore.getState().takeNoteQueue() as NotePartialBlock[];
    const last = insertNear(editor, blocks, lastBlockId.current);
    if (last) {
      lastBlockId.current = last;
      revealBlock(last);
    }
  }, [noteQueue, editor]);

  // "In note" chips in the PDF ask to show a block.
  const focusBlock = useStore((s) => s.focusBlock);
  const theme = useStore((s) => s.theme);
  useEffect(() => {
    if (!focusBlock || focusBlock.pageId !== pageId) return;
    useStore.setState({ focusBlock: null });
    revealBlock(focusBlock.blockId);
  }, [focusBlock, pageId]);

  return (
    <BlockNoteContext.Provider value={schemeContext[theme]}>
      <div
        className="note-editor-area"
        onKeyDownCapture={(e) => {
          const menu = editor.getExtension(SuggestionMenu);
          if (!menu?.shown()) return;
          // Tab picks the highlighted slash-menu item (instead of indenting the block).
          if (e.key === "Tab" && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            editor.domElement?.dispatchEvent(
              new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
            );
            return;
          }
          // Typing a complete command and then a space applies it ("/latex␣", "/h2␣", "/code␣").
          if (e.key === " ") {
            const item = findExactSlashItem(slashMenuItems(editor), menu.store.state?.query ?? "");
            if (!item) return;
            e.preventDefault();
            e.stopPropagation();
            menu.closeMenu();
            menu.clearQuery();
            item.onItemClick();
          }
        }}
        onMouseDown={(e) => {
          // Clicking the empty space below the last block starts a new block there, like Notion.
          const target = e.target as HTMLElement;
          if (target.closest(".bn-block-outer, .bn-side-menu, [data-floating-ui-portal]")) return;
          if (!target.closest(".note-editor-area")) return;
          e.preventDefault();
          focusEnd(editor);
        }}
      >
        <BlockNoteView
          editor={editor}
          theme={libraryTheme}
          slashMenu={false}
          className="note-editor"
          onSelectionChange={() => {
            if (editor.isFocused()) lastBlockId.current = editor.getTextCursorPosition().block.id;
          }}
          onChange={() => {
            const doc = editor.document;
            onChangeRef.current({ content: JSON.stringify(doc), plainText: blocksToPlainText(doc) });
          }}
        >
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) => filterSuggestionItems(slashMenuItems(editor), query)}
          />
        </BlockNoteView>
      </div>
    </BlockNoteContext.Provider>
  );
}
