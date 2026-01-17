/**
 * Cloudflare Worker 環境変数
 */
export interface Env {
  DB: D1Database;
  AUTH_TOKEN: string;
}

/**
 * POST /api/items リクエスト
 */
export interface ItemsRequest {
  items: Array<{
    id: string;
    name: string;
    slotId: number;
  }>;
}

/**
 * POST /api/items レスポンス
 */
export interface ItemsResponse {
  success: boolean;
  inserted: number;
  skipped: number;
}

/**
 * POST /api/usage リクエスト
 * Query: ?version=xxx (必須)
 */
export interface UsageRequest {
  usage: Array<{
    slotId: number;
    itemId: string;
    usageCount: number;
  }>;
}

/**
 * POST /api/usage レスポンス
 */
export interface UsageResponse {
  success: boolean;
  inserted: number;
}

/**
 * POST /api/pairs リクエスト（双方向対応）
 * Query: ?version=xxx (必須)
 */
export interface PairsRequest {
  pairs: Array<{
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
  }>;
}

/**
 * POST /api/pairs レスポンス
 */
export interface PairsResponse {
  success: boolean;
  inserted: number;
}

/**
 * POST /api/sync/start レスポンス
 */
export interface SyncStartResponse {
  success: boolean;
  version: string;
}

/**
 * POST /api/sync/commit リクエスト
 */
export interface SyncCommitRequest {
  version: string;
  /** データ取得期間（最も古い fetched_at）ISO8601 */
  dataFrom?: string;
  /** データ取得期間（最も新しい fetched_at）ISO8601 */
  dataTo?: string;
}

/**
 * POST /api/sync/commit レスポンス
 */
export interface SyncCommitResponse {
  success: boolean;
  previousVersion: string;
  newVersion: string;
}

/**
 * POST /api/sync/abort リクエスト
 */
export interface SyncAbortRequest {
  version: string;
}

/**
 * POST /api/sync/abort レスポンス
 */
export interface SyncAbortResponse {
  success: boolean;
  deletedVersion: string;
}
