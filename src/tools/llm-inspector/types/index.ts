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
 * LLM Inspector — 类型聚合入口
 *
 * 外部模块统一通过 `import type { X } from "@/tools/llm-inspector/types"` 引入，
 * 内部细分类型按主题分散到同目录下的子文件：
 * - {@link ./records} 请求/响应记录
 * - {@link ./config} 配置与持久化设置
 * - {@link ./stream} 流式数据
 * - {@link ./events} 外部代理事件
 * - {@link ./ui} UI 状态
 * - {@link ./parser} 结构化消息解析
 * - {@link ./hooks} 内部钩子事件契约（独立子模块）
 */

export * from "./records";
export * from "./config";
export * from "./stream";
export * from "./events";
export * from "./ui";
export * from "./parser";
// 注意：hooks.ts 内有较多 InspectorState/Hook 相关类型，外部依然
// 通过显式路径 `types/hooks` 引入（保留旧的 API 公共面），故此处不 re-export
// 以避免与外部模块的导入路径冲突。
