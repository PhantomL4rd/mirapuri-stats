import type { SlotPair } from '@mirapuri/shared';

/**
 * CLI オプション
 */
export interface SyncOptions {
  itemsOnly: boolean;
  statsOnly: boolean;
  dryRun: boolean;
}

/**
 * 同期結果
 */
export interface SyncResult {
  itemsInserted: number;
  itemsSkipped: number;
  usageUpserted: number;
  pairsUpserted: number;
  errors: string[];
}

/**
 * 進捗情報
 */
export interface SyncProgress {
  phase: 'items' | 'usage' | 'pairs';
  processed: number;
  total: number;
  errors: number;
}

/**
 * 抽出されたアイテム情報
 */
export interface ExtractedItem {
  id: string;
  name: string;
  slotId: number;
}

/**
 * 集計された使用回数
 */
export interface AggregatedUsage {
  itemId: string;
  usageCount: number;
}

/**
 * 集計されたペア組み合わせ
 */
export interface AggregatedPair {
  slotPair: SlotPair;
  itemIdA: string;
  itemIdB: string;
  pairCount: number;
  rank: number;
}

/**
 * Worker Client 設定
 */
export interface WorkerClientConfig {
  baseUrl: string;
  authToken: string;
  retryCount?: number;
  chunkSizes?: {
    items?: number;
    usage?: number;
    pairs?: number;
  };
}

/**
 * Worker API レスポンス（共通）
 */
export interface WorkerResponse {
  success: boolean;
  inserted?: number;
  skipped?: number;
  upserted?: number;
}
