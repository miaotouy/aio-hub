/**
 * 时间日期宏集合
 * 提供时间和日期相关的宏，包括现代格式、古风格式和多语言支持
 */

import type { MacroContext } from '../MacroContext';
import type { MacroRegistry } from '../MacroRegistry';
import { MacroPhase, MacroType } from '../MacroRegistry';
import type { MacroDefinition } from '../MacroRegistry';

// ============================================================================
// 核心工具函数
// ============================================================================

/**
 * 计算有效时间（考虑虚拟时间配置）
 */
function calculateEffectiveTime(context: MacroContext): Date {
  // 1. 获取当前现实时间（优先使用 context.timestamp，否则取当前系统时间）
  const currentRealTime = context.timestamp ? new Date(context.timestamp) : new Date();

  // 2. 检查是否有虚拟时间配置
  const config = context.agent?.virtualTimeConfig;
  if (!config) {
    return currentRealTime;
  }

  try {
    // 3. 解析基准时间
    const virtualBase = new Date(config.virtualBaseTime).getTime();
    const realBase = new Date(config.realBaseTime).getTime();
    const timeScale = config.timeScale ?? 1.0;

    // 4. 计算时间差
    const elapsedRealTime = currentRealTime.getTime() - realBase;
    const elapsedVirtualTime = elapsedRealTime * timeScale;

    // 5. 返回虚拟时间
    return new Date(virtualBase + elapsedVirtualTime);
  } catch (e) {
    // 如果解析出错，回退到现实时间
    console.error('Error calculating virtual time:', e);
    return currentRealTime;
  }
}

/**
 * 格式化时间（12小时制）
 */
