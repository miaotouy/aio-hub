import zhCN from "./locales/zh-CN.json";

/**
 * 递归推导 JSON 的嵌套路径类型
 */
type NestedKeyOf<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends object
    ? `${Prefix}${K}` | NestedKeyOf<T[K], `${Prefix}${K}.`>
    : `${Prefix}${K}`;
}[keyof T & string];

/**
 * 全局 i18n Key 类型定义，基于 zh-CN.json 推导（含 tools 命名空间）
 */
export type I18nKey = NestedKeyOf<typeof zhCN>;

/**
 * 强类型的翻译函数接口 - 只接受预定义的 I18nKey
 */
export interface TypedT {
  (key: I18nKey, ...args: any[]): string;
}

/**
 * 提取某前缀下的子 key（去掉前缀部分），用于工具作用域短 key 场景
 */
export type SubKeyOf<Prefix extends string> =
  Extract<I18nKey, `${Prefix}.${string}`> extends infer K
    ? K extends `${Prefix}.${infer Rest}`
      ? Rest
      : never
    : never;

/**
 * 辅助函数：确保 Key 符合推导出的类型
 */
export function t_key(key: I18nKey): string {
  return key;
}
