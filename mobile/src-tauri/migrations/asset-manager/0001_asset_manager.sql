CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL UNIQUE CHECK (length(content_hash) = 64),
  kind TEXT NOT NULL CHECK (kind IN ('image', 'audio', 'video', 'document', 'other')),
  mime_type TEXT NOT NULL,
  display_name TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  storage_mode TEXT NOT NULL DEFAULT 'managed' CHECK (storage_mode IN ('managed', 'linked')),
  relative_path TEXT,
  availability TEXT NOT NULL DEFAULT 'ready'
    CHECK (availability IN ('ready', 'importing', 'reclaimed', 'missing', 'error')),
  library_state TEXT NOT NULL DEFAULT 'visible' CHECK (library_state IN ('visible', 'hidden')),
  retention_policy TEXT NOT NULL DEFAULT 'reclaimable'
    CHECK (retention_policy IN ('reclaimable', 'pinned')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (availability <> 'ready' OR relative_path IS NOT NULL)
);

CREATE INDEX idx_assets_library_updated
  ON assets(library_state, availability, updated_at DESC, id DESC);
CREATE INDEX idx_assets_kind_updated
  ON assets(kind, updated_at DESC, id DESC);

CREATE TABLE asset_origins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id TEXT NOT NULL,
  origin_kind TEXT NOT NULL CHECK (
    origin_kind IN ('file_picker', 'photo_picker', 'camera', 'share', 'network', 'generated', 'tool')
  ),
  source_module TEXT NOT NULL,
  original_name TEXT NOT NULL,
  locator TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE INDEX idx_asset_origins_asset_created
  ON asset_origins(asset_id, created_at DESC, id DESC);

CREATE TABLE asset_usages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  role TEXT NOT NULL,
  usage_policy TEXT NOT NULL CHECK (usage_policy IN ('advisory', 'blocking')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  UNIQUE (asset_id, module_id, entity_type, entity_id, role)
);

CREATE INDEX idx_asset_usages_asset
  ON asset_usages(asset_id, usage_policy, created_at DESC);
CREATE INDEX idx_asset_usages_entity
  ON asset_usages(module_id, entity_type, entity_id);

CREATE TABLE asset_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id TEXT NOT NULL,
  variant_kind TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  rebuildable INTEGER NOT NULL DEFAULT 1 CHECK (rebuildable IN (0, 1)),
  created_at TEXT NOT NULL,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  UNIQUE (asset_id, variant_kind)
);

CREATE TABLE import_jobs (
  id TEXT PRIMARY KEY,
  source_kind TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  bytes_copied INTEGER NOT NULL DEFAULT 0 CHECK (bytes_copied >= 0),
  total_bytes INTEGER,
  temp_path TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_import_jobs_state_updated
  ON import_jobs(state, updated_at DESC);
