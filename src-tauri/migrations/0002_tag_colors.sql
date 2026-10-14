-- Tags get a colour from a small palette (moss, clay, sky, ochre, plum, sand).
-- The UI maps the name to theme-aware colours, so tags look right in light and dark.
ALTER TABLE tags ADD COLUMN color TEXT NOT NULL DEFAULT 'sand';
