/**
 * 消息角色
 */
export type MessageRole = "user" | "assistant" | "system";

/**
 * 消息生成状态
 */
export type MessageStatus = "generating" | "complete" | "error";

/**
 * 消息类型
 * - message: 普通消息
 * - chat_history: 历史消息占位符（用于标记实际会话消息的插入位置）
 * - user_profile: 用户档案占位符（用于标记用户档案内容的插入位置）
 */
export type MessageType = "message" | "chat_history" | "user_profile";

/**
 * 头像模式
 * - path: icon 字段是一个完整的路径或 emoji
 * - builtin: icon 字段是内置于 Agent/Profile 目录下的相对文件名
 */
export type IconMode = "path" | "builtin";