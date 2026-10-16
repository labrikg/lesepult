# Changelog

All notable changes to Lesepult. Downloads are on the [releases page](https://github.com/labrikg/lesepult/releases).

## 0.3.0 — 2026-10-17

### New

- **Pad: write by hand next to the PDF.** The new *Note / Pad* switch at the top of the note pane swaps the typed note
  for sheets of paper (blank, lined, grid or dots).
  - Tools: pen, highlighter (drawn under the ink) and eraser, each with four colours and three thicknesses, plus undo
    and redo. Shortcuts: P / H / E, and ⌘Z / ⇧⌘Z (Ctrl+Z / Ctrl+Y).
  - Input: pens with pressure draw thicker when you press harder (Windows Ink pens such as the Surface Pen, Wacom).
    The eraser end of a pen erases. On a Mac, an iPad works as a drawing tablet through Sidecar.
  - Fingers scroll unless *Draw with finger* is on, so a resting hand leaves no marks.
  - Ink follows the colour theme on screen. Exports and printing use light paper: the Markdown export adds the
    sheets as images, and the PDF export prints them after the note.

### Improved

- **Highlighted slide text keeps its structure.** Bullets, list levels and paragraphs stay on their own lines
  and are indented by level; lines that only wrapped are still joined. Long bullets wrap under their own text.
- **Bullets from PowerPoint slides** come out as •, ▸, ▪ and –.
- **Exams and deadlines**: a new entry starts on today's date, and the time is optional and visible as such
  (*Add time*, × to remove it).
- The add-a-to-do form shows a *Due date* chip instead of an empty date field.
- The checkbox on deadlines explains what it does (*Mark as done*).

### Fixed

- Ticking a deadline or a to-do as done had no effect: it was always saved as "not done".
- *Edit text* on a quote turned line breaks and multiple spaces into single spaces when saving.
- Bullets on PowerPoint slides (drawn with Wingdings) came out as "", "¾" or "¬"; the last one even became the
  formula `$\neg$`.
- Text on slides that weren't made with LaTeX was turned into formulas: "59% → 1" became `$59\% \to 1$`.
- A new exam or deadline couldn't be saved without touching the date, which looked filled in but was empty. The time
  field showed a time (e.g. 12:30) that was never saved.

## 0.2.2 — 2026-10-15

### Fixed

- macOS: on Apple Silicon Macs, a downloaded Lesepult was reported as "damaged and can't be opened". The app is now
  signed ad hoc, so macOS shows the usual *Open Anyway* step instead.

## 0.2.1 — 2026-10-15

The first public release, for macOS, Windows and Linux.

- Notes in a block editor next to the lecture PDF, with highlights, quotes and snips that link back to the page.
- Text from LaTeX slides keeps its formulas and umlauts.
- Flashcards with spaced repetition (FSRS), made with `/card` or straight from a PDF selection (*Flashcard*, or C).
  Cram mode before an exam.
- Search across notes and the text of every PDF (⌘K / Ctrl+K), find in the open PDF (⌘F / Ctrl+F).
- Exams, deadlines and to-dos per course; a *Today* view; a Pomodoro timer; statistics.
- Nine colour themes, each light and dark.
- Export a note as Markdown or PDF, or the whole library as a folder of Markdown files with the PDFs.

### Fixed during the Windows port

- PDFs didn't open on systems with an older built-in browser engine (older Windows versions, macOS 12–14, older
  Linux): "a.toHex is not a function".
- The zoom field showed a made-up value such as "47400%" while no PDF was loaded.
- Windows: F5 / Ctrl+R reloaded the app, Ctrl+P printed the whole window and Ctrl+F opened Edge's find bar.
- Windows: exported files could get names Windows doesn't allow (CON, AUX, NUL, COM1 …, or a trailing dot).
