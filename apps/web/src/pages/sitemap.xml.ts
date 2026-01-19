import type { APIRoute } from 'astro';

const SITE_URL = 'https://mirapri-insight.pl4rd.com';

const staticPages = ['/', '/faq', '/readme'];

export const GET: APIRoute = async ({ locals }) => {
  const db = locals.runtime.env.DB;

  // 全アイテムIDを取得
  const result = await db.prepare('SELECT id FROM items').all<{ id: string }>();
  const itemIds = result.results?.map((r) => r.id) ?? [];

  const urls = [
    // 静的ページ
    ...staticPages.map((path) => ({
      loc: `${SITE_URL}${path}`,
      priority: path === '/' ? '1.0' : '0.8',
    })),
    // アイテムページ
    ...itemIds.map((id) => ({
      loc: `${SITE_URL}/item/${id}`,
      priority: '0.6',
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url>
    <loc>${url.loc}</loc>
    <priority>${url.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
