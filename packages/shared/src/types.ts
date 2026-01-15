/**
 * ミラプリ対象部位
 * 頭・胴・手・脚・足の5部位のみ
 */
export type GlamourSlot = 'head' | 'body' | 'hands' | 'legs' | 'feet';

/**
 * 日本語部位名からスロット名へのマッピング
 */
export const SLOT_MAPPING: Record<string, GlamourSlot> = {
  頭防具: 'head',
  胴防具: 'body',
  手防具: 'hands',
  脚防具: 'legs',
  足防具: 'feet',
} as const;

/**
 * 対象部位の一覧
 */
export const TARGET_SLOTS: GlamourSlot[] = ['head', 'body', 'hands', 'legs', 'feet'];

/**
 * パーサーが抽出するミラプリデータ
 */
export interface GlamourData {
  /** 部位 */
  slot: GlamourSlot;
  /** Lodestone装備ID（URLから抽出、null = ミラプリなし） */
  itemId: string | null;
}

/**
 * スクレイパーの実行結果
 */
export interface ScraperResult {
  /** 成功フラグ */
  success: boolean;
  /** キャラクターID */
  characterId: string;
  /** 保存件数 */
  savedCount: number;
  /** エラー一覧 */
  errors: ScraperError[];
}

/**
 * スクレイパーエラー
 */
export interface ScraperError {
  /** エラー種別 */
  type: 'HTTP_ERROR' | 'PARSE_ERROR' | 'DB_ERROR';
  /** エラーメッセージ */
  message: string;
  /** 追加情報 */
  details?: Record<string, unknown>;
}

/**
 * HTTP取得結果
 */
export interface HTTPResult {
  /** 成功フラグ */
  success: boolean;
  /** HTML文字列 */
  html?: string;
  /** HTTPステータスコード */
  statusCode: number;
  /** エラーメッセージ */
  error?: string;
}

/**
 * リポジトリ保存結果
 */
export interface RepositoryResult {
  /** 成功フラグ */
  success: boolean;
  /** INSERT件数 */
  insertedCount: number;
  /** エラーメッセージ */
  error?: string;
}

/**
 * ペア組み合わせの種類
 * 胴を中心とした4パターンのみ
 */
export type SlotPair = 'head-body' | 'body-hands' | 'body-legs' | 'legs-feet';

/**
 * 有効な SlotPair 値の配列
 */
export const SLOT_PAIRS: readonly SlotPair[] = [
  'head-body',
  'body-hands',
  'body-legs',
  'legs-feet',
] as const;

/**
 * SlotPair ごとの slot_id マッピング
 * item_id_a は常に小さい slot_id を持つ側
 */
export const SLOT_PAIR_CONFIG: Record<SlotPair, { slotA: number; slotB: number }> = {
  'head-body': { slotA: 1, slotB: 2 }, // head=1, body=2
  'body-hands': { slotA: 2, slotB: 3 }, // body=2, hands=3
  'body-legs': { slotA: 2, slotB: 4 }, // body=2, legs=4
  'legs-feet': { slotA: 4, slotB: 5 }, // legs=4, feet=5
} as const;
