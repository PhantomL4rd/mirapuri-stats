-- sync_versions テーブル: バージョンごとの freshness を管理
CREATE TABLE IF NOT EXISTS sync_versions (
  version TEXT PRIMARY KEY,
  data_from TEXT,
  data_to TEXT,
  synced_at TEXT NOT NULL
);

-- 既存データの移行（active_version が '0' 以外の場合）
INSERT OR IGNORE INTO sync_versions (version, data_from, data_to, synced_at)
SELECT
  (SELECT value FROM meta WHERE key = 'active_version'),
  (SELECT value FROM meta WHERE key = 'data_from'),
  (SELECT value FROM meta WHERE key = 'data_to'),
  datetime('now')
WHERE EXISTS (SELECT 1 FROM meta WHERE key = 'active_version' AND value != '0');
