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
  /** 装備名（HTMLから抽出） */
  itemName: string | null;
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
