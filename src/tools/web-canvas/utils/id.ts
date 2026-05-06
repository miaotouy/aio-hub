import { nanoid } from "nanoid";
import { format } from "date-fns";

/**
 * 生成符合新规范的画布项目 ID
 * 格式: cp_{yyyyMMdd}_{short_id}
 */
export function generateCanvasId(): string {
  const dateStr = format(new Date(), "yyyyMMdd");
  const shortId = nanoid(6);
  return `cp_${dateStr}_${shortId}`;
}

/**
 * 判断是否为有效的画布项目 ID
 */
export function isValidCanvasId(id: string): boolean {
  return /^cp_\d{8}_[A-Za-z0-9_-]{6}$/.test(id);
}
