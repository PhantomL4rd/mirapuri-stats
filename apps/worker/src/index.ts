import { Hono } from 'hono';
import { authMiddleware } from './middleware/auth.js';
import { itemsRoute } from './routes/items.js';
import { pairsRoute } from './routes/pairs.js';
import { usageRoute } from './routes/usage.js';
import type { Env } from './types.js';

const app = new Hono<{ Bindings: Env }>();

// Health check (no auth)
app.get('/health', (c) => c.json({ status: 'ok' }));

// API routes (with auth)
const api = new Hono<{ Bindings: Env }>();
api.use('/*', authMiddleware);
api.route('/items', itemsRoute);
api.route('/usage', usageRoute);
api.route('/pairs', pairsRoute);

app.route('/api', api);

export default app;
