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