function formatTime(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes} ${ampm}`;
}

/**
 * 格式化日期（英文）
 */
function formatDate(date: Date): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const month = months[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  return `${month} ${day}, ${year}`;
}

// ============================================================================
// 古风中文时间系统
// ============================================================================

/** 天干 */
const HEAVENLY_STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
/** 地支 */
const EARTHLY_BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
/** 生肖 */
const ZODIAC_ANIMALS = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
/** 农历月份 */
const LUNAR_MONTHS = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
/** 农历日期 */
const LUNAR_DAYS_PREFIX = ['初', '初', '初', '初', '初', '初', '初', '初', '初', '初', '十', '十', '十', '十', '十', '十', '十', '十', '十', '二', '廿', '廿', '廿', '廿', '廿', '廿', '廿', '廿', '廿', '三'];
const LUNAR_DAYS_SUFFIX = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
/** 时辰名称 */
const SHICHEN_NAMES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
/** 刻数中文 */
const KE_NUMBERS = ['零', '一', '二', '三', '四', '五', '六', '七'];

// ============================================================================
// 大写汉字数字系统
// ============================================================================

/** 大写汉字数字（金融数字） */
const UPPERCASE_DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
/** 大写汉字单位 */
const UPPERCASE_UNITS = ['', '拾', '佰', '仟'];

/**
 * 将数字转换为大写汉字
 * @param num 要转换的数字（0-9999）
 * @returns 大写汉字字符串
 */
function numberToUppercase(num: number): string {
  if (num === 0) return UPPERCASE_DIGITS[0];
  if (num < 0 || num > 9999) return num.toString();

  let result = '';
  let unitIndex = 0;
  let hasZero = false;

  while (num > 0) {
    const digit = num % 10;
    if (digit === 0) {
      hasZero = true;
    } else {
      if (hasZero && result) {
        result = UPPERCASE_DIGITS[0] + result;
        hasZero = false;
      }
      result = UPPERCASE_DIGITS[digit] + UPPERCASE_UNITS[unitIndex] + result;
    }
    num = Math.floor(num / 10);
    unitIndex++;
  }

  return result;
}

/**
 * 将年份转换为大写汉字（逐位转换）
 * @param year 年份
 * @returns 大写汉字年份，如 "贰零贰伍"
 */
function yearToUppercase(year: number): string {
  return year
    .toString()
    .split('')
    .map(d => UPPERCASE_DIGITS[parseInt(d)])
    .join('');
}

/**
 * 格式化大写汉字日期
 * @param date 日期对象
 * @returns 大写汉字日期，如 "贰零贰伍年拾贰月初肆日"
 */
function formatUppercaseChineseDate(date: Date): string {
  const year = yearToUppercase(date.getFullYear());
  const month = numberToUppercase(date.getMonth() + 1);
  const day = numberToUppercase(date.getDate());
  return `${year}年${month}月${day}日`;
}

/**
 * 格式化大写汉字时间
 * @param date 日期对象
 * @returns 大写汉字时间，如 "贰拾时叁拾分"
 */
function formatUppercaseChineseTime(date: Date): string {
  const hours = numberToUppercase(date.getHours());
  const minutes = numberToUppercase(date.getMinutes());
  return `${hours}时${minutes}分`;
}

/**
 * 格式化完整大写汉字日期时间
 * @param date 日期对象
 * @returns 完整大写汉字日期时间
 */
function formatUppercaseChineseDatetime(date: Date): string {
  return `${formatUppercaseChineseDate(date)} ${formatUppercaseChineseTime(date)}`;
}

/**
 * 计算干支年（简化算法，基于公历年份）
 */
function getGanzhiYear(year: number): string {
  // 以1984年（甲子年）为基准
  const offset = year - 1984;
  const stemIndex = ((offset % 10) + 10) % 10;
  const branchIndex = ((offset % 12) + 12) % 12;
  return HEAVENLY_STEMS[stemIndex] + EARTHLY_BRANCHES[branchIndex];
}

/**
 * 获取生肖
 */
function getZodiac(year: number): string {
  const offset = year - 1984;
  const index = ((offset % 12) + 12) % 12;
  return ZODIAC_ANIMALS[index];
}

/**
 * 简化的公历转农历（近似算法）
 * 注意：这是一个简化版本，实际农历计算非常复杂
 */
function getApproximateLunarDate(date: Date): { month: number; day: number; isLeapMonth: boolean } {
  // 使用简化算法：假设农历比公历晚约一个月
  // 实际应用中应该使用完整的农历算法库
  const month = date.getMonth(); // 0-11
  const day = date.getDate();

  // 简化处理：农历月份约等于公历月份-1（粗略近似）
  let lunarMonth = month; // 0-11 对应 正月-腊月
  let lunarDay = day;

  // 如果日期在月初，可能还在上个农历月
  if (day <= 3) {
    lunarMonth = (month - 1 + 12) % 12;
    lunarDay = 27 + day; // 近似
  }

  return { month: lunarMonth, day: Math.min(lunarDay, 30), isLeapMonth: false };
}

/**
 * 格式化农历日期
 */
function formatLunarDay(day: number): string {
  if (day === 10) return '初十';
  if (day === 20) return '二十';
  if (day === 30) return '三十';
  return LUNAR_DAYS_PREFIX[day] + LUNAR_DAYS_SUFFIX[day];
}

/**
 * 获取时辰（将24小时制转换为12时辰）
 * @param hour 小时 (0-23)
 * @param minute 分钟 (0-59)，可选，用于计算刻数
 */
function getShichen(hour: number, minute: number = 0): { name: string; index: number; ke: number } {
  // 子时从23点开始，所以需要调整
  // 23:00-00:59 = 子时, 01:00-02:59 = 丑时, ...
  const adjustedHour = (hour + 1) % 24;
  const shichenIndex = Math.floor(adjustedHour / 2);

  // 计算在当前时辰内的分钟数
  // 每个时辰2小时 = 120分钟，分为8刻，每刻约15分钟
  const minuteInHour = (adjustedHour % 2) * 60 + minute;
  const ke = Math.floor(minuteInHour / 15);

  return {
    name: SHICHEN_NAMES[shichenIndex],
    index: shichenIndex,
    ke: Math.min(ke, 7), // 确保刻数不超过7
  };
}

/**
 * 格式化古风中文日期
 */
function formatAncientChineseDate(date: Date): string {
  const year = date.getFullYear();
  const ganzhi = getGanzhiYear(year);
  const zodiac = getZodiac(year);
  const lunar = getApproximateLunarDate(date);
  const lunarMonthName = LUNAR_MONTHS[lunar.month];
  const lunarDayName = formatLunarDay(lunar.day);

  return `${ganzhi}年（${zodiac}年）${lunarMonthName}月${lunarDayName}`;
}

/**
 * 格式化古风中文时间
 */
function formatAncientChineseTime(date: Date): string {
  const hour = date.getHours();
  const minutes = date.getMinutes();
  const shichen = getShichen(hour, minutes);

  if (shichen.ke === 0) {
    return `${shichen.name}时`;
  }
  return `${shichen.name}时${KE_NUMBERS[shichen.ke]}刻`;
}

/**
 * 格式化完整古风中文日期时间
 */
function formatAncientChineseDatetime(date: Date): string {
  return `${formatAncientChineseDate(date)} ${formatAncientChineseTime(date)}`;
}

// ============================================================================
// 古风英文时间系统
// ============================================================================

/** 英文序数词后缀 */
function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

/** 英文月份 */
const ENGLISH_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];


/**
 * 格式化古风英文日期（中世纪/维多利亚风格）
 */
function formatAncientEnglishDate(date: Date): string {
  const day = date.getDate();
  const month = ENGLISH_MONTHS[date.getMonth()];
  const year = date.getFullYear();
  const ordinal = getOrdinalSuffix(day);

  return `the ${day}${ordinal} day of ${month}, in the year of our Lord ${year}`;
}

/**
 * 格式化古风英文时间
 */
function formatAncientEnglishTime(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();

  // 特殊时间点
  if (minutes === 0) {
    if (hours === 0) return 'the stroke of midnight';
    if (hours === 12) return 'high noon';
    if (hours < 12) return `${hours} o'clock in the morning`;
    if (hours < 18) return `${hours - 12} o'clock in the afternoon`;
    return `${hours - 12} o'clock in the evening`;
  }

  // 一般时间
  const period = hours < 12 ? 'morning' : hours < 18 ? 'afternoon' : 'evening';
  const displayHour = hours % 12 || 12;

  if (minutes === 30) {
    return `half past ${displayHour} in the ${period}`;
  }
  if (minutes === 15) {
    return `a quarter past ${displayHour} in the ${period}`;
  }
  if (minutes === 45) {
    const nextHour = (displayHour % 12) + 1;
    return `a quarter to ${nextHour} in the ${period}`;
  }

  return `${minutes} minutes past ${displayHour} in the ${period}`;
}

