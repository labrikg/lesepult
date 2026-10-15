# Lesepult

*Lesepult* is German for lectern, the stand you put your book on while reading. It's a desktop app for all your study material: notes, lecture PDFs and (soon) flashcards, organised by semester and course.
Built with Tauri 2, React + TypeScript and SQLite. Runs on macOS and Linux.

## What works right now

- Sidebar: semesters → courses → **folders** (nested as deep as you like) → pages. Add with **+**, rename with a
  double-click, delete with the bin (click twice to confirm). The folder button on a course creates a folder; a folder's
  **⋯** menu has New page, New folder inside, Rename, Move to… and Delete (with everything in it).
  Pages and folders can be **dragged onto a course or folder**, or moved with *Move to…*; across courses a page's PDF and
  highlights move with it. The breadcrumb shows the full path.
- Block editor (BlockNote): type **/** for headings, lists, checklists, toggles, quotes, tables, code blocks and **LaTeX formulas**.
  **Tab** picks the highlighted command; typing a full command and a space applies it directly (`/latex␣`, `/h2␣`, `/code␣`).
  Markdown shortcuts work too (`# `, `- `, `1. `, `[] `, `> `). Drag blocks by the ⋮⋮ handle; click below the last block to add one.
- LaTeX blocks render with KaTeX; click a formula to edit its source. Code blocks have syntax highlighting (pick the language at the top left of the block).
- **Resize PDF and note**: drag the line between them in split view; double-click it for half and half. With the line
  focused, ← / → move it. The width is remembered; the PDF keeps its zoom while you drag and refits when you let go.
- **Hide the sidebar** for more room: the panel button at the top left, or **⌘.** / **Ctrl .** (remembered across restarts).
  Search (⌘K) and everything else keep working while it's hidden.
- Everything saves automatically; full-text search covers titles, text, code and formulas: **⌘K** (macOS) / **Ctrl K** (Linux).
  Add `#tag` to a search to narrow it to tagged pages (`#exam hashing`); a search of only `#exam` lists all those pages.
- **Search inside PDFs**: the same search also looks through the text of every attached PDF, one result per PDF with
  the best page, an excerpt and the other pages that match. It finds parts of words ("kontrolle" finds
  "Staukontrolle"), ignores case and accents, and reads across hyphenated line breaks. Opening a result shows the PDF at
  that page with the matches marked. PDFs are read in the background when attached (older ones on the next start).
  - **Find in a PDF**: **⌘F** / **Ctrl F** (or the magnifier in the PDF toolbar). Enter / ⇧Enter step through the
    matches, Esc closes. Scanned PDFs without a text layer can't be searched.
- **Tags**: *Add tag* under a note's title finds or creates a tag (Enter adds it, Backspace in the empty field removes the last one).
  Click a tag on a note, or under **Tags** in the sidebar, to show only pages with that tag. The **⋯** menu on a sidebar tag
  renames it (renaming to an existing tag merges the two), changes its colour, or deletes it from all pages.
- **Appearance** (Settings in the sidebar): light, dark ("library at night") or match the system. In the dark theme,
  *Dark PDF pages* turns slides into light-on-dark too, snips included. Printing and PDF export always use the light look.
- **PDFs**: "Attach PDF" copies a file into Lesepult and opens it next to the note (split view). Continuous scrolling,
  page jump, zoom (− / + / fit width), selectable text. Each PDF remembers where you stopped reading.
  Click the PDF's name in the toolbar to rename it; replace or remove it from there too. A paperclip in the sidebar marks pages with a PDF.
- **Highlights**: select text on a slide and pick yellow, blue or green (or press **1 / 2 / 3**), or "Comment" to highlight and
  write a note straight away. Selected text keeps formulas as inline LaTeX: on slides made with LaTeX, math fonts,
  sub- and superscripts are recognised (`$i_1 \cdot i_2 \in \mathbf{N}$`) and rendered in the note; umlauts that
  older TeX fonts split up ("nat¨urlich") are repaired. Fractions and other 2D formulas can't be rebuilt from a PDF
  this way; *Edit text* on a quote lets you fix or complete the text (formulas between `$…$`). Click a highlight to recolour it, edit its comment (⌘/Ctrl + Enter saves) or delete it.
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
  - *Export everything…* (sidebar) writes your whole library as a folder you can read without Lesepult:
    `Semester/Course/[Folder/…]/Page.md`, each course's PDFs in `PDFs/` (linked from the notes) and snips in `assets/`.
  - Exported notes list their tags as hashtags (`Tags: #exam #AVL-trees`), which Obsidian and similar apps pick up.

- **Study tools (v2)**:
  - **Flashcards**: type `/card` in a note (or click a highlight → *Flashcard*: the highlighted text becomes the answer).
    Click a side to edit it; Tab or Enter moves on; formulas go between `$…$`. Cards live in the note and are reviewed
    with spaced repetition (FSRS, as in modern Anki).
  - **Review**: *Today* or a course's overview → *Review*. Space shows the answer, **1–4** rate it (Again, Hard, Good,
    Easy; each shows when you'll see the card next). Missed cards come back in the same session; *Open note* jumps to the card.
  - **Course overview**: click a course's name (the chevron folds it). Next exam with countdown, flashcard numbers,
    exams & deadlines (add, edit, tick off), to-dos with due dates and a progress bar.
  - **Today** (top of the sidebar): cards due per course, exams and deadlines in the next 60 days, all open to-dos.
    The badge counts cards due; a course shows "12 d" when its exam is within 30 days.
  - **Cram mode**: *Cram all* in a course's overview (or under *Exam readiness* in the statistics) goes through every
    card of the course, weakest first, e.g. before an exam. **1** = Again (comes back a few cards later), **2** or
    Space = Knew it. Cramming counts as study activity but doesn't change when cards are due.
  - **Statistics** (sidebar, under *Today*), for all courses or one:
    - *Activity*: a heatmap of the last six months (cards answered plus focus time per day), streaks, last 30 days.
    - *Coming due*: learned cards due on each of the next 14 days (overdue ones count for today), plus new cards waiting.
    - *Focus per week*: Pomodoro minutes over the last 12 weeks.
    - *Retention*: per course, how often you still knew a learned card in the last 30 days (FSRS aims for 90%).
    - *Exam readiness*: per course with an exam coming up, the share of its cards you'd likely remember on exam day
      if you stopped reviewing now (FSRS's forgetting curve; new cards count as not known), cards learned, focus time.
    - Every chart can be switched to a table (the table icon), and hovering shows each value.
  - **Pomodoro timer** (top bar): 25 min focus, 5 min breaks, a 15 min break after every 4th round (all adjustable
    under *Settings* in the timer). Breaks start by themselves; a soft chime marks each switch, and a notification
    appears when Lesepult isn't the front window. The countdown also shows in the window title.
    Focus time counts for the course you're looking at when you press Start (or pick one under *Counts for*).
    Rounds stopped early count from one minute on. *Today* shows your focus time per course this week;
    a course's overview shows "X focused this week". The timer keeps running across restarts.
- **App icon**: a layered macOS icon (`src-tauri/icons/Lesepult.icon`, made for Icon Composer) compiled into
  `Assets.car`, so macOS draws its default, dark, clear and tinted looks. After changing the `.icon`, rebuild on a Mac
  with Xcode 26+: `xcrun actool src-tauri/icons/Lesepult.icon --compile <out> --app-icon Lesepult --platform macosx
  --target-device mac --minimum-deployment-target 11.0 --output-partial-info-plist <out>/p.plist` and copy
  `Assets.car` (and `Lesepult.icns` as `icon.icns`) into `src-tauri/icons/`.

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
- Appearance and timer settings: the app's web storage (so the theme applies before anything is drawn)

| | Config folder | Data folder |
|---|---|---|
| macOS | `~/Library/Application Support/app.studyhub.desktop/` | same |
| Linux | `~/.config/app.studyhub.desktop/` | `~/.local/share/app.studyhub.desktop/` |

The folder names still say `studyhub`: that's the app's internal ID, kept from before the rename so existing data stays where it is.
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
                          highlights (selection → page-relative boxes, toolbar, popover),
                          mathText.ts: selected text → text with inline LaTeX, umlaut repair,
                          textMatch.ts: matching for PDF search, indexer.ts: reads PDFs' text,
                          useFind.ts + FindBar.tsx: find in the open PDF
  lib/files.ts            PDF import / removal via the Rust commands
  export/                 Markdown converter, library layout, export + print actions
  study/                  Today and course overview, review session, FSRS scheduling (srs.ts),
                          to-do and deadline lists, date helpers, Pomodoro timer (pomodoro.ts:
                          pure transitions, timerStore.ts: live timer + log, Timer.tsx: UI),
                          statistics (stats.ts: pure aggregation, StatsView.tsx: charts)
  lib/studyRepo.ts        SQL for cards, reviews, deadlines, to-dos, focus time
  lib/pdfTextRepo.ts      SQL for PDF page text: indexing state, search across PDFs
  components/             Sidebar, TopBar, NotePane, PdfPane, SearchDialog, …
  styles/tokens.css       design tokens (colours, fonts): light theme + dark theme
  lib/theme.ts            theme preference, system light/dark, window title bar
src-tauri/
  migrations/0001_init.sql  schema: semesters, courses, documents, pages, highlights,
                            snips, note_refs, tags, kv, pages_fts (FTS5)
  migrations/0002_tag_colors.sql  tag colours
  migrations/0003_folders.sql     folders (nested) and pages.folder_id
  migrations/0004_study.sql       cards (mirrored from note blocks), reviews, deadlines, todos
  migrations/0005_focus.sql       focus_sessions (Pomodoro log)
  migrations/0006_pdf_text.sql    pdf_text_fts (page text, trigram index) + documents.text_indexed
  migrations/0007_cram.sql        reviews.cram (cram answers: activity, not schedule)
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
6. ~~Dark theme, tags~~ ✓
7. ~~Folders, formulas from PDFs, app icon~~ ✓
8. ~~v2: flashcards with spaced repetition, deadlines & exam dates, to-dos per course~~ ✓
9. ~~Pomodoro timer with focus time per course~~ ✓
10. ~~Search inside PDFs, find in PDF~~ ✓
11. ~~Statistics (heatmap, forecast, retention, focus, exam readiness), cram mode~~ ✓
