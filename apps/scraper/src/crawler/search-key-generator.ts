/**
 * 検索キージェネレーター
 * Lodestone検索の全組み合わせキーを生成
 */

/** データセンター定義 */
export const DATA_CENTERS = {
  Elemental: ['Aegis', 'Atomos', 'Carbuncle', 'Garuda', 'Gungnir', 'Kujata', 'Tonberry', 'Typhon'],
  Gaia: ['Alexander', 'Bahamut', 'Durandal', 'Fenrir', 'Ifrit', 'Ridill', 'Tiamat', 'Ultima'],
  Mana: ['Anima', 'Asura', 'Chocobo', 'Hades', 'Ixion', 'Masamune', 'Pandaemonium', 'Titan'],
  Meteor: ['Belias', 'Mandragora', 'Ramuh', 'Shinryu', 'Unicorn', 'Valefor', 'Yojimbo', 'Zeromus'],
} as const;

export type DataCenterName = keyof typeof DATA_CENTERS;
export type WorldName = (typeof DATA_CENTERS)[DataCenterName][number];

/** 全ワールド一覧（日本DC） */
export const ALL_JP_WORLDS = [
  ...DATA_CENTERS.Elemental,
  ...DATA_CENTERS.Gaia,
  ...DATA_CENTERS.Mana,
  ...DATA_CENTERS.Meteor,
] as const;

/**
 * 全ジョブID（クラス除外、ジョブのみ）
 * 合計: 32ジョブ
 */
export const CLASSJOBS = [
  // タンク (4)
  19,
  21,
  32,
  37, // ナイト, 戦士, 暗黒騎士, ガンブレイカー
  // ヒーラー (4)
  24,
  28,
  33,
  40, // 白魔道士, 学者, 占星術師, 賢者
  // 近接DPS (6)
  20,
  22,
  30,
  34,
  39,
  41, // モンク, 竜騎士, 忍者, 侍, リーパー, ヴァイパー
  // 遠隔物理DPS (3)
  23,
  31,
  38, // 吟遊詩人, 機工士, 踊り子
  // 遠隔魔法DPS (4)
  25,
  27,
  35,
  42, // 黒魔道士, 召喚士, 赤魔道士, ピクトマンサー
  // クラフター (8)
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15, // 木工〜調理
  // ギャザラー (3)
  16,
  17,
  18, // 採掘, 園芸, 漁師
] as const;

/**
 * 種族（部族単位）
 * 合計: 18部族
 */
export const RACE_TRIBES = [
  'tribe_1',
  'tribe_2', // ヒューラン
  'tribe_3',
  'tribe_4', // ミコッテ
  'tribe_5',
  'tribe_6', // ララフェル
  'tribe_7',
  'tribe_8', // ルガディン
  'tribe_9',
  'tribe_10', // エレゼン
  'tribe_11',
  'tribe_12', // アウラ
  'tribe_13',
  'tribe_14', // ロスガル
  'tribe_15',
  'tribe_16', // ヴィエラ
] as const;

/** グランドカンパニー */
export const GCIDS = [1, 2, 3] as const;

/** 検索キー */
export interface SearchKey {
  index: number;
  worldname: string;
  classjob: number;
  raceTribe: string;
  gcid: number;
}

/** 検索キージェネレーターインターフェース */
export interface SearchKeyGenerator {
  /** 全検索キーを生成 */
  generateAll(): SearchKey[];
  /** 総キー数を取得 */
  getTotalCount(): number;
}

/**
 * 検索キーからURLを構築
 */
export function buildSearchUrl(key: SearchKey, page?: number): string {
  const baseUrl = 'https://jp.finalfantasyxiv.com/lodestone/character/';
  const params = new URLSearchParams({
    q: '',
    worldname: key.worldname,
    classjob: String(key.classjob),
    race_tribe: key.raceTribe,
    gcid: String(key.gcid),
    order: '7', // レベル降順
  });
  if (page !== undefined) {
    params.set('page', String(page));
  }
  return `${baseUrl}?${params.toString()}`;
}

/** 検索キージェネレーターの設定 */
export interface SearchKeyGeneratorConfig {
  /** 対象ワールド（worlds または dataCenter のどちらかを指定） */
  worlds?: readonly string[];
  /** 対象データセンター（指定すると DC 内の全ワールドが対象） */
  dataCenter?: DataCenterName;
}

/**
 * 設定からワールド一覧を取得
 */
export function resolveWorlds(config: SearchKeyGeneratorConfig): readonly string[] {
  if (config.dataCenter) {
    return DATA_CENTERS[config.dataCenter];
  }
  return config.worlds ?? ['Tiamat'];
}

/**
 * 検索キージェネレーターを作成
 */
export function createSearchKeyGenerator(
  config: SearchKeyGeneratorConfig = {},
): SearchKeyGenerator {
  const worlds = resolveWorlds(config);

  return {
    generateAll(): SearchKey[] {
      const keys: SearchKey[] = [];
      let index = 0;

      for (const worldname of worlds) {
        for (const classjob of CLASSJOBS) {
          for (const raceTribe of RACE_TRIBES) {
            for (const gcid of GCIDS) {
              keys.push({
                index,
                worldname,
                classjob,
                raceTribe,
                gcid,
              });
              index++;
            }
          }
        }
      }

      return keys;
    },

    getTotalCount(): number {
      return worlds.length * CLASSJOBS.length * RACE_TRIBES.length * GCIDS.length;
    },
  };
}
