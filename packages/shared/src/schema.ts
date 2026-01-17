import { sql } from 'drizzle-orm';
import {
  check,
  index,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * スロットID定義
 * 1: head, 2: body, 3: hands, 4: legs, 5: feet
 */
export const SLOT_IDS = {
  head: 1,
  body: 2,
  hands: 3,
  legs: 4,
  feet: 5,
} as const;

/**
 * ミラプリデータテーブル
 * キャラクターごとの装備情報を保存
 */
export const charactersGlamour = pgTable(
  'characters_glamour',
  {
    /** LodestoneキャラクターID（複合主キー） */
    characterId: varchar('character_id', { length: 20 }).notNull(),
    /** 部位ID（複合主キー: 1:head, 2:body, 3:hands, 4:legs, 5:feet） */
    slotId: smallint('slot_id').notNull(),
    /** Lodestone装備ID（URLは /lodestone/playguide/db/item/{itemId}/ で再構築） */
    itemId: varchar('item_id', { length: 20 }).notNull(),
    /** 取得日時 */
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // 複合主キー
    primaryKey({ columns: [table.characterId, table.slotId] }),
    // 複合インデックス: ペア集計クエリ用 (slot_id → character_id → item_id)
    index('idx_slot_character_item').on(table.slotId, table.characterId, table.itemId),
    // CHECK制約：1-5のみ許可
    check('slot_id_check', sql`${table.slotId} BETWEEN 1 AND 5`),
  ],
);

/** SELECT時の型 */
export type CharacterGlamour = typeof charactersGlamour.$inferSelect;

/** INSERT時の型 */
export type NewCharacterGlamour = typeof charactersGlamour.$inferInsert;

/**
 * クローラー進捗テーブル
 * 進捗情報をJSONBで保存
 */
export const crawlProgress = pgTable('crawl_progress', {
  /** クローラー名（主キー） */
  crawlerName: varchar('crawler_name', { length: 100 }).primaryKey(),
  /** 進捗データ（JSONB） */
  progress: jsonb('progress').notNull().$type<{
    /** シャッフル後の配列位置 */
    lastCompletedShuffledIndex: number;
    totalKeys: number;
    processedCharacters: number;
    seed: number;
    /** 終了理由（COMPLETED: 全キー完了, LIMIT_REACHED: 上限到達で終了） */
    exitReason?: 'COMPLETED' | 'LIMIT_REACHED';
  }>(),
  /** 更新日時 */
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** SELECT時の型 */
export type CrawlProgress = typeof crawlProgress.$inferSelect;

/** INSERT時の型 */
export type NewCrawlProgress = typeof crawlProgress.$inferInsert;

/**
 * アイテムキャッシュテーブル
 * キャラクターページから取得したアイテム情報をキャッシュ
 * D1 items テーブルへの同期元として使用
 */
export const itemsCache = pgTable(
  'items_cache',
  {
    /** Lodestone装備ID（主キー） */
    id: varchar('id', { length: 20 }).primaryKey(),
    /** アイテム名 */
    name: varchar('name', { length: 200 }).notNull(),
    /** 部位ID（1:head, 2:body, 3:hands, 4:legs, 5:feet） */
    slotId: smallint('slot_id').notNull(),
    /** 初回登録日時 */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_items_cache_slot_id').on(table.slotId),
    check('items_cache_slot_id_check', sql`${table.slotId} BETWEEN 1 AND 5`),
  ],
);

/** SELECT時の型 */
export type ItemCache = typeof itemsCache.$inferSelect;

/** INSERT時の型 */
export type NewItemCache = typeof itemsCache.$inferInsert;
