import type { GlamourData, RepositoryResult } from '@mirapuri/shared';
import type { Database } from '@mirapuri/shared/db';
import { charactersGlamour, SLOT_IDS } from '@mirapuri/shared/schema';
import { eq } from 'drizzle-orm';
import { logger } from './utils/logger.js';

/**
 * ミラプリデータリポジトリのインターフェース
 */
export interface GlamourRepository {
  /**
   * ミラプリデータをデータベースに保存
   * @param characterId LodestoneキャラクターID
   * @param glamourData ミラプリデータ配列
   * @returns 保存結果
   */
  saveGlamourData(characterId: string, glamourData: GlamourData[]): Promise<RepositoryResult>;

  /**
   * キャラクターが既にDBに存在するかチェック
   * @param characterId LodestoneキャラクターID
   * @returns 存在すればtrue
   */
  characterExists(characterId: string): Promise<boolean>;
}

/**
 * リポジトリを作成
 * @param db Drizzleデータベースインスタンス
 * @returns GlamourRepositoryインスタンス
 */
export function createRepository(db: Database): GlamourRepository {
  return createGlamourRepository(db);
}

/**
 * リポジトリを作成（エイリアス）
 * @param db Drizzleデータベースインスタンス
 * @returns GlamourRepositoryインスタンス
 */
export function createGlamourRepository(db: Database): GlamourRepository {
  return {
    async saveGlamourData(
      characterId: string,
      glamourData: GlamourData[],
    ): Promise<RepositoryResult> {
      // itemIdがnullのデータをフィルタリング
      const validData = glamourData.filter((d) => d.itemId !== null);

      // 保存するデータがない場合は早期リターン
      if (validData.length === 0) {
        logger.info('保存するデータがありません', { characterId });
        return { success: true, insertedCount: 0 };
      }

      try {
        // GlamourData を NewCharacterGlamour 形式に変換
        const records = validData.map((d) => ({
          characterId,
          slotId: SLOT_IDS[d.slot],
          itemId: d.itemId as string, // nullはフィルタリング済み
        }));

        await db.insert(charactersGlamour).values(records);

        const insertedCount = records.length;

        logger.info('ミラプリデータを保存しました', {
          characterId,
          insertedCount,
        });

        return { success: true, insertedCount };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown database error';
        logger.error('データベース保存エラー', {
          characterId,
          error: message,
        });
        return { success: false, insertedCount: 0, error: message };
      }
    },

    async characterExists(characterId: string): Promise<boolean> {
      try {
        const rows = await db
          .select({ id: charactersGlamour.id })
          .from(charactersGlamour)
          .where(eq(charactersGlamour.characterId, characterId))
          .limit(1);

        return rows.length > 0;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown database error';
        logger.error('キャラクター存在チェックエラー', { characterId, error: message });
        return false;
      }
    },
  };
}
