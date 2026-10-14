-- Focus sessions from the Pomodoro timer: how long was studied, and for which course.
CREATE TABLE focus_sessions (
  id          TEXT PRIMARY KEY,
  course_id   TEXT REFERENCES courses(id) ON DELETE SET NULL,
  started_at  TEXT NOT NULL,
  ended_at    TEXT NOT NULL,
  minutes     REAL NOT NULL,
  completed   INTEGER NOT NULL DEFAULT 1   -- 0 = stopped early
);
CREATE INDEX idx_focus_started ON focus_sessions(started_at);
CREATE INDEX idx_focus_course ON focus_sessions(course_id);
