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

/** 元素显示开关的别名, 与 ScreenshotElementOverrides 同义, 便于对话框内表达 */
export type ElementToggles = ScreenshotElementOverrides;

/** 布局覆盖模式: 跟随系统 / 卡片 / 气泡 */
export type LayoutModeChoice = "follow" | "card" | "bubble";

/** 布局覆盖配置 (ShareScreenshotDialog 用) */
export interface LayoutOverrides {
  mode: LayoutModeChoice;
  borderRadius: number | undefined;
  fontSize: number | undefined;
}

/** provide/inject key: 截图元素覆盖 */
export const SCREENSHOT_OVERRIDES_KEY: InjectionKey<
  ComputedRef<ScreenshotElementOverrides>
> = Symbol("screenshotElementOverrides");
