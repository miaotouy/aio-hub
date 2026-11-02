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
 * 后台任务模块统一出口
 *
 * Phase 1（可观察任务壳）：提供任务快照类型、消息来源类型与
 * 内存 registry 单例。UI 只读任务列表/详情与 assistant.ask 埋点
 * 均从这里导入。
 */

export * from "./types";
export { BackgroundTaskRegistry, backgroundTaskRegistry } from "./registry";
export {
  BackgroundTaskDeliveryQueue,
  backgroundTaskDeliveryQueue,
  type ListQueuedTaskMessagesFilter,
  type ListTaskNotificationsFilter,
} from "./deliveryQueue";
export {
  BackgroundTaskApprovalBridgeImpl,
  backgroundTaskApprovalBridge,
} from "./approvalBridge";
