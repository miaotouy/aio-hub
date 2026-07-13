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
 * LLM Inspector — 外部代理事件类型
 *
 * 注意：这里只包含 Rust 外部代理向前端 emit 的事件名常量与泛型 wrapper；
 * 内部钩子事件（`InspectorRequestEvent` 等）在 `types/hooks.ts` 中定义。
 */

/** Rust 外部代理事件名 */
export type InspectorEventType =
  | "inspector-request"
  | "inspector-response"
  | "inspector-stream-update";

/** 外部代理事件 wrapper */
export interface InspectorEvent<T = unknown> {
  type: InspectorEventType;
  payload: T;
}
