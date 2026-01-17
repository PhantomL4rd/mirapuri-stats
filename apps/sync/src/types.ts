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
  usageInserted: number;
  pairsInserted: number;
  errors: string[];
}

/**
 * 進捗情報
 */
export interface SyncProgress {
  phase: 'items' | 'usage' | 'pairs' | 'cleanup';
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
  slotId: number;
  itemId: string;
  usageCount: number;
}

/**
 * 集計されたペア組み合わせ（双方向対応）
 */
export interface AggregatedPair {
  /** 主語側スロット (1-5) */
  baseSlotId: number;
  /** 相方側スロット (1-5) */
  partnerSlotId: number;
  /** 主語アイテム */
  baseItemId: string;
  /** 相方アイテム */
  partnerItemId: string;
  pairCount: number;
  rank: number;
}

/**
 * Writer Client 設定
 */
export interface WriterClientConfig {
  baseUrl: string;
  authToken: string;
  /** Cloudflare Access Client ID (オプション) */
  cfAccessClientId?: string;
  /** Cloudflare Access Client Secret (オプション) */
  cfAccessClientSecret?: string;
  retryCount?: number;
  chunkSizes?: {
    items?: number;
    usage?: number;
    pairs?: number;
  };
}

/**
 * Writer API レスポンス（共通）
 */
export interface WriterResponse {
  success: boolean;
  inserted?: number;
  skipped?: number;
  upserted?: number;
}
