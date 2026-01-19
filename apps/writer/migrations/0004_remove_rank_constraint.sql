-- pairs テーブルの rank CHECK 制約を削除
-- SQLite は ALTER TABLE での制約削除をサポートしないため、テーブル再作成で対応

DROP TABLE IF EXISTS pairs;

CREATE TABLE pairs (
  version TEXT NOT NULL,
  base_slot_id INTEGER NOT NULL CHECK (base_slot_id BETWEEN 1 AND 5),
  partner_slot_id INTEGER NOT NULL CHECK (partner_slot_id BETWEEN 1 AND 5),
  base_item_id TEXT NOT NULL,
  partner_item_id TEXT NOT NULL,
  pair_count INTEGER NOT NULL DEFAULT 0,
  rank INTEGER NOT NULL,
  PRIMARY KEY (version, base_slot_id, partner_slot_id, base_item_id, rank)
);

CREATE INDEX idx_pairs_lookup ON pairs(version, base_slot_id, partner_slot_id, base_item_id);
