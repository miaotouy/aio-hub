CREATE TABLE pending_file_deletions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  storage_root TEXT NOT NULL CHECK (storage_root IN ('app_data', 'cache')),
  relative_path TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (storage_root, relative_path)
);

CREATE INDEX idx_pending_file_deletions_created
  ON pending_file_deletions(created_at, id);
