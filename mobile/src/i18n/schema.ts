import zhCN from "./locales/zh-CN.json";

/**
 * 递归推导 JSON 的嵌套路径类型
 */
type NestedKeyOf<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends object
    ? `${Prefix}${K}` | NestedKeyOf<T[K], `${Prefix}${K}.` >
    : `${Prefix}${K}`;
}[keyof T & string];

/**
 * 全局 i18n Key 类型定义，基于 zh-CN.json 推导
 */
export type I18nKey = NestedKeyOf<typeof zhCN>;

/**
 * 强类型的翻译函数接口 - 只接受预定义的 I18nKey
 */
export interface TypedT {
  (key: I18nKey, ...args: any[]): string;
}

/**
 * 宽松类型的翻译函数接口 - 用于动态 key 场景（如工具私有 key）
 */
export interface RawT {
  (key: string, ...args: any[]): string;
}

/**
 * 辅助函数：确保 Key 符合推导出的类型
 */
export function t_key(key: I18nKey): string {
  return key;
}