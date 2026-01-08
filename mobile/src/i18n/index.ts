import { createI18n } from 'vue-i18n';
import zhCN from './locales/zh-CN.json';
import enUS from './locales/en-US.json';
import type { TypedT, RawT } from './schema';

// 默认语言
const defaultLocale = 'zh-CN';

// 创建 i18n 实例
const i18n = createI18n({
  legacy: false, // 使用 Composition API 模式
  locale: defaultLocale,
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
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
  
  // 宽松版本 - 用于动态 key（如工具私有 key）
  const rawT: RawT = (key, ...args) => {
    return (t as any)(key, ...args);
  };

  return {
    t: typedT,
    tRaw: rawT,
    ...rest,
  };
}

// 扩展全局组件类型，让模板中的 t 也能享受类型提示
declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    t: TypedT;
    tRaw: RawT;
  }
}

/**
 * 注册工具私有语言包
 * @param toolId 工具 ID
 * @param messages 语言包内容 { 'zh-CN': { ... }, 'en-US': { ... } }
 */
export function registerToolLocales(toolId: string, messages: Record<string, any>) {
  Object.keys(messages).forEach((locale) => {
    i18n.global.mergeLocaleMessage(locale, {
      tools: {
        [toolId]: messages[locale],
      },
    });
  });
}

export default i18n;