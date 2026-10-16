-- Handwriting ("Pad"): the sheets of paper next to a page's note. `strokes` is JSON, an array of
-- { "id", "tool": "pen" | "marker", "color", "size", "pts": [x, y, pressure, x, y, pressure, …] }
-- in sheet units: a sheet is 1000 wide and 1414 high (A4), so ink scales with the pane.
CREATE TABLE ink_sheets (
  id          TEXT PRIMARY KEY,
  page_id     TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  position    REAL NOT NULL,
  paper       TEXT NOT NULL DEFAULT 'lined',
  strokes     TEXT NOT NULL DEFAULT '[]',
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_ink_sheets_page ON ink_sheets(page_id, position);
