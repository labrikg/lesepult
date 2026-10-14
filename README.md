# Study Hub

A desktop app for all your study material: notes, lecture PDFs and (soon) flashcards, organised by semester and course.
Built with Tauri 2, React + TypeScript and SQLite. Runs on macOS and Linux.

## What works right now

- Sidebar: semesters → courses → pages. Add with **+**, rename with a double-click, delete with the bin (click twice to confirm).
- Block editor (BlockNote): type **/** for headings, lists, checklists, toggles, quotes, tables, code blocks and **LaTeX formulas**.
  Markdown shortcuts work too (`# `, `- `, `1. `, `[] `, `> `). Drag blocks by the ⋮⋮ handle; click below the last block to add one.
- LaTeX blocks render with KaTeX; click a formula to edit its source. Code blocks have syntax highlighting (pick the language at the top left of the block).
- Everything saves automatically; full-text search covers titles, text, code and formulas: **⌘K** (macOS) / **Ctrl K** (Linux).
- View modes PDF / Split / Note; the app remembers the last page and view.
- The PDF pane is a placeholder; PDF import, highlights and snips are the next step.

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

One SQLite file, `studyhub.db`, in the app's config folder:

- macOS: `~/Library/Application Support/app.studyhub.desktop/`
- Linux: `~/.config/app.studyhub.desktop/`

Delete it to start over.

## Project layout

```
src/
  App.tsx                 layout, welcome screen
  store.ts                app state (zustand) + actions
  lib/db.ts               database connection
  lib/repo.ts             all SQL: tree, pages, search, UI state
  editor/                 block editor: schema, LaTeX block, slash menu, content ↔ plain text
  components/             Sidebar, TopBar, NotePane, PdfPane, SearchDialog, …
  styles/tokens.css       design tokens (colours, fonts) from the approved mockup
src-tauri/
  migrations/0001_init.sql  schema: semesters, courses, documents, pages, highlights,
                            snips, note_refs, tags, kv, pages_fts (FTS5)
  src/lib.rs                registers the SQL plugin + migrations
```

New schema changes go in a new `migrations/000N_*.sql` file registered in `lib.rs`; never edit a migration that has already run.

## Roadmap

1. ~~Block editor~~ ✓
2. **PDFs**: import, PDF.js viewer, highlights + comments, "Send to note", "Jump to page", snip tool
3. Export notes to Markdown / PDF
4. v2: flashcards with spaced repetition, deadlines & exam dates, to-dos per course
