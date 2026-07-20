ALTER TABLE import_jobs
  ADD COLUMN source_count INTEGER NOT NULL DEFAULT 1 CHECK (source_count > 0);

ALTER TABLE import_jobs
  ADD COLUMN completed_count INTEGER NOT NULL DEFAULT 0 CHECK (completed_count >= 0);

ALTER TABLE import_jobs
  ADD COLUMN current_source_index INTEGER;

ALTER TABLE import_jobs
  ADD COLUMN result_json TEXT NOT NULL DEFAULT '[]';

CREATE INDEX idx_import_jobs_created
  ON import_jobs(created_at DESC, id DESC);
