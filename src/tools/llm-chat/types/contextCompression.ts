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
 * 上下文压缩核心逻辑
 * 负责压缩检测、摘要生成和压缩节点创建
 */

export interface CompressionResult {
  success: boolean;
  failureReason?: "not-needed" | "request-failed" | "cancelled";
  messageCount?: number;
  savedTokenCount?: number;
}

/** 会话运行态的展示投影；仅成功摘要进入持久化消息树。 */
export interface ContextCompressionTaskView {
  status: "running" | "cancelled" | "failed";
  messageCount: number;
  visible: boolean;
}
