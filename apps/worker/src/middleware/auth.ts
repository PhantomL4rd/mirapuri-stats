import type { Context, Next } from 'hono';
import type { Env } from '../types.js';

/**
 * Bearer Token 認証ミドルウェア
 * Authorization ヘッダーから Bearer トークンを検証
 */
export async function authMiddleware(
  c: Context<{ Bindings: Env }>,
  next: Next,
): Promise<Response | undefined> {
  const authHeader = c.req.header('Authorization');

  if (!authHeader) {
    return c.json({ error: 'Authorization header required' }, 401);
  }

  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return c.json({ error: 'Invalid authorization format. Use: Bearer <token>' }, 401);
  }

  if (token !== c.env.AUTH_TOKEN) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  await next();
}