/**
 * 格式化完整古风英文日期时间
 */
function formatAncientEnglishDatetime(date: Date): string {
  return `${formatAncientEnglishTime(date)}, on ${formatAncientEnglishDate(date)}`;
}

// ============================================================================
// 多语言支持
// ============================================================================

/** 支持的语言区域设置 */
type SupportedLocale = 'zh-CN' | 'zh-TW' | 'ja-JP' | 'ko-KR' | 'en-US' | 'en-GB' | 'de-DE' | 'fr-FR' | 'ru-RU' | 'es-ES' | 'it-IT' | 'pt-BR' | 'ar-SA' | 'th-TH' | 'vi-VN';

/** 语言别名映射 */
const LOCALE_ALIASES: Record<string, SupportedLocale> = {
  // 中文
  'zh': 'zh-CN', 'cn': 'zh-CN', 'chinese': 'zh-CN', 'zh-hans': 'zh-CN',
  'tw': 'zh-TW', 'zh-hant': 'zh-TW', 'zh-hk': 'zh-TW',
  // 日语
  'ja': 'ja-JP', 'jp': 'ja-JP', 'japanese': 'ja-JP',
  // 韩语
  'ko': 'ko-KR', 'kr': 'ko-KR', 'korean': 'ko-KR',
  // 英语
  'en': 'en-US', 'english': 'en-US', 'us': 'en-US',
  'gb': 'en-GB', 'uk': 'en-GB', 'british': 'en-GB',
  // 德语
  'de': 'de-DE', 'german': 'de-DE',
  // 法语
  'fr': 'fr-FR', 'french': 'fr-FR',
  // 俄语
  'ru': 'ru-RU', 'russian': 'ru-RU',
  // 西班牙语
  'es': 'es-ES', 'spanish': 'es-ES',
  // 意大利语
  'it': 'it-IT', 'italian': 'it-IT',
  // 葡萄牙语
  'pt': 'pt-BR', 'portuguese': 'pt-BR', 'br': 'pt-BR',
  // 阿拉伯语
  'ar': 'ar-SA', 'arabic': 'ar-SA',
  // 泰语
  'th': 'th-TH', 'thai': 'th-TH',
  // 越南语
  'vi': 'vi-VN', 'vietnamese': 'vi-VN',
};

