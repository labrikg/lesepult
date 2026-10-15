# Developing Lesepult

Lesepult is a [Tauri 2](https://tauri.app) app: a React + TypeScript frontend (Vite) in a Rust shell, with SQLite for
all data. It runs on macOS, Windows and Linux.

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

**Windows**

1. [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/): in the installer, tick
   *Desktop development with C++*.
2. Rust with [rustup-init.exe](https://rustup.rs) (the default MSVC toolchain), and Node.js from nodejs.org.
3. WebView2 is part of Windows 11 and current Windows 10.

Other systems and details: https://tauri.app/start/prerequisites/

## Run and build

```sh
npm install
npm run tauri dev                      # first run compiles the Rust side, takes a few minutes
npm run tauri build -- --bundles app   # macOS: Lesepult.app in src-tauri/target/release/bundle/macos/
npm run tauri build                    # every installer for this platform (.dmg, .deb, .AppImage, .msi, …)
npm run tauri build -- --bundles nsis  # Windows: the setup .exe in src-tauri/target/release/bundle/nsis/
```

## Tests

```sh
npm test                       # repository, schema, search, statistics, timer … (SQLite in memory)
npx tsc --noEmit               # type check
cd src-tauri && cargo test     # file handling, data migration, and the schema on the app's own SQLite
```

GitHub Actions runs all of these on Linux and Windows for every push and pull request (`.github/workflows/ci.yml`).

## Releasing

1. Bump the version in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`.
2. If dependencies changed: `npm run licenses` (regenerates `THIRD_PARTY_LICENSES.md`, which is bundled with the app).
3. Commit, then tag and push: `git tag v0.2.0 && git push origin v0.2.0`.
4. `.github/workflows/release.yml` builds a universal macOS `.dmg` (Apple Silicon + Intel), a Windows setup `.exe`
   (NSIS, installs per user) and Linux `.AppImage`, `.deb` and `.rpm`, and attaches them to a **draft** release.
   Check it, write the notes, publish.

Neither the macOS nor the Windows build is signed, so both systems ask users to confirm the first launch (see the
README). Signing needs a paid Apple Developer account or a Windows code-signing certificate; the workflow notes where
the secrets go.

## Where data lives

- Database `lesepult.db` (notes, structure, highlights, cards, …): the app's config folder.
- Imported PDFs and snips: `documents/` in the app's data folder (the database stores paths relative to it).
- Appearance, timer and layout settings: the web view's storage (so the theme applies before anything is drawn).

| | Config folder | Data folder |
|---|---|---|
| macOS | `~/Library/Application Support/io.github.labrikg.lesepult/` | same |
| Linux | `~/.config/io.github.labrikg.lesepult/` | `~/.local/share/io.github.labrikg.lesepult/` |
| Windows | `%APPDATA%\io.github.labrikg.lesepult\` | same |

On Windows the web view's storage is in `%LOCALAPPDATA%\io.github.labrikg.lesepult\EBWebView\`.

Until v0.1 the app ID was `app.studyhub.desktop` and the database `studyhub.db`. On start, `src-tauri/src/migrate.rs`
moves those folders (and on macOS the web view storage) to the new ID once, before the window opens.

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
  components/             Sidebar, TopBar, NotePane, PdfPane, SearchDialog, SplitDivider, …
  styles/tokens.css       design tokens (colours, fonts): light + dark
  styles/skins.css        colour themes (generated, see below)
  lib/theme.ts            light/dark preference, colour theme, window title bar
  lib/platform.ts         macOS / Windows / Linux: shortcut labels (⌘ or Ctrl)
src-tauri/
  migrations/0001_init.sql        schema: semesters, courses, documents, pages, highlights,
                                  snips, note_refs, tags, kv, pages_fts (FTS5)
  migrations/0002_tag_colors.sql  tag colours
  migrations/0003_folders.sql     folders (nested) and pages.folder_id
  migrations/0004_study.sql       cards (mirrored from note blocks), reviews, deadlines, todos
  migrations/0005_focus.sql       focus_sessions (Pomodoro log)
  migrations/0006_pdf_text.sql    pdf_text_fts (page text, trigram index) + documents.text_indexed
  migrations/0007_cram.sql        reviews.cram (cram answers: activity, not schedule)
  src/lib.rs                      plugins, migrations, commands; creates the window after migrate.rs;
                                  switches off WebView2's browser keys on Windows (F5, Ctrl+R, Ctrl+P)
  src/migrate.rs                  moves data from the old app ID
  src/files.rs                    import_pdf / save_png / remove_stored_file / prune_stored_files
  src/export.rs                   export_bundle (writes/copies files into a chosen folder) / print_window
scripts/
  copy-pdfjs-assets.mjs   copies PDF.js fonts, cmaps and decoders into public/ (runs before dev/build)
  build-skins.mjs         generates the colour themes (npm run skins)
  third-party.mjs         generates THIRD_PARTY_LICENSES.md (npm run licenses)
```

New schema changes go in a new `migrations/000N_*.sql` file registered in `lib.rs`; never edit a migration that has
already run.

## Colour themes

`npm run skins` builds `src/styles/skins.css` and `src/lib/skins.ts` from the palettes in `scripts/build-skins.mjs`.
Each palette maps onto the design tokens for a light and a dark variant; colours too faint for their role (text 4.5:1,
faint text 3:1, button labels 4.5:1) are moved toward legible in OKLab, and the script lists what it changed.

## App icon

A layered macOS icon (`src-tauri/icons/Lesepult.icon`, made for Icon Composer) compiled into `Assets.car`, so macOS
draws its default, dark, clear and tinted looks. After changing the `.icon`, rebuild on a Mac with Xcode 26+:

```sh
xcrun actool src-tauri/icons/Lesepult.icon --compile <out> --app-icon Lesepult --platform macosx \
  --target-device mac --minimum-deployment-target 11.0 --output-partial-info-plist <out>/p.plist
```

and copy `Assets.car` (and `Lesepult.icns` as `icon.icns`) into `src-tauri/icons/`. `npm run tauri dev` shows a flat
PNG in the Dock (Tauri sets it at runtime in development); the built app shows the layered icon.
