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
 * 任务 ID 提取工具
 *
 * 提供统一的任务 ID 提取逻辑，供多个模块复用
 */

/**
 * 从消息内容中提取 taskId
 *
 * @param content - 消息内容（通常是工具调用的返回结果）
 * @returns 提取到的 taskId，如果不存在则返回 null
 *
 * @example
 * ```ts
 * extractTaskId('{"type":"async_task","taskId":"task_123"}')
 * // => "task_123"
 *
 * extractTaskId('普通文本内容')
 * // => null
 * ```
 */
export function extractTaskId(content: string): string | null {
  if (!content || typeof content !== "string") {
    return null;
  }

  try {
    // 尝试解析为 JSON
    const parsed = JSON.parse(content);

    // 检查是否包含 taskId 字段
    if (parsed && typeof parsed === "object" && "taskId" in parsed) {
      return parsed.taskId;
    }

    // 检查是否是异步任务响应格式
    if (parsed && parsed.type === "async_task" && parsed.taskId) {
      return parsed.taskId;
    }
  } catch {
    // 不是 JSON，尝试正则匹配
    const match = content.match(/"taskId"\s*:\s*"([^"]+)"/);
    if (match) {
      return match[1];
    }
  }

  return null;
}
