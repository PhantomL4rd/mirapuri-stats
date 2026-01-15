import type { SlotPair } from '@mirapuri/shared';

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
 */
export interface UsageRequest {
  usage: Array<{
    itemId: string;
    usageCount: number;
  }>;
}

/**
 * POST /api/usage レスポンス
 */
export interface UsageResponse {
  success: boolean;
  upserted: number;
}

/**
 * POST /api/pairs リクエスト
 */
export interface PairsRequest {
  pairs: Array<{
    slotPair: SlotPair;
    itemIdA: string;
    itemIdB: string;
    pairCount: number;
    rank: number;
  }>;
}

/**
 * POST /api/pairs レスポンス
 */
export interface PairsResponse {
  success: boolean;
  upserted: number;
}
