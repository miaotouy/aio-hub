export type NotificationType = "info" | "success" | "warning" | "error" | "system";

export interface NotificationMetadata {
  path?: string; // 点击后跳转的路由路径
  action?: string; // 自定义操作标识
  data?: Record<string, any>; // 任意附加数据
}

export interface Notification {
  id: string; // 唯一标识符
  title: string; // 消息标题
  content: string; // 消息正文
  type: NotificationType; // 消息类型
  timestamp: number; // 发送时间戳
  read: boolean; // 已读状态
  source?: string; // 来源标识（如 'llm-chat', 'system'）
  metadata?: NotificationMetadata; // 附加数据
}

export interface NotificationState {
  notifications: Notification[];
  centerVisible: boolean;
}