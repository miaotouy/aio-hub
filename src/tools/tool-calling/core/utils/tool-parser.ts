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
 * 工具名称解析工具
 *
 * 提供统一的工具名称解析逻辑，避免重复代码
 */

/**
 * 解析工具目标
 *
 * 将 toolName (格式: toolId_methodName) 解析为 toolId 和 methodName
 *
 * @param toolName - 完整的工具名称，格式为 toolId_methodName
 * @returns 解析结果，包含 toolId 和 methodName；解析失败返回 null
 *
 * @remarks
 * - 使用第一个下划线作为分隔符
 * - toolId 统一使用连字符 (kebab-case)，不含下划线
 * - methodName (command) 可能包含下划线
 *
 * @example
 * ```ts
 * parseToolTarget('data-filter_filterData')
 * // => { toolId: 'data-filter', methodName: 'filterData' }
 *
 * parseToolTarget('tool-calling_get_task_status')
 * // => { toolId: 'tool-calling', methodName: 'get_task_status' }
 *
 * parseToolTarget('invalid')
 * // => null
 * ```
 */
export function parseToolTarget(
  toolName: string
): { toolId: string; methodName: string } | null {
  const separatorIndex = toolName.indexOf("_");

  // 验证分隔符位置
  if (separatorIndex <= 0 || separatorIndex >= toolName.length - 1) {
    return null;
  }

  return {
    toolId: toolName.slice(0, separatorIndex),
    methodName: toolName.slice(separatorIndex + 1),
  };
}
