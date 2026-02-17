/**
 * 消息角色
 */
export type MessageRole = "user" | "assistant" | "system" | "tool";

/**
 * 发送到 LLM API 的消息角色（不包含工具消息）
 */
export type ApiMessageRole = Exclude<MessageRole, "tool">;

/**
 * 消息生成状态
 */
export type MessageStatus = "generating" | "complete" | "error";

/**
 * 消息类型
 *
 * 'message' 表示普通消息。
 * 其他字符串值对应一个已注册的锚点ID (例如 'chat_history', 'user_profile')。
 * 其有效性在运行时通过 `useAnchorRegistry` 进行检查。
 */
export type MessageType = string;
