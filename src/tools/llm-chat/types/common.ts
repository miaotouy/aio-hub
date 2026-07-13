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
