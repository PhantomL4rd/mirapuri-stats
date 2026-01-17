import { meta } from '@mirapuri/shared/d1-schema';
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

  await vm.commitSync(body.version);
  await vm.cleanupOldVersions(previousVersion);

  // データ取得期間を meta に保存
  if (body.dataFrom) {
    await db
      .insert(meta)
      .values({ key: 'data_from', value: body.dataFrom })
      .onConflictDoUpdate({
        target: meta.key,
        set: { value: body.dataFrom },
      });
  }
  if (body.dataTo) {
    await db
      .insert(meta)
      .values({ key: 'data_to', value: body.dataTo })
      .onConflictDoUpdate({
        target: meta.key,
        set: { value: body.dataTo },
      });
  }

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
