import { onMounted, onUnmounted } from "vue";
import { useTheme } from "./useTheme";
import { initThemeAppearance, cleanupThemeAppearance } from "./useThemeAppearance";
import { useAppSettingsStore } from "@/stores/appSettingsStore";
import { applyThemeColors } from "@/utils/themeColors";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("composables/useRootInit");

export interface RootInitOptions {
  isDetachedComponent?: boolean;
}

/**
 * 封装根组件通用的初始化逻辑
 */
export function useRootInit(options?: RootInitOptions) {
  // === setup 阶段（同步，顶层调用） ===
  useTheme();

  const appSettingsStore = useAppSettingsStore();

  // === onMounted 阶段（异步） ===
  async function initCommon() {
    try {
      logger.info("开始根组件公共初始化");

      // 1. 初始化主题外观 (壁纸/透明度/模糊)
      await initThemeAppearance(options?.isDetachedComponent ?? false);

      // 3. 应用主题颜色
      if (appSettingsStore.settings.themeColor) {
        applyThemeColors({
          primary: appSettingsStore.settings.themeColor,
          success: appSettingsStore.settings.successColor,
          warning: appSettingsStore.settings.warningColor,
          danger: appSettingsStore.settings.dangerColor,
          info: appSettingsStore.settings.infoColor,
        });
      }

      logger.info("根组件公共初始化完成");
    } catch (error) {
      logger.error("根组件公共初始化失败", error);
    }
  }

  // === onUnmounted 阶段 ===
  function cleanupCommon() {
    cleanupThemeAppearance();
    logger.info("根组件公共资源已清理");
  }

  // 自动注册生命周期
  onMounted(() => initCommon());
  onUnmounted(() => cleanupCommon());

  return { initCommon, cleanupCommon };
}
