// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { onMounted, onUnmounted, watch } from "vue";
import { useTheme } from "./useTheme";
import { useDark } from "@vueuse/core";
import {
  initThemeAppearance,
  cleanupThemeAppearance,
} from "./useThemeAppearance";
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

  const isDark = useDark();

  /**
   * 应用当前所有主题颜色到 DOM
   */
  const applyCurrentColors = () => {
    const color = appSettingsStore.effectiveThemeColor;

    if (color) {
      applyThemeColors(
        {
          primary: color,
          success: appSettingsStore.settings.successColor,
          warning: appSettingsStore.settings.warningColor,
          danger: appSettingsStore.settings.dangerColor,
          info: appSettingsStore.settings.infoColor,
        },
        isDark.value
      );
    }
  };

  // 监听颜色或主题模式变化并实时应用
  // 处理壁纸提取色、手动设置颜色的实时反馈，以及亮暗模式切换时的派生颜色重新计算
  watch(
    () => [
      appSettingsStore.effectiveThemeColor,
      appSettingsStore.settings.successColor,
      appSettingsStore.settings.warningColor,
      appSettingsStore.settings.dangerColor,
      appSettingsStore.settings.infoColor,
      isDark.value,
    ],
    () => {
      applyCurrentColors();
    },
    { immediate: false } // initCommon 会手动调用一次
  );

  // === onMounted 阶段（异步） ===
  async function initCommon() {
    try {
      logger.info("开始根组件公共初始化");

      // 1. 初始化主题外观 (壁纸/透明度/模糊)
      await initThemeAppearance(options?.isDetachedComponent ?? false);

      // 3. 应用主题颜色
      applyCurrentColors();

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
