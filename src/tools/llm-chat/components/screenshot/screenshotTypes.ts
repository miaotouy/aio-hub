import type { InjectionKey, ComputedRef } from "vue";
import type { BubbleLayoutOverride } from "../../composables/ui/useMessageLayout";

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

/**
 * 布局覆盖配置 (ShareScreenshotDialog 用)。
 * - 气泡相关字段 (mode / borderRadius) 走 useMessageLayout 的合并逻辑
 * - fontSize 走 CSS 变量 (--message-font-size), 由 MessageContent /
 *   ToolCallMessage 通过 var(...) 兜底读取
 */
export interface LayoutOverrides extends BubbleLayoutOverride {
  /** 临时覆盖字体大小 (px), undefined 表示沿用系统设置 */
  fontSize: number | undefined;
}

/** provide/inject key: 截图元素覆盖 */
export const SCREENSHOT_OVERRIDES_KEY: InjectionKey<
  ComputedRef<ScreenshotElementOverrides>
> = Symbol("screenshotElementOverrides");