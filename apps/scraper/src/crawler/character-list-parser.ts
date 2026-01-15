import * as cheerio from 'cheerio';

/**
 * キャラクター情報
 */
export interface CharacterInfo {
  characterId: string;
  level: number;
}

/**
 * キャラクター一覧ページの解析結果
 */
export interface CharacterListResult {
  characters: CharacterInfo[];
  hasNextPage: boolean;
}

/**
 * Lodestone検索結果ページをパースしてキャラクター情報を抽出する
 */
export function parseCharacterListPage(html: string): CharacterListResult {
  const $ = cheerio.load(html);
  const characters: CharacterInfo[] = [];

  // キャラクターエントリーを取得
  $('.entry').each((_, entry) => {
    const $entry = $(entry);
    const link = $entry.find('a.entry__link').attr('href');

    // キャラクターIDを抽出（/lodestone/character/{id}/形式）
    const characterIdMatch = link?.match(/\/lodestone\/character\/(\d+)\//);
    if (!characterIdMatch?.[1]) {
      return; // スキップ
    }
    const characterId = characterIdMatch[1];

    // レベルを抽出（entry__chara_info内の最初のliのspan）
    const levelText = $entry.find('.entry__chara_info li:first-child span').text().trim();
    const level = Number.parseInt(levelText, 10);
    if (Number.isNaN(level)) {
      return; // スキップ
    }

    characters.push({ characterId, level });
  });

  // 次のページがあるかを判定
  // btn__pager__nextクラスのリンクがあれば次のページがある
  const hasNextPage = $('.btn__pager__next').length > 0;

  return { characters, hasNextPage };
}
