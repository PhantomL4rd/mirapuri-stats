import { type ClassValue, clsx } from 'clsx';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { twMerge } from 'tailwind-merge';

dayjs.extend(isoWeek);

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 次回データ更新予定日を計算（ISO週番号が3の倍数の週）
 *
 * @param dataTo 現在の統計期間の終了日
 * @returns 次回更新予定日（YYYY-MM-DD形式）、計算不可の場合は null
 */
export function getNextUpdateDate(dataTo: string | null): string | null {
  if (!dataTo) return null;

  const endDate = dayjs(dataTo);
  if (!endDate.isValid()) return null;

  const currentWeek = endDate.isoWeek();
  // 次の3の倍数の週
  const nextUpdateWeek = Math.ceil((currentWeek + 1) / 3) * 3;

  let year = endDate.year();
  let targetWeek = nextUpdateWeek;

  // 年をまたぐ場合の処理（ISO週は最大52または53週）
  const maxWeek = dayjs(`${year}-12-31`).isoWeek();
  if (targetWeek > maxWeek) {
    targetWeek = 3; // 翌年の第3週
    year += 1;
  }

  // 指定したISO週の土曜日を取得
  const nextUpdate = dayjs().year(year).isoWeek(targetWeek).isoWeekday(6);

  return nextUpdate.format('YYYY-MM-DD');
}
