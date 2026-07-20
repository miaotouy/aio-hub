CREATE TABLE chat_sessions (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  root_node_id      TEXT NOT NULL,
  active_leaf_id    TEXT NOT NULL,
  display_agent_id  TEXT,
  message_count     INTEGER NOT NULL DEFAULT 0 CHECK (message_count >= 0),
  is_favorite       INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX idx_chat_sessions_updated
  ON chat_sessions(updated_at DESC, id DESC);

CREATE TABLE chat_messages (
  id                      TEXT PRIMARY KEY,
  session_id              TEXT NOT NULL,
  parent_id               TEXT,
  sibling_order           INTEGER NOT NULL DEFAULT 0 CHECK (sibling_order >= 0),
  last_selected_child_id  TEXT,
  role                    TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  type                    TEXT NOT NULL DEFAULT 'message',
  content                 TEXT NOT NULL DEFAULT '',
  status                  TEXT NOT NULL CHECK (status IN ('generating', 'complete', 'error')),
  timestamp               TEXT NOT NULL,
  reasoning_content       TEXT,
  metadata_json           TEXT,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES chat_messages(id) ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX idx_chat_messages_session
  ON chat_messages(session_id, sibling_order, id);
CREATE INDEX idx_chat_messages_parent
  ON chat_messages(session_id, parent_id, sibling_order, id);

CREATE TABLE chat_attachments (
  id              TEXT PRIMARY KEY,
  message_id      TEXT NOT NULL,
  asset_id        TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('image', 'audio', 'video', 'document', 'other')),
  display_name    TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  size_bytes      INTEGER NOT NULL CHECK (size_bytes >= 0),
  usage_policy    TEXT NOT NULL DEFAULT 'advisory'
                    CHECK (usage_policy IN ('advisory', 'blocking')),
  extracted_text  TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at      TEXT NOT NULL,
  FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
  UNIQUE (message_id, asset_id)
);

CREATE INDEX idx_chat_attachments_message
  ON chat_attachments(message_id, sort_order, id);

CREATE TABLE asset_usage_outbox (
  sequence        INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id        TEXT NOT NULL UNIQUE,
  module_id       TEXT NOT NULL DEFAULT 'llm-chat',
  entity_type     TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  operation       TEXT NOT NULL CHECK (operation IN ('replace', 'release')),
  payload_json    TEXT NOT NULL,
  attempt_count   INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error      TEXT,
  created_at      TEXT NOT NULL,
  delivered_at    TEXT,
  dead_letter_at  TEXT
);

CREATE INDEX idx_asset_usage_outbox_pending
  ON asset_usage_outbox(delivered_at, dead_letter_at, sequence);
CREATE INDEX idx_asset_usage_outbox_entity_order
  ON asset_usage_outbox(module_id, entity_type, entity_id, sequence);

CREATE VIRTUAL TABLE chat_messages_fts USING fts5(
  content,
  reasoning_content,
  content='chat_messages',
  content_rowid='rowid',
  tokenize='trigram'
);

CREATE TRIGGER chat_messages_ai AFTER INSERT ON chat_messages BEGIN
  INSERT INTO chat_messages_fts(rowid, content, reasoning_content)
  VALUES (new.rowid, new.content, new.reasoning_content);
END;

CREATE TRIGGER chat_messages_ad AFTER DELETE ON chat_messages BEGIN
  INSERT INTO chat_messages_fts(chat_messages_fts, rowid, content, reasoning_content)
  VALUES ('delete', old.rowid, old.content, old.reasoning_content);
END;

CREATE TRIGGER chat_messages_au
AFTER UPDATE OF content, reasoning_content ON chat_messages
WHEN old.content IS NOT new.content
  OR old.reasoning_content IS NOT new.reasoning_content
BEGIN
  INSERT INTO chat_messages_fts(chat_messages_fts, rowid, content, reasoning_content)
  VALUES ('delete', old.rowid, old.content, old.reasoning_content);
  INSERT INTO chat_messages_fts(rowid, content, reasoning_content)
  VALUES (new.rowid, new.content, new.reasoning_content);
END;
