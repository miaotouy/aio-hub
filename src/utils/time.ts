import { useAppSettingsStore } from "@/stores/appSettingsStore";
import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

/**
 * 获取当前应用设置的时区
 * @returns 时区字符串，如 'Asia/Shanghai'
 */
export function getAppTimezone(): string {
  try {
    const appSettingsStore = useAppSettingsStore();
    const settings = appSettingsStore.settings;
    if (settings.timezone && settings.timezone !== "auto") {
      return settings.timezone;
    }
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    // 如果设置尚未加载，返回系统时区
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
}

/**
 * 将日期转换为指定时区的日期对象
 * 注意：返回的 Date 对象的内部时间戳不变，但可以用于格式化显示
 * @param date 原始日期
 * @param timezone 目标时区
 * @returns 用于显示的日期信息
 */
export function getDateInTimezone(
  date: Date,
  timezone?: string
): {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
} {
  const tz = timezone || getAppTimezone();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const getValue = (type: string) => {
    const part = parts.find((p) => p.type === type);
    return part ? parseInt(part.value, 10) : 0;
  };

  return {
    year: getValue("year"),
    month: getValue("month"),
    day: getValue("day"),
    hours: getValue("hour"),
    minutes: getValue("minute"),
    seconds: getValue("second"),
    milliseconds: date.getMilliseconds(), // 毫秒不受时区影响
  };
}

/**
 * 使用应用时区设置格式化日期时间
 * @param date 日期对象
 * @param options Intl.DateTimeFormat 选项
 * @param timezone 可选的时区覆盖
 * @returns 格式化后的字符串
 */
export function formatWithTimezone(date: Date, options: Intl.DateTimeFormatOptions = {}, timezone?: string): string {
  const tz = timezone || getAppTimezone();
  return new Intl.DateTimeFormat("zh-CN", {
    ...options,
    timeZone: tz,
  }).format(date);
}

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
 * @param timezone 可选的时区覆盖
 * @returns 格式化后的字符串
 */
export function formatRelativeTime(timestamp: string | Date, now: Date = new Date(), timezone?: string): string {
  const date = new Date(timestamp);
  const tz = timezone || getAppTimezone();

  // 获取时区感知的日期部分
  const nowInTz = getDateInTimezone(now, tz);
  const dateInTz = getDateInTimezone(date, tz);

  const nowYear = nowInTz.year;
  const nowMonth = nowInTz.month;
  const nowDate = nowInTz.day;

  const dateYear = dateInTz.year;
  const dateMonth = dateInTz.month;
  const dateDate = dateInTz.day;

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

  const timeStr = formatWithTimezone(
    date,
    {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    },
    tz
  );

  // 今天
  if (nowYear === dateYear && nowMonth === dateMonth && nowDate === dateDate) {
    return timeStr;
  }

  // 昨天
  const yesterday = new Date(now);
  yesterday.setDate(nowDate - 1);
  const yesterdayInTz = getDateInTimezone(yesterday, tz);
  if (yesterdayInTz.year === dateYear && yesterdayInTz.month === dateMonth && yesterdayInTz.day === dateDate) {
    return `昨天 ${timeStr}`;
  }

  // 今年内
  if (nowYear === dateYear) {
    return `${dateMonth.toString().padStart(2, "0")}-${dateDate.toString().padStart(2, "0")} ${timeStr}`;
  }

  // 更早
  return `${dateYear}-${dateMonth.toString().padStart(2, "0")}-${dateDate.toString().padStart(2, "0")} ${timeStr}`;
}

/**
 * 获取应用时区的 ISO 格式字符串 (YYYY-MM-DDTHH:mm:ss.sss)
 *
 * 与 `new Date().toISOString()` 的区别在于，后者总是返回 UTC 时间。
 * 此函数返回的日期和时间部分反映的是应用设置的时区时间。
 *
 * @param date 可选的 Date 对象，默认为当前时间
 * @param timezone 可选的时区覆盖
 * @returns 应用时区的 ISO 格式字符串
 */
export function getLocalISOString(date: Date = new Date(), timezone?: string): string {
  const tz = timezone || getAppTimezone();
  const dateInTz = getDateInTimezone(date, tz);
  const year = dateInTz.year;
  const month = dateInTz.month.toString().padStart(2, "0");
  const day = dateInTz.day.toString().padStart(2, "0");
  const hours = dateInTz.hours.toString().padStart(2, "0");
  const minutes = dateInTz.minutes.toString().padStart(2, "0");
  const seconds = dateInTz.seconds.toString().padStart(2, "0");
  const milliseconds = dateInTz.milliseconds.toString().padStart(3, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}`;
}

/**
 * 使用 date-fns 格式化日期和时间（时区感知版本）
 * @param date 日期对象、ISO 字符串或时间戳
 * @param formatString 格式化模板 (例如 'yyyy-MM-dd HH:mm:ss')
 * @param timezone 可选的时区覆盖
 * @returns 格式化后的字符串
 */
export function formatDateTime(
  date: Date | string | number,
  formatString: string = "yyyy-MM-dd_HH-mm-ss",
  timezone?: string
): string {
  const dateObj = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  const tz = timezone || getAppTimezone();

  try {
    return formatInTimeZone(dateObj, tz, formatString);
  } catch {
    // 如果 date-fns-tz 不可用，回退到本地 format
    return format(dateObj, formatString);
  }
}

/**
 * 使用 date-fns 格式化日期和时间（不使用时区设置，保持原始行为）
 * @param date 日期对象、ISO 字符串或时间戳
 * @param formatString 格式化模板 (例如 'yyyy-MM-dd HH:mm:ss')
 * @returns 格式化后的字符串
 */
export function formatDateTimeLocal(
  date: Date | string | number,
  formatString: string = "yyyy-MM-dd_HH-mm-ss"
): string {
  const dateObj = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return format(dateObj, formatString);
}
