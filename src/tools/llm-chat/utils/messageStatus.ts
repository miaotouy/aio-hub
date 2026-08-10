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

import type {
  ChatMessageNode,
  MessageDisplayStatus,
  MessageStatus,
} from "../types";

export interface MessageStatusPresentation {
  status: MessageDisplayStatus;
  label: string;
  detail?: string;
}

/**
 * 将消息持久化状态和兼容字段转换为 UI 展示状态。
 *
 * `pending` 是旧版链式队列状态，`isQueued` 是现有队列调度辅助字段，
 * 两者都必须继续被识别为 queued，避免旧会话加载后丢失状态提示。
 */
export function resolveMessageDisplayStatus(
  message: ChatMessageNode
): MessageDisplayStatus | null {
  const rawStatus = message.status as string;
  const metadata = message.metadata;

  if (
    metadata?.isQueued === true ||
    rawStatus === "pending" ||
    message.status === "queued"
  ) {
    return "queued";
  }

  const hasPendingToolApproval =
    metadata?.toolCalls?.some(
      (toolCall) => toolCall.status === "awaiting_approval"
    ) ||
    metadata?.toolCallsRequested?.some(
      (toolCall) => toolCall.status === "awaiting_approval"
    );

  if (message.status === "waiting" || hasPendingToolApproval) {
    return "waiting";
  }

  if (message.status === "error") {
    return "error";
  }

  if (message.status === "generating") {
    return "generating";
  }

  if (
    message.status === "complete" &&
    Boolean(metadata?.emptyResponseDiagnostic)
  ) {
    return "abnormal";
  }

  return null;
}

export function getMessageStatusPresentation(
  message: ChatMessageNode
): MessageStatusPresentation | null {
  const status = resolveMessageDisplayStatus(message);
  if (!status) return null;

  const presentation: Record<
    MessageDisplayStatus,
    Omit<MessageStatusPresentation, "status" | "detail">
  > = {
    generating: { label: "生成中" },
    waiting: { label: "等待" },
    queued: { label: "排队" },
    complete: { label: "已完成" },
    error: { label: "错误" },
    abnormal: { label: "异常回复" },
  };

  const detail =
    status === "error"
      ? message.metadata?.error
      : status === "abnormal"
        ? message.metadata?.emptyResponseDiagnostic
        : undefined;

  return { status, ...presentation[status], detail };
}

/** 仅用于需要判断消息是否仍处于可执行状态的调用方。 */
export function isMessageGeneratingStatus(status: MessageStatus): boolean {
  return status === "generating" || status === "waiting";
}
