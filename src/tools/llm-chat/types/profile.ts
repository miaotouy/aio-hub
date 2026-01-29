import type { RichTextRendererStyleOptions } from "@/tools/rich-text-renderer/types";

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
   * 历史头像列表（相对文件名）
   * 用于在头像选择器中快速显示，由系统自动维护
   */
  avatarHistory?: string[];

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

  /**
   * 正则管道配置
   * 用于对消息内容进行动态清洗、格式转换等
   */
  regexConfig?: import("./chatRegex").ChatRegexConfig;

  /**
   * 关联的世界书 ID 列表
   */
  worldbookIds?: string[];

  /**
   * 关联的快捷操作组 ID 列表
   */
  quickActionSetIds?: string[];
}

/**
 * 用户档案编辑/创建数据
 * 剔除系统生成的只读字段
 */
export type UserProfileEditData = Omit<UserProfile, "id" | "createdAt" | "lastUsedAt">;

/**
 * 用户档案更新数据（编辑模式）
 * 包含 id 用于标识要更新的档案
 */
export type UserProfileUpdateData = UserProfileEditData & { id: string };

/**
 * 获取默认的用户档案配置
 * 用于初始化表单或创建新档案时的默认值
 */
export const createDefaultUserProfileConfig = (): UserProfileEditData => ({
  name: "",
  displayName: "",
  icon: "",
  avatarHistory: [],
  content: "",
  enabled: true,
  richTextStyleOptions: {},
  richTextStyleBehavior: "follow_agent",
  regexConfig: { presets: [] },
  worldbookIds: [],
  quickActionSetIds: [],
});