/**
 * 解析语言参数
 */
function parseLocale(localeArg?: string): SupportedLocale {
  if (!localeArg) return 'zh-CN';
  const normalized = localeArg.toLowerCase().trim();

  // 优先从别名映射中查找
  if (normalized in LOCALE_ALIASES) {
    return LOCALE_ALIASES[normalized];
  }

  // 检查是否是有效的 SupportedLocale
  const validLocales: SupportedLocale[] = [
    'zh-CN', 'zh-TW', 'ja-JP', 'ko-KR', 'en-US', 'en-GB',
    'de-DE', 'fr-FR', 'ru-RU', 'es-ES', 'it-IT', 'pt-BR',
    'ar-SA', 'th-TH', 'vi-VN'
  ];

  if (validLocales.includes(normalized as SupportedLocale)) {
    return normalized as SupportedLocale;
  }

  // 尝试匹配语言代码前缀（如 'zh' -> 'zh-CN'）
  const prefix = normalized.split('-')[0];
  if (prefix in LOCALE_ALIASES) {
    return LOCALE_ALIASES[prefix];
  }

  return 'zh-CN';
}

/**
 * 使用 Intl API 格式化日期
 */
function formatDateWithLocale(date: Date, locale: SupportedLocale, options?: Intl.DateTimeFormatOptions): string {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...options,
  };
  return new Intl.DateTimeFormat(locale, defaultOptions).format(date);
}

/**
 * 使用 Intl API 格式化完整日期时间
 */
function formatDatetimeWithLocale(date: Date, locale: SupportedLocale, options?: Intl.DateTimeFormatOptions): string {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'long',
    ...options,
  };
  return new Intl.DateTimeFormat(locale, defaultOptions).format(date);
}

/**
 * 获取本地化的星期几
 */
function formatWeekdayWithLocale(date: Date, locale: SupportedLocale): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date);
}

// ============================================================================
// 自定义格式化
// ============================================================================

/**
 * 自定义格式化日期时间
 * 支持的格式符：
 * - YYYY: 四位年份
 * - YY: 两位年份
 * - MMMM: 月份全称
 * - MMM: 月份缩写
 * - MM: 两位月份
 * - M: 月份（不补零）
 * - dddd: 星期全称
 * - ddd: 星期缩写
 * - DD: 两位日期
 * - D: 日期（不补零）
 * - HH: 24小时制小时
 * - H: 24小时制小时（不补零）
 * - hh: 12小时制小时
 * - h: 12小时制小时（不补零）
 * - mm: 分钟
 * - m: 分钟（不补零）
 * - ss: 秒
 * - s: 秒（不补零）
 * - A: AM/PM
 * - a: am/pm
 */
