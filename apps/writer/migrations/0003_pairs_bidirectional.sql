-- pairs テーブルを双方向対応に変更
-- 既存データは破棄可能なので、テーブル DROP → CREATE で対応

DROP TABLE IF EXISTS pairs;

CREATE TABLE pairs (
  version TEXT NOT NULL,
  base_slot_id INTEGER NOT NULL CHECK (base_slot_id BETWEEN 1 AND 5),
  partner_slot_id INTEGER NOT NULL CHECK (partner_slot_id BETWEEN 1 AND 5),
  base_item_id TEXT NOT NULL,
  partner_item_id TEXT NOT NULL,
  pair_count INTEGER NOT NULL DEFAULT 0,
  rank INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 10),
  PRIMARY KEY (version, base_slot_id, partner_slot_id, base_item_id, rank)
);

CREATE INDEX idx_pairs_lookup ON pairs(version, base_slot_id, partner_slot_id, base_item_id);
