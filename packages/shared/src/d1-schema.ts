import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * メタデータテーブル
 * active_version など、システム設定を key-value で管理
 */
export const meta = sqliteTable('meta', {
  /** 設定キー */
  key: text('key').primaryKey(),
  /** 設定値 */
  value: text('value').notNull(),
});

/** SELECT時の型 */
export type Meta = typeof meta.$inferSelect;

/** INSERT時の型 */
export type NewMeta = typeof meta.$inferInsert;

/**
 * アイテムマスタテーブル
 * Lodestone から取得した装備情報
 * バージョン管理対象外（UPSERT で更新）
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
 * 使用回数テーブル
 * 各アイテムの使用回数を集計（バージョン管理対象）
 */
export const usage = sqliteTable(
  'usage',
  {
    /** バージョン識別子 */
    version: text('version').notNull(),
    /** 部位ID */
    slotId: integer('slot_id').notNull(),
    /** アイテムID */
    itemId: text('item_id').notNull(),
    /** 使用回数 */
    usageCount: integer('usage_count').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.version, table.slotId, table.itemId] }),
    index('idx_usage_version_slot').on(table.version, table.slotId),
  ],
);

/** SELECT時の型 */
export type Usage = typeof usage.$inferSelect;

/** INSERT時の型 */
export type NewUsage = typeof usage.$inferInsert;

/**
 * ペア組み合わせテーブル（双方向対応）
 * 各アイテムの組み合わせ上位10件を保存（バージョン管理対象）
 * base_item_id を主語として、partner_item_id との組み合わせを保存
 */
export const pairs = sqliteTable(
  'pairs',
  {
    /** バージョン識別子 */
    version: text('version').notNull(),
    /** 主語側スロット (1:head, 2:body, 3:hands, 4:legs, 5:feet) */
    baseSlotId: integer('base_slot_id').notNull(),
    /** 相方側スロット (1:head, 2:body, 3:hands, 4:legs, 5:feet) */
    partnerSlotId: integer('partner_slot_id').notNull(),
    /** 主語アイテム */
    baseItemId: text('base_item_id').notNull(),
    /** 相方アイテム */
    partnerItemId: text('partner_item_id').notNull(),
    /** ペア出現回数 */
    pairCount: integer('pair_count').notNull(),
    /** ランク（1-10） */
    rank: integer('rank').notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.version, table.baseSlotId, table.partnerSlotId, table.baseItemId, table.rank],
    }),
    index('idx_pairs_lookup').on(
      table.version,
      table.baseSlotId,
      table.partnerSlotId,
      table.baseItemId,
    ),
  ],
);

/** SELECT時の型 */
export type Pairs = typeof pairs.$inferSelect;

/** INSERT時の型 */
export type NewPairs = typeof pairs.$inferInsert;

/**
 * Sync バージョン管理テーブル
 * 各バージョンの freshness（データ期間）を保存
 */
export const syncVersions = sqliteTable('sync_versions', {
  /** バージョン識別子（UUID） */
  version: text('version').primaryKey(),
  /** データ取得期間（開始）ISO8601 */
  dataFrom: text('data_from'),
  /** データ取得期間（終了）ISO8601 */
  dataTo: text('data_to'),
  /** Sync完了日時 ISO8601 */
  syncedAt: text('synced_at').notNull(),
});

/** SELECT時の型 */
export type SyncVersion = typeof syncVersions.$inferSelect;

/** INSERT時の型 */
export type NewSyncVersion = typeof syncVersions.$inferInsert;
