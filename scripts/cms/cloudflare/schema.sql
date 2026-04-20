CREATE TABLE IF NOT EXISTS cms_documents (
  id TEXT PRIMARY KEY,
  content_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS cms_releases (
  id TEXT PRIMARY KEY,
  previous_live_hash TEXT NOT NULL,
  new_live_hash TEXT NOT NULL,
  backup_ref TEXT,
  changed_paths_json TEXT,
  published_at TEXT NOT NULL,
  published_by TEXT,
  reason TEXT,
  deploy_hook_status TEXT,
  deploy_hook_response_json TEXT
);

CREATE TABLE IF NOT EXISTS cms_assets (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL,
  public_url TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  uploaded_at TEXT NOT NULL,
  uploaded_by TEXT,
  metadata_json TEXT
);

CREATE TABLE IF NOT EXISTS cms_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO cms_documents (id, content_json, content_hash, updated_at)
VALUES ('live', '{}', 'bootstrap', datetime('now'));

INSERT OR IGNORE INTO cms_documents (id, content_json, content_hash, updated_at)
VALUES ('stage', '{}', 'bootstrap', datetime('now'));
