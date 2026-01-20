import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import type {
  Env,
  SyncAbortRequest,
  SyncAbortResponse,
  SyncCommitRequest,
  SyncCommitResponse,
  SyncStartResponse,
} from '../types.js';
import { createVersionManager } from '../version-manager.js';

export const syncRoute = new Hono<{ Bindings: Env }>();

/**
 * POST /api/sync/start
 * 新しい sync セッションを開始し、バージョンを生成
 */
syncRoute.post('/start', async (c) => {
  const db = drizzle(c.env.DB);
  const vm = createVersionManager({ db });

  const version = await vm.startSync();

  const response: SyncStartResponse = {
    success: true,
    version,
  };

  return c.json(response);
});

/**
 * POST /api/sync/commit
 * sync を完了し、active_version を切り替え
 */
syncRoute.post('/commit', async (c) => {
  const body = await c.req.json<SyncCommitRequest>();

  if (!body.version || typeof body.version !== 'string') {
    return c.json({ error: 'version is required' }, 400);
  }

  const db = drizzle(c.env.DB);
  const vm = createVersionManager({ db });

  const previousVersion = await vm.getActiveVersion();

  // sync_versions テーブルに freshness 情報と共に保存
  await vm.commitSync({
    version: body.version,
    dataFrom: body.dataFrom,
    dataTo: body.dataTo,
  });
  await vm.cleanupOldVersions();

  const response: SyncCommitResponse = {
    success: true,
    previousVersion,
    newVersion: body.version,
  };

  return c.json(response);
});

/**
 * POST /api/sync/abort
 * sync を中断し、部分データを削除
 */
syncRoute.post('/abort', async (c) => {
  const body = await c.req.json<SyncAbortRequest>();

  if (!body.version || typeof body.version !== 'string') {
    return c.json({ error: 'version is required' }, 400);
  }

  const db = drizzle(c.env.DB);
  const vm = createVersionManager({ db });

  await vm.abortSync(body.version);

  const response: SyncAbortResponse = {
    success: true,
    deletedVersion: body.version,
  };

  return c.json(response);
});
