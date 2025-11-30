/**
 * 智能地格式化时间戳，根据时间远近显示不同精度的信息
 * - 1 分钟内: "刚刚"
 * - 1 小时内: "xx 分钟前"
 * - 今天内: "HH:mm" (例如 "14:30")
 * - 昨天: "昨天 HH:mm" (例如 "昨天 09:15")
 * - 今年内: "MM-DD HH:mm" (例如 "05-21 10:00")
 * - 更早: "YYYY-MM-DD HH:mm" (例如 "2023-10-26 18:00")
 * @param timestamp 时间戳 (ISO 8601 字符串或 Date 对象)
 * @param now 当前时间，用于测试
 * @returns 格式化后的字符串
 */
export function formatRelativeTime(timestamp: string | Date, now: Date = new Date()): string {
  const date = new Date(timestamp);

  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth();
  const nowDate = now.getDate();

  const dateYear = date.getFullYear();
  const dateMonth = date.getMonth();
  const dateDate = date.getDate();

  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  // 1 分钟内
  if (diffMins < 1) {
    return "刚刚";
  }

  // 1 小时内
  if (diffMins < 60) {
    return `${diffMins} 分钟前`;
  }

  const timeStr = date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  // 今天
  if (nowYear === dateYear && nowMonth === dateMonth && nowDate === dateDate) {
    return timeStr;
  }

  // 昨天
  const yesterday = new Date(now);
  yesterday.setDate(nowDate - 1);
  if (
    yesterday.getFullYear() === dateYear &&
    yesterday.getMonth() === dateMonth &&
    yesterday.getDate() === dateDate
  ) {
    return `昨天 ${timeStr}`;
  }

  // 今年内
  if (nowYear === dateYear) {
    return `${(dateMonth + 1).toString().padStart(2, '0')}-${dateDate.toString().padStart(2, '0')} ${timeStr}`;
  }

  // 更早
  return `${dateYear}-${(dateMonth + 1).toString().padStart(2, '0')}-${dateDate.toString().padStart(2, '0')} ${timeStr}`;
}

/**
 * 获取本地时区的 ISO 格式字符串 (YYYY-MM-DDTHH:mm:ss.sss)
 *
 * 与 `new Date().toISOString()` 的区别在于，后者总是返回 UTC 时间。
 * 此函数返回的日期和时间部分反映的是运行环境的本地时间。
 *
 * @param date 可选的 Date 对象，默认为当前时间
 * @returns 本地时区的 ISO 格式字符串
 */
export function getLocalISOString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  const milliseconds = date.getMilliseconds().toString().padStart(3, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}`;
}