import type { RichTextRendererStyleOptions } from '@/tools/rich-text-renderer/types';
import type { IconMode } from './common';

/**
 * 用户档案 (User Profile)
 * 定义用户在对话中扮演的角色
 */
export interface UserProfile {
  /**
   * 档案的唯一标识符
   */
  id: string;

  /**
   * 档案名称（用作唯一标识符的一部分，也是宏替换的 ID）
   */
  name: string;

  /**
   * 显示名称（UI 显示优先使用，不影响宏替换）
   */
  displayName?: string;

  /**
   * 档案图标（emoji、图标路径或相对文件名）
   */
  icon?: string;

  /**
   * 图标模式
   * @default 'path'
   */
  iconMode?: IconMode;

  /**
   * 档案内容（描述性文本）
   */
  content: string;

  /**
   * 是否启用（默认为 true）
   * 禁用的档案在选择列表中不显示
   */
  enabled?: boolean;

  /**
   * 创建时间
   */
  createdAt: string;

  /**
   * 最后使用时间
   */
  lastUsedAt?: string;

  /**
   * 富文本渲染器样式配置
   * 用于自定义该用户档案下，用户消息的 Markdown 样式
   */
  richTextStyleOptions?: RichTextRendererStyleOptions;

  /**
   * 消息样式行为
   * - follow_agent (默认): 跟随当前智能体的样式配置
   * - custom: 使用用户档案自己独立的样式配置
   */
  richTextStyleBehavior?: "follow_agent" | "custom";
}