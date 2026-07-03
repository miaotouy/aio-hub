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

export type NotificationType =
  | "info"
  | "success"
  | "warning"
  | "error"
  | "system";

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
