import type { APIRoute } from 'astro';

const SITE_URL = 'https://mirapri-insight.pl4rd.com';

export const GET: APIRoute = () => {
  const robotsTxt = `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;

  return new Response(robotsTxt, {
    headers: {
      'Content-Type': 'text/plain',
    },
  });
};
