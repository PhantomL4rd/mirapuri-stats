import type { APIRoute } from 'astro';
import { getItemInfo, getSimilarItems } from '../../lib/queries';

const MAX_LIMIT = 20;
const DEFAULT_LIMIT = 3;

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const itemId = url.searchParams.get('itemId');
  const limitParam = url.searchParams.get('limit');
  const version = url.searchParams.get('version') ?? undefined;

  // itemId は必須
  if (!itemId) {
    return new Response(
      JSON.stringify({ error: 'itemId is required', items: [], targetItem: null }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  // limit のバリデーション
  let limit = DEFAULT_LIMIT;
  if (limitParam) {
    const parsed = Number.parseInt(limitParam, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      limit = Math.min(parsed, MAX_LIMIT);
    }
  }

  const db = locals.runtime?.env?.DB;

  if (!db) {
    return new Response(
      JSON.stringify({ error: 'Database not available', items: [], targetItem: null }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  try {
    // ターゲットアイテム情報を取得
    const targetItem = await getItemInfo(db, itemId);

    // アイテムが存在しない場合は空配列を返す（エラーではない）
    if (!targetItem) {
      return new Response(JSON.stringify({ items: [], targetItem: null }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const items = await getSimilarItems(db, itemId, limit, version);

    return new Response(JSON.stringify({ items, targetItem }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('Similar items error:', e);
    return new Response(
      JSON.stringify({ error: 'Internal server error', items: [], targetItem: null }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
};
