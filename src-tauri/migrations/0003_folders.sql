-- Folders inside a course, nested to any depth (Course › Vorlesungen › Kapitel 1 › page).
-- Deleting a folder deletes its sub-folders and the pages in them, like deleting a course.
CREATE TABLE folders (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  parent_id   TEXT REFERENCES folders(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  position    REAL NOT NULL,
  collapsed   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_folders_course ON folders(course_id);
CREATE INDEX idx_folders_parent ON folders(parent_id);

-- NULL = directly in the course.
ALTER TABLE pages ADD COLUMN folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE;
CREATE INDEX idx_pages_folder ON pages(folder_id);