function formatWithPattern(date: Date, pattern: string): string {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  const dayOfWeek = date.getDay();

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const weekdayShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const hour12 = hours % 12 || 12;
  const ampm = hours >= 12 ? 'PM' : 'AM';

  // 使用占位符策略避免替换冲突
  // 先将长模式替换为占位符，最后再替换回实际值
  const placeholders: Map<string, string> = new Map();
  let placeholderIndex = 0;

  const createPlaceholder = (value: string): string => {
    const placeholder = `\x00${placeholderIndex++}\x00`;
    placeholders.set(placeholder, value);
    return placeholder;
  };

  let result = pattern;

  // 按长度降序处理，确保长模式优先匹配
  // 年份
  result = result.replace(/YYYY/g, createPlaceholder(year.toString()));
  result = result.replace(/YY/g, createPlaceholder((year % 100).toString().padStart(2, '0')));

  // 月份（先处理长模式）
  result = result.replace(/MMMM/g, createPlaceholder(monthNames[month]));
  result = result.replace(/MMM/g, createPlaceholder(monthShort[month]));
  result = result.replace(/MM/g, createPlaceholder((month + 1).toString().padStart(2, '0')));
  result = result.replace(/M/g, createPlaceholder((month + 1).toString()));

  // 星期
  result = result.replace(/dddd/g, createPlaceholder(weekdayNames[dayOfWeek]));
  result = result.replace(/ddd/g, createPlaceholder(weekdayShort[dayOfWeek]));

  // 日期
  result = result.replace(/DD/g, createPlaceholder(day.toString().padStart(2, '0')));
  result = result.replace(/D/g, createPlaceholder(day.toString()));

  // 小时
  result = result.replace(/HH/g, createPlaceholder(hours.toString().padStart(2, '0')));
  result = result.replace(/H/g, createPlaceholder(hours.toString()));
  result = result.replace(/hh/g, createPlaceholder(hour12.toString().padStart(2, '0')));
  result = result.replace(/h/g, createPlaceholder(hour12.toString()));

  // 分钟
  result = result.replace(/mm/g, createPlaceholder(minutes.toString().padStart(2, '0')));
  result = result.replace(/m/g, createPlaceholder(minutes.toString()));

  // 秒
  result = result.replace(/ss/g, createPlaceholder(seconds.toString().padStart(2, '0')));
  result = result.replace(/s/g, createPlaceholder(seconds.toString()));

  // AM/PM
  result = result.replace(/A/g, createPlaceholder(ampm));
  result = result.replace(/a/g, createPlaceholder(ampm.toLowerCase()));

  // 将占位符替换回实际值
  for (const [placeholder, value] of placeholders) {
    result = result.replace(new RegExp(placeholder.replace(/\x00/g, '\\x00'), 'g'), value);
  }

  return result;
}

// ============================================================================
// 日语特殊格式
// ============================================================================

/** 日语星期 */
const JAPANESE_WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * 格式化日语日期（带星期）
 */
function formatJapaneseDate(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = JAPANESE_WEEKDAYS[date.getDay()];
  return `${year}年${month}月${day}日（${weekday}）`;
}

/**
 * 格式化日语时间
 */
function formatJapaneseTime(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const period = hours < 12 ? '午前' : '午後';
  const displayHour = hours % 12 || 12;
  return `${period}${displayHour}時${minutes}分`;
}

// ============================================================================
// 韩语特殊格式
// ============================================================================

/** 韩语星期 */
const KOREAN_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 格式化韩语日期
 */
function formatKoreanDate(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = KOREAN_WEEKDAYS[date.getDay()];
  return `${year}년 ${month}월 ${day}일 (${weekday})`;
}


// ============================================================================
// 宏注册
// ============================================================================

/**
 * 注册时间日期宏
 */
