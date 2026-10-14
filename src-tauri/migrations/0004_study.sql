-- v2 study tools.

-- Flashcards are blocks in notes. This table mirrors them (kept in sync when a note is saved)
-- and holds their spaced-repetition state. A card goes away with its block or its note.
CREATE TABLE cards (
  id            TEXT PRIMARY KEY,
  page_id       TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  block_id      TEXT NOT NULL,
  front         TEXT NOT NULL DEFAULT '',
  back          TEXT NOT NULL DEFAULT '',
  highlight_id  TEXT REFERENCES highlights(id) ON DELETE SET NULL,
  srs           TEXT,                 -- FSRS state as JSON; NULL = never reviewed
  state         INTEGER NOT NULL DEFAULT 0, -- 0 new, 1 learning, 2 review, 3 relearning
  due           TEXT NOT NULL,        -- next review (ISO); new cards: when created
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (page_id, block_id)
);
CREATE INDEX idx_cards_due ON cards(due);

-- One row per answer, for statistics.
CREATE TABLE reviews (
  id              TEXT PRIMARY KEY,
  card_id         TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  rating          INTEGER NOT NULL,   -- 1 again, 2 hard, 3 good, 4 easy
  state           INTEGER NOT NULL,   -- the card's state before this answer
  scheduled_days  REAL NOT NULL,
  reviewed_at     TEXT NOT NULL
);
CREATE INDEX idx_reviews_card ON reviews(card_id);
CREATE INDEX idx_reviews_time ON reviews(reviewed_at);

-- Exams, hand-in deadlines and other dates of a course.
CREATE TABLE deadlines (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'deadline' CHECK (kind IN ('exam', 'deadline', 'other')),
  date        TEXT NOT NULL,          -- YYYY-MM-DD
  time        TEXT,                   -- HH:MM, optional
  done        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_deadlines_course ON deadlines(course_id);
CREATE INDEX idx_deadlines_date ON deadlines(date);

-- To-dos of a course.
CREATE TABLE todos (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  done        INTEGER NOT NULL DEFAULT 0,
  due_date    TEXT,                   -- YYYY-MM-DD, optional
  position    REAL NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  done_at     TEXT
);
CREATE INDEX idx_todos_course ON todos(course_id);
