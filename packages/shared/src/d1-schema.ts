import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * アイテムマスタテーブル
 * Lodestone から取得した装備情報
 */
export const items = sqliteTable(
  'items',
  {
    /** Lodestone 装備ID（主キー） */
    id: text('id').primaryKey(),
    /** アイテム名 */
    name: text('name').notNull(),
    /** 部位ID（1:head, 2:body, 3:hands, 4:legs, 5:feet） */
    slotId: integer('slot_id').notNull(),
  },
  (table) => [index('idx_items_slot_id').on(table.slotId)],
);

/** SELECT時の型 */
export type Item = typeof items.$inferSelect;

/** INSERT時の型 */
export type NewItem = typeof items.$inferInsert;

/**
 * アイテム使用回数テーブル
 * 各アイテムの使用回数を集計
 */
export const itemUsage = sqliteTable('item_usage', {
  /** アイテムID（主キー、items.id への外部キー） */
  itemId: text('item_id')
    .primaryKey()
    .references(() => items.id),
  /** 使用回数 */
  usageCount: integer('usage_count').notNull().default(0),
});

/** SELECT時の型 */
export type ItemUsage = typeof itemUsage.$inferSelect;

/** INSERT時の型 */
export type NewItemUsage = typeof itemUsage.$inferInsert;

/**
 * ペア組み合わせテーブル
 * 各アイテムの組み合わせ上位10件を保存
 */
export const itemPairs = sqliteTable(
  'item_pairs',
  {
    /** ペア種類（'head-body', 'body-hands', 'body-legs', 'legs-feet'） */
    slotPair: text('slot_pair').notNull(),
    /** アイテムA（小さい slot_id 側） */
    itemIdA: text('item_id_a')
      .notNull()
      .references(() => items.id),
    /** アイテムB（大きい slot_id 側） */
    itemIdB: text('item_id_b')
      .notNull()
      .references(() => items.id),
    /** ペア出現回数 */
    pairCount: integer('pair_count').notNull().default(0),
    /** ランク（1-10） */
    rank: integer('rank').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.slotPair, table.itemIdA, table.rank] }),
    index('idx_item_pairs_lookup').on(table.slotPair, table.itemIdA, table.rank),
  ],
);

/** SELECT時の型 */
export type ItemPair = typeof itemPairs.$inferSelect;

/** INSERT時の型 */
export type NewItemPair = typeof itemPairs.$inferInsert;
