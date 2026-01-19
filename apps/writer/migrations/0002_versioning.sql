-- D1 Versioning Migration
-- バージョン管理機能の追加

-- 1. meta テーブル作成（バージョン管理用）
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 2. active_version 初期化
INSERT OR IGNORE INTO meta (key, value) VALUES ('active_version', '0');

-- 3. 新しい usage テーブル作成（バージョンあり）
CREATE TABLE IF NOT EXISTS usage (
  version TEXT NOT NULL,
  slot_id INTEGER NOT NULL,
  item_id TEXT NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (version, slot_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_usage_version_slot ON usage(version, slot_id);

-- 4. 新しい pairs テーブル作成（バージョンあり）
CREATE TABLE IF NOT EXISTS pairs (
  version TEXT NOT NULL,
  slot_pair TEXT NOT NULL CHECK (slot_pair IN ('head-body', 'body-hands', 'body-legs', 'legs-feet')),
  item_id_a TEXT NOT NULL,
  item_id_b TEXT NOT NULL,
  pair_count INTEGER NOT NULL DEFAULT 0,
  rank INTEGER NOT NULL,
  PRIMARY KEY (version, slot_pair, item_id_a, rank)
);

CREATE INDEX IF NOT EXISTS idx_pairs_version_pair_a ON pairs(version, slot_pair, item_id_a);

-- 5. 旧テーブル削除
DROP TABLE IF EXISTS item_usage;
DROP TABLE IF EXISTS item_pairs;
