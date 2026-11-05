import { createI18n } from "vue-i18n";
import zhCN from "./locales/zh-CN.json";
import enUS from "./locales/en-US.json";
import type { I18nKey, SubKeyOf, TypedT } from "./schema";

export type { I18nKey, SubKeyOf, TypedT } from "./schema";

// 默认语言
const defaultLocale = "zh-CN";

// 创建 i18n 实例（语言包静态聚合，含 tools 命名空间）
const i18n = createI18n({
  legacy: false, // 使用 Composition API 模式
  locale: defaultLocale,
  fallbackLocale: "zh-CN",
  messages: {
    "zh-CN": zhCN,
    "en-US": enUS,
  },
});

/**
 * 强类型的翻译函数包装
 */
export function useI18n() {
  const { t, ...rest } = i18n.global;

  // 强类型版本 - 只接受预定义的 I18nKey
  const typedT: TypedT = (key, ...args) => {
    return (t as any)(key, ...args);
  };

  return {
    t: typedT,
    useScopedT,
    ...rest,
  };
}

/**
 * 创建作用域限定的强类型翻译函数：
 * key 只需提供前缀下的子 key，类型由全局语言包静态推导
 * @example const t = useScopedT("tools.llm-chat.ChatView"); t("删除消息")
 */
export function useScopedT<Prefix extends I18nKey>(prefix: Prefix) {
  return (key: SubKeyOf<Prefix>, ...args: any[]): string =>
    (i18n.global.t as any)(`${prefix}.${key}`, ...args);
}

/**
 * 设置当前语言
 */
export function setI18nLanguage(locale: any) {
  i18n.global.locale.value = locale;
}

// 扩展全局组件类型，让模板中的 t 也能享受类型提示
declare module "vue" {
  interface ComponentCustomProperties {
    t: TypedT;
  }
}

export default i18n;
