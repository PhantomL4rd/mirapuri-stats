-- アイテムマスタテーブル
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slot_id INTEGER NOT NULL CHECK (slot_id BETWEEN 1 AND 5)
);

CREATE INDEX IF NOT EXISTS idx_items_slot_id ON items(slot_id);

-- アイテム使用回数テーブル
CREATE TABLE IF NOT EXISTS item_usage (
  item_id TEXT PRIMARY KEY REFERENCES items(id),
  usage_count INTEGER NOT NULL DEFAULT 0
);

-- ペア組み合わせテーブル
CREATE TABLE IF NOT EXISTS item_pairs (
  slot_pair TEXT NOT NULL CHECK (slot_pair IN ('head-body', 'body-hands', 'body-legs', 'legs-feet')),
  item_id_a TEXT NOT NULL REFERENCES items(id),
  item_id_b TEXT NOT NULL REFERENCES items(id),
  pair_count INTEGER NOT NULL DEFAULT 0,
  rank INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 10),
  PRIMARY KEY (slot_pair, item_id_a, rank)
);

CREATE INDEX IF NOT EXISTS idx_item_pairs_lookup ON item_pairs(slot_pair, item_id_a, rank);
