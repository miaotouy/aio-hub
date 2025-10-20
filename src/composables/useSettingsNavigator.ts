import { useRouter } from "vue-router";

/**
 * 设置页面导航 Composable
 * 提供一个统一的方式从任何组件跳转到设置页的特定区域
 */
export function useSettingsNavigator() {
  const router = useRouter();

  /**
   * 导航到设置页面的指定区域
   * @param sectionId 目标设置区域的 ID (来自 src/config/settings.ts)
   * 可用的 section IDs:
   * - 'general': 通用设置
   * - 'theme-colors': 主题色配置
   * - 'tools': 工具模块
   * - 'ocr-service': 云端 OCR 服务
   * - 'llm-service': LLM 服务配置
   * - 'model-icons': 模型图标配置
   * - 'about': 关于
   */
  const navigateToSettings = (sectionId: string) => {
    router.push({ path: "/settings", query: { section: sectionId } });
  };

  return { navigateToSettings };
}