# Study Hub

A desktop app for all your study material: notes, lecture PDFs and (soon) flashcards, organised by semester and course.
Built with Tauri 2, React + TypeScript and SQLite. Runs on macOS and Linux.

## What works right now

- Sidebar: semesters → courses → pages. Add with **+**, rename with a double-click, delete with the bin (click twice to confirm).
  Each page has a **⋯** menu (Rename, Move to course…, Delete), and pages can be **dragged onto another course**;
  a page's PDF and highlights move with it.
- Block editor (BlockNote): type **/** for headings, lists, checklists, toggles, quotes, tables, code blocks and **LaTeX formulas**.
  **Tab** picks the highlighted command; typing a full command and a space applies it directly (`/latex␣`, `/h2␣`, `/code␣`).
  Markdown shortcuts work too (`# `, `- `, `1. `, `[] `, `> `). Drag blocks by the ⋮⋮ handle; click below the last block to add one.
- LaTeX blocks render with KaTeX; click a formula to edit its source. Code blocks have syntax highlighting (pick the language at the top left of the block).
- Everything saves automatically; full-text search covers titles, text, code and formulas: **⌘K** (macOS) / **Ctrl K** (Linux).
- **PDFs**: "Attach PDF" copies a file into Study Hub and opens it next to the note (split view). Continuous scrolling,
  page jump, zoom (− / + / fit width), selectable text. Each PDF remembers where you stopped reading.
  Click the PDF's name in the toolbar to rename it; replace or remove it from there too. A paperclip in the sidebar marks pages with a PDF.
- **Highlights**: select text on a slide and pick yellow, blue or green (or press **1 / 2 / 3**), or "Comment" to highlight and
  write a note straight away. Click a highlight to recolour it, edit its comment (⌘/Ctrl + Enter saves) or delete it.
  Highlights with a comment show a small speech bubble.
- View modes PDF / Split / Note; the app remembers the last page and view.
- **Linking PDF and note**:
  - *Send to note* (in a highlight's popover, *To note* on a fresh selection, or press **N**) adds the highlight as a quote
    block where your cursor was in the note, with its comment and source page.
  - *Jump to page* on a quote or snip scrolls the PDF to that spot and flashes the highlight.
  - Highlights quoted in a note show an *In note* chip; clicking it scrolls the note to the quote.
  - The **scissors** tool snips a region of a page into the note as a crisp image (rendered from the PDF, not a screenshot).
  - Quoted text is searchable. Snips no note uses any more are cleaned up on the next start.
- **Export**:
  - *Export note → Markdown file…* writes the note as `.md` (formulas as `$$…$$`, quotes with source and page,
    code with its language) plus an `assets/` folder for snip images.
  - *Export note → PDF…* opens the print dialog with just the note laid out for A4; on macOS choose **PDF → Save as PDF**.
  - *Export everything…* (sidebar) writes your whole library as a folder you can read without Study Hub:
    `Semester/Course/Page.md`, each course's PDFs in `PDFs/` (linked from the notes) and snips in `assets/`.

## Setup

You need **Node.js 20+** and **Rust** (stable).

**macOS**

```sh
xcode-select --install                                         # compiler toolchain, if not installed
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh   # Rust
brew install node                                              # or nodejs.org installer
```

**Linux (Debian/Ubuntu)**

```sh
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Other distributions: see https://tauri.app/start/prerequisites/

## Run

```sh
npm install
npm run tauri dev      # first run compiles the Rust side, takes a few minutes
```

Build an installable app: `npm run tauri build` (output in `src-tauri/target/release/bundle/`).

## Tests

```sh
npm test                       # repository + schema tests (SQLite in memory)
cd src-tauri && cargo test     # migration test on the same SQLite engine the app uses
```

## Where your data lives

- Database `studyhub.db` (notes, structure, highlights): the app's config folder
- Imported PDFs: `documents/` in the app's data folder (the database stores paths relative to it)

| | Config folder | Data folder |
|---|---|---|
| macOS | `~/Library/Application Support/app.studyhub.desktop/` | same |
| Linux | `~/.config/app.studyhub.desktop/` | `~/.local/share/app.studyhub.desktop/` |

Delete both to start over. Files no longer referenced (e.g. after deleting a course) are cleaned up on the next start.

## Project layout

```
src/
  App.tsx                 layout, welcome screen
  store.ts                app state (zustand) + actions
  lib/db.ts               database connection
  lib/repo.ts             all SQL: tree, pages, search, UI state
  editor/                 block editor: schema, LaTeX block, PDF quote/snip blocks, slash menu,
                          content ↔ plain text and note → highlight links
  pdf/                    PDF viewer: PDF.js setup, page rendering + text layer, layout maths,
                          highlights (selection → page-relative boxes, toolbar, popover)
  lib/files.ts            PDF import / removal via the Rust commands
  export/                 Markdown converter, library layout, export + print actions
  components/             Sidebar, TopBar, NotePane, PdfPane, SearchDialog, …
  styles/tokens.css       design tokens (colours, fonts) from the approved mockup
src-tauri/
  migrations/0001_init.sql  schema: semesters, courses, documents, pages, highlights,
                            snips, note_refs, tags, kv, pages_fts (FTS5)
  src/lib.rs                registers plugins, migrations and commands
  src/files.rs              import_pdf / save_png / remove_stored_file / prune_stored_files
  src/export.rs             export_bundle (writes/copies files into a chosen folder) / print_window
scripts/copy-pdfjs-assets.mjs  copies PDF.js fonts, cmaps and decoders into public/ (runs before dev/build)
```

New schema changes go in a new `migrations/000N_*.sql` file registered in `lib.rs`; never edit a migration that has already run.

## Roadmap

1. ~~Block editor~~ ✓
2. ~~PDF import + viewer~~ ✓
3. ~~Highlights + comments~~ ✓
4. ~~"Send to note", "Jump to page", snip tool~~ ✓
5. ~~Export notes to Markdown / PDF~~ ✓ (v1 complete)
6. v2: flashcards with spaced repetition, deadlines & exam dates, to-dos per course
