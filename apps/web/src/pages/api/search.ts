import type { APIRoute } from 'astro';
import { searchItems, type SearchResultItem } from '../../lib/queries';

// モックデータ（ローカル開発用）
const MOCK_ITEMS: SearchResultItem[] = [
  { itemId: '3b53975b6e5', itemName: 'パンクスカラーコート', slotId: 2 },
  { itemId: '9b3f1d9e9db', itemName: 'ヘミスフィアコート', slotId: 2 },
  { itemId: 'f60f92fb75c', itemName: 'クラフターワークシャツ', slotId: 2 },
  { itemId: 'a1b2c3d4e5f', itemName: 'アラガンチュニック', slotId: 2 },
  { itemId: 'b2c3d4e5f6a', itemName: 'ヒーラールーブ', slotId: 2 },
  { itemId: 'c3d4e5f6a7b', itemName: 'タンクプレート', slotId: 2 },
  { itemId: 'd4e5f6a7b8c', itemName: 'キャスターローブ', slotId: 2 },
  { itemId: 'e5f6a7b8c9d', itemName: 'レンジャーベスト', slotId: 2 },
  { itemId: 'f6a7b8c9d0e', itemName: 'サムライドウギ', slotId: 2 },
  { itemId: 'a7b8c9d0e1f', itemName: 'パラディンメイル', slotId: 2 },
  { itemId: '1a2b3c4d5e6', itemName: 'ナイトヘルム', slotId: 1 },
  { itemId: '2b3c4d5e6f7', itemName: 'ウィザードハット', slotId: 1 },
  { itemId: '3c4d5e6f7a8', itemName: 'アイアングローブ', slotId: 3 },
  { itemId: '4d5e6f7a8b9', itemName: 'シルクグローブ', slotId: 3 },
  { itemId: '5e6f7a8b9c0', itemName: 'レザーパンツ', slotId: 4 },
  { itemId: '6f7a8b9c0d1', itemName: 'プレートレギンス', slotId: 4 },
  { itemId: '7a8b9c0d1e2', itemName: 'レザーブーツ', slotId: 5 },
  { itemId: '8b9c0d1e2f3', itemName: 'プレートサバトン', slotId: 5 },
];

function searchMock(query: string): SearchResultItem[] {
  const lower = query.toLowerCase();
  return MOCK_ITEMS.filter((item) => item.itemName.toLowerCase().includes(lower)).slice(0, 10);
}

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const query = url.searchParams.get('q') ?? '';

  if (query.length < 1) {
    return new Response(JSON.stringify([]), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const db = locals.runtime?.env?.DB;

  // DBが利用できない場合はモックを返す
  if (!db) {
    const results = searchMock(query);
    return new Response(JSON.stringify(results), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const results = await searchItems(db, query, 10);
    return new Response(JSON.stringify(results), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('Search error:', e);
    // エラー時もモックにフォールバック
    const results = searchMock(query);
    return new Response(JSON.stringify(results), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
