import { useRouter, useRoute } from "vue-router";
import { invoke } from "@tauri-apps/api/core";
import { createModuleLogger } from "@utils/logger";

const logger = createModuleLogger("SettingsNavigator");

/**
 * 设置页面导航 Composable
 * 提供一个统一的方式从任何组件跳转到设置页的特定区域
 * 支持从主窗口和分离窗口中调用
 */
export function useSettingsNavigator() {
  const router = useRouter();
  const route = useRoute();

  /**
   * 检测当前是否在分离窗口中
   */
  const isInDetachedWindow = (): boolean => {
    const path = route.path;
    return path.startsWith("/detached-window/") || path.startsWith("/detached-component/");
  };

  /**
   * 导航到设置页面的指定区域
   * @param sectionId 目标设置区域的 ID (来自 src/config/settings.ts)
   * 可用的 section IDs:
   * - 'general': 通用设置
   * - 'theme-colors': 主题色配置
   * - 'tools': 工具模块
   * - 'ocr-service': 云端 OCR 服务
   * - 'llm-service': LLM 服务配置
   * - 'model-metadata': 模型元数据配置
   * - 'about': 关于
   */
  const navigateToSettings = async (sectionId: string) => {
    try {
      if (isInDetachedWindow()) {
        // 在分离窗口中，需要聚焦主窗口并在主窗口中导航
        logger.info("从分离窗口导航到设置页面", { sectionId });
        
        // 通过 Tauri 命令在主窗口中打开设置页面
        await invoke("navigate_main_window_to_settings", { sectionId });
        
        logger.info("已请求主窗口导航到设置页面", { sectionId });
      } else {
        // 在主窗口中，直接使用路由导航
        logger.info("在主窗口中导航到设置页面", { sectionId });
        router.push({ path: "/settings", query: { section: sectionId } });
      }
    } catch (error) {
      logger.error("导航到设置页面失败", { error, sectionId });
      // 降级处理：尝试直接使用路由导航
      router.push({ path: "/settings", query: { section: sectionId } });
    }
  };

  return { navigateToSettings };
}