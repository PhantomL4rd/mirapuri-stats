import type { GlamourData } from '@mirapuri/shared';
import { SLOT_MAPPING } from '@mirapuri/shared';
import * as cheerio from 'cheerio';

/**
 * URLから装備IDを抽出
 * @param url Lodestone装備URL（例: /lodestone/playguide/db/item/a4ea44d4e47/）
 * @returns 装備ID（例: a4ea44d4e47）
 */
function extractItemId(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/\/lodestone\/playguide\/db\/item\/([^/]+)/);
  return match?.[1] ?? null;
}

/**
 * HTMLからミラプリデータを抽出
 * @param html LodestoneキャラクターページのHTML
 * @returns 抽出したミラプリデータ配列
 */
export function parseGlamourData(html: string): GlamourData[] {
  const $ = cheerio.load(html);
  const results: GlamourData[] = [];

  // ミラプリセクションを検索
  $('.db-tooltip__item__mirage').each((_, element) => {
    const $mirage = $(element);

    // URLから装備IDを取得
    const itemUrl = $mirage.find('a').attr('href') ?? null;
    const itemId = extractItemId(itemUrl);

    // 装備名を取得（<p>タグ内のテキストノードのみ、<a>タグの「詳細」を除外）
    const $p = $mirage.find('p');
    const itemName = extractItemName($, $p);

    // 部位を取得（親要素の次にあるcategoryから）
    const $parent = $mirage.parent();
    const categoryText = $parent.find('.db-tooltip__item__category').text().trim();

    // 部位名をスロット名に変換
    const slot = SLOT_MAPPING[categoryText];

    // 対象部位のみ追加（itemIdがある場合のみ）
    if (slot && itemId) {
      results.push({
        slot,
        itemId,
        itemName,
      });
    }
  });

  return results;
}

/**
 * <p>タグから装備名を抽出（<a>タグのテキストを除外）
 */
function extractItemName(
  $: cheerio.CheerioAPI,
  $p: ReturnType<cheerio.CheerioAPI>,
): string | null {
  if ($p.length === 0) return null;

  // テキストノードのみを取得（子要素のテキストは除外）
  let name = '';
  $p.contents().each((_, node) => {
    if (node.type === 'text') {
      name += $(node).text();
    }
  });

  const trimmed = name.trim();
  return trimmed || null;
}
