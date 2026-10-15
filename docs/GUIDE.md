# Using Lesepult

Everything Lesepult does, and how. Shortcuts are given for macOS (⌘); on Windows and Linux use Ctrl.

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
- **Hide the sidebar** for more room: the panel button at the top left, or **⌘.** / **Ctrl+.** (remembered across restarts).
  Search (⌘K) and everything else keep working while it's hidden.
- Everything saves automatically; full-text search covers titles, text, code and formulas: **⌘K** / **Ctrl+K**.
  Add `#tag` to a search to narrow it to tagged pages (`#exam hashing`); a search of only `#exam` lists all those pages.
- **Search inside PDFs**: the same search also looks through the text of every attached PDF, one result per PDF with
  the best page, an excerpt and the other pages that match. It finds parts of words ("kontrolle" finds
  "Staukontrolle"), ignores case and accents, and reads across hyphenated line breaks. Opening a result shows the PDF at
  that page with the matches marked. PDFs are read in the background when attached (older ones on the next start).
  - **Find in a PDF**: **⌘F** / **Ctrl+F** (or the magnifier in the PDF toolbar). Enter / ⇧Enter step through the
    matches, Esc closes. Scanned PDFs without a text layer can't be searched.
- **Tags**: *Add tag* under a note's title finds or creates a tag (Enter adds it, Backspace in the empty field removes the last one).
  Click a tag on a note, or under **Tags** in the sidebar, to show only pages with that tag. The **⋯** menu on a sidebar tag
  renames it (renaming to an existing tag merges the two), changes its colour, or deletes it from all pages.
- **Themes** (Settings in the sidebar): Lesepult's own look plus Catppuccin, Rosé Pine, Nord, Gruvbox, Solarized,
  Bubblegum (Lesepult's own pink one), Everforest and One, each with a light and a dark version. Two rows show at a
  time; scroll the grid for the rest. Where a palette colour was too faint for text, it was nudged toward legible
  (WCAG 4.5:1), keeping its hue.
- **Appearance** (Settings in the sidebar): light, dark or match the system. Slides keep their true colours in the dark
  theme; *Dark PDF pages* turns them into light-on-dark, snips included. Printing and PDF export always use the light look.
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
  - *Export note → PDF…* opens the print dialog with just the note laid out for A4; on macOS choose **PDF → Save as PDF**, on Windows the printer **Microsoft Print to PDF**.
  - *Export everything…* (sidebar) writes your whole library as a folder you can read without Lesepult:
    `Semester/Course/[Folder/…]/Page.md`, each course's PDFs in `PDFs/` (linked from the notes) and snips in `assets/`.
  - Exported notes list their tags as hashtags (`Tags: #exam #AVL-trees`), which Obsidian and similar apps pick up.

- **Study tools**:
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
