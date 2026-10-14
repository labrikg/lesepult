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

/** BlockNote colours mapped onto the library-desk tokens (studyhub-spec.md). */
const libraryTheme: Theme = {
  colors: {
    editor: { text: "#2a2420", background: "#fcfaf5" },
    menu: { text: "#2a2420", background: "#fffefb" },
    tooltip: { text: "#fcfaf5", background: "#2a2420" },
    hovered: { text: "#2a2420", background: "#efe7da" },
    selected: { text: "#fcfaf5", background: "#4a6741" },
    disabled: { text: "#8a7e72", background: "#ede4d5" },
    shadow: "rgba(60, 45, 30, 0.14)",
    border: "#dcd1bf",
    sideMenu: "#8a7e72",
    highlights: {
      yellow: { text: "#5a4a2a", background: "#fbf0d2" },
      blue: { text: "#23465e", background: "#dde9f3" },
      green: { text: "#2f4529", background: "#e3eedb" },
    },
  },
  borderRadius: 8,
  fontFamily: '"Figtree Variable", system-ui, sans-serif',
};

const lightOnly = { colorSchemePreference: "light" as const };

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

/** The block editor for one page. Mount with `key={page.id}` so each page gets a fresh editor. */
export function NoteEditor({ content, plainText, onChange, onReady }: Props) {
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

  return (
    <BlockNoteContext.Provider value={lightOnly}>
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
