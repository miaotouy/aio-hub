/**
 * CSS 覆盖功能的相关类型定义
 */

/**
 * 内置的 CSS 预设
 */
export interface CssPreset {
  id: string; // 唯一标识符
  name: string; // 显示名称
  description: string; // 描述
  content: string; // CSS 内容
}

/**
 * 存储在用户设置中的 CSS 配置
 */
export interface UserCssSettings {
  enabled: boolean; // 是否启用自定义 CSS
  basedOnPresetId: string | null; // 基于哪个预设的 ID，null 表示纯自定义
  customContent: string; // 用户的自定义 CSS 内容
}