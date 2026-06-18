import type { InjectionKey, ComputedRef } from "vue";

/** 折叠策略 */
export type CollapseStrategy =
  | "preserve"
  | "config"
  | "override-expand"
  | "override-collapse";

/** 截图元素显示覆盖配置 */
export interface ScreenshotElementOverrides {
  showAvatar: boolean;
  showTimestamp: boolean;
  showTokenCount: boolean;
  showTokenCountForBlocks: boolean;
  showCharCount: boolean;
  showModelInfo: boolean;
  showPerformanceMetrics: boolean;
}

/** provide/inject key: 截图元素覆盖 */
export const SCREENSHOT_OVERRIDES_KEY: InjectionKey<
  ComputedRef<ScreenshotElementOverrides>
> = Symbol("screenshotElementOverrides");