export function registerDateTimeMacros(registry: MacroRegistry): void {
  const dateTimeMacros: MacroDefinition[] = [
    // ================== 通用宏 ==================
    {
      name: 'time',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: '当前时间（12小时制，英文，如：10:30 PM）',
      example: '{{time}}',
      acceptsArgs: false,
      priority: 90,
      supported: true,
      contextFree: true,
      execute: (context) => {
        const now = calculateEffectiveTime(context);
        return formatTime(now);
      },
    },
    {
      name: 'date',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: '当前日期（英文，如：November 7, 2025）',
      example: '{{date}}',
      acceptsArgs: false,
      priority: 90,
      supported: true,
      contextFree: true,
      execute: (context) => {
        const now = calculateEffectiveTime(context);
        return formatDate(now);
      },
    },
    {
      name: 'isotime',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: 'ISO 8601 格式的时间戳',
      example: '{{isotime}}',
      acceptsArgs: false,
      priority: 70,
      supported: true,
      contextFree: true,
      execute: (context) => {
        const now = calculateEffectiveTime(context);
        return now.toISOString();
      },
    },
    {
      name: 'timestamp',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: 'Unix 时间戳（毫秒）',
      example: '{{timestamp}}',
      acceptsArgs: false,
      priority: 60,
      supported: true,
      contextFree: true,
      execute: (context) => {
        const now = calculateEffectiveTime(context);
        return now.getTime().toString();
      },
    },
    {
      name: 'time24',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: '24小时制时间（如：22:30）',
      example: '{{time24}}',
      acceptsArgs: false,
      priority: 85,
      supported: true,
      contextFree: true,
      execute: (context) => {
        const now = calculateEffectiveTime(context);
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
      },
    },
    {
      name: 'date_ymd',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: '当前日期（格式：YYYY-MM-DD）',
      example: '{{date_ymd}}',
      acceptsArgs: false,
      priority: 89,
      supported: true,
      contextFree: true,
      execute: (context) => {
        const now = calculateEffectiveTime(context);
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
      },
    },
    {
      name: 'datetime',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: '完整日期和时间（格式：YYYY-MM-DD HH:mm:ss）',
      example: '{{datetime}}',
      acceptsArgs: false,
      priority: 87,
      supported: true,
      contextFree: true,
      execute: (context) => {
        const now = calculateEffectiveTime(context);
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      },
    },
    {
      name: 'weekday',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: '星期几（英文，如：Monday）',
      example: '{{weekday}}',
      acceptsArgs: false,
      priority: 80,
      supported: true,
      contextFree: true,
      execute: (context) => {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const now = calculateEffectiveTime(context);
        return days[now.getDay()];
      },
    },

    // ================== 自定义格式化宏 ==================
    {
      name: 'datetime_format',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: '使用指定格式字符串格式化当前日期时间',
      example: '{{datetime_format::YYYY-MM-DD hh:mm:ss a}}',
      acceptsArgs: true,
      priority: 110,
      supported: true,
      contextFree: true,
      execute: (context, args) => {
        const now = calculateEffectiveTime(context);
        const format = args?.[0] || 'YYYY-MM-DD HH:mm:ss';
        return formatWithPattern(now, format);
      },
    },

    // ================== 多语言宏 ==================
    {
      name: 'date_cn',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: '当前日期（中文，如：2025年11月7日）',
      example: '{{date_cn}}',
      acceptsArgs: false,
      priority: 88,
      supported: true,
      contextFree: true,
      execute: (context) => {
        const now = calculateEffectiveTime(context);
        return formatDateWithLocale(now, 'zh-CN');
      },
    },
    {
      name: 'datetime_cn',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: '完整日期和时间（中文，如：2025年11月7日 星期五 下午10:30）',
      example: '{{datetime_cn}}',
      acceptsArgs: false,
      priority: 86,
      supported: true,
      contextFree: true,
      execute: (context) => {
        const now = calculateEffectiveTime(context);
        return formatDatetimeWithLocale(now, 'zh-CN');
      },
    },
    {
      name: 'weekday_cn',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: '星期几（中文，如：星期一）',
      example: '{{weekday_cn}}',
      acceptsArgs: false,
      priority: 79,
      supported: true,
      contextFree: true,
      execute: (context) => {
        const now = calculateEffectiveTime(context);
        return formatWeekdayWithLocale(now, 'zh-CN');
      },
    },
    {
      name: 'date_jp',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: '当前日期（日语，如：2025年11月7日（金））',
      example: '{{date_jp}}',
      acceptsArgs: false,
      priority: 78,
      supported: true,
      contextFree: true,
      execute: (context) => {
        const now = calculateEffectiveTime(context);
        return formatJapaneseDate(now);
      },
    },
    {
      name: 'datetime_jp',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: '完整日期和时间（日语，如：午後10時30分）',
      example: '{{datetime_jp}}',
      acceptsArgs: false,
      priority: 77,
      supported: true,
      contextFree: true,
      execute: (context) => {
        const now = calculateEffectiveTime(context);
        return `${formatJapaneseDate(now)} ${formatJapaneseTime(now)}`;
      },
    },
    {
      name: 'date_ko',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: '当前日期（韩语，如：2025년 11월 7일 (금)）',
      example: '{{date_ko}}',
      acceptsArgs: false,
      priority: 78,
      supported: true,
      contextFree: true,
      execute: (context) => {
        const now = calculateEffectiveTime(context);
        return formatKoreanDate(now);
      },
    },
    {
      name: 'datetime_locale',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: '使用指定语言格式化完整日期时间',
      example: '{{datetime_locale::fr}} 或 {{datetime_locale::ru-RU}}',
      acceptsArgs: true,
      priority: 84,
      supported: true,
      contextFree: true,
      execute: (context, args) => {
        const now = calculateEffectiveTime(context);
        const locale = parseLocale(args?.[0]);
        return formatDatetimeWithLocale(now, locale);
      },
    },

    // ================== 古风宏 ==================
    {
      name: 'date_cn_ancient',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: '当前日期（古风中文，如：甲子年正月初一）',
      example: '{{date_cn_ancient}}',
      acceptsArgs: false,
      priority: 75,
      supported: true,
      contextFree: true,
      execute: (context) => {
        const now = calculateEffectiveTime(context);
        return formatAncientChineseDate(now);
      },
    },
    {
      name: 'time_cn_ancient',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: '当前时间（古风中文，如：辰时三刻）',
      example: '{{time_cn_ancient}}',
      acceptsArgs: false,
      priority: 74,
      supported: true,
      contextFree: true,
      execute: (context) => {
        const now = calculateEffectiveTime(context);
        return formatAncientChineseTime(now);
      },
    },
    {
      name: 'datetime_cn_ancient',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: '完整日期时间（古风中文）',
      example: '{{datetime_cn_ancient}}',
      acceptsArgs: false,
      priority: 73,
      supported: true,
      contextFree: true,
      execute: (context) => {
        const now = calculateEffectiveTime(context);
        return formatAncientChineseDatetime(now);
      },
    },
    {
      name: 'shichen',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: '当前时辰（如：辰时）',
      example: '{{shichen}}',
      acceptsArgs: false,
      priority: 72,
      supported: true,
      contextFree: true,
      execute: (context) => {
        const now = calculateEffectiveTime(context);
        return getShichen(now.getHours()).name + '时';
      },
    },
    {
      name: 'date_en_ancient',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: '当前日期（古风英文）',
      example: '{{date_en_ancient}}',
      acceptsArgs: false,
      priority: 71,
      supported: true,
      contextFree: true,
      execute: (context) => {
        const now = calculateEffectiveTime(context);
        return formatAncientEnglishDate(now);
      },
    },
    {
      name: 'datetime_en_ancient',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: '完整日期时间（古风英文）',
      example: '{{datetime_en_ancient}}',
      acceptsArgs: false,
      priority: 70,
      supported: true,
      contextFree: true,
      execute: (context) => {
        const now = calculateEffectiveTime(context);
        return formatAncientEnglishDatetime(now);
      },
    },

    // ================== 大写汉字宏 ==================
    {
      name: 'date_cn_uppercase',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: '当前日期（大写汉字，如：贰零贰伍年拾贰月肆日）',
      example: '{{date_cn_uppercase}}',
      acceptsArgs: false,
      priority: 69,
      supported: true,
      contextFree: true,
      execute: (context) => {
        const now = calculateEffectiveTime(context);
        return formatUppercaseChineseDate(now);
      },
    },
    {
      name: 'time_cn_uppercase',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: '当前时间（大写汉字，如：贰拾时叁拾分）',
      example: '{{time_cn_uppercase}}',
      acceptsArgs: false,
      priority: 68,
      supported: true,
      contextFree: true,
      execute: (context) => {
        const now = calculateEffectiveTime(context);
        return formatUppercaseChineseTime(now);
      },
    },
    {
      name: 'datetime_cn_uppercase',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: '完整日期时间（大写汉字）',
      example: '{{datetime_cn_uppercase}}',
      acceptsArgs: false,
      priority: 67,
      supported: true,
      contextFree: true,
      execute: (context) => {
        const now = calculateEffectiveTime(context);
        return formatUppercaseChineseDatetime(now);
      },
    },
  ];

  registry.registerMany(dateTimeMacros);
}
