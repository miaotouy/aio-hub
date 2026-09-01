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
 * 顶部浮动消息状态与调用入口。
 *
 * 该实现保留原 customMessage 的常用调用契约，并由 TopMessageHost 统一渲染，
 * 以支持可暂停的倒计时、可视化进度与点击复制。
 */

import { isVNode, reactive } from "vue";
import type { Component, VNode } from "vue";

export type CustomMessageType =
  "primary" | "success" | "info" | "warning" | "error";

export type CustomMessageContent = string | VNode | (() => VNode);

export interface CustomMessageOptions {
  customClass?: string;
  dangerouslyUseHTMLString?: boolean;
  duration?: number;
  icon?: Component;
  message?: CustomMessageContent;
  onClose?: () => void;
  showClose?: boolean;
  type?: CustomMessageType;
  plain?: boolean;
  offset?: number;
  grouping?: boolean;
  repeatNum?: number;
  /** 覆盖点击消息卡片时写入剪贴板的内容，适合 VNode 消息。 */
  copyText?: string;
}

export type CustomMessageInput = CustomMessageOptions | CustomMessageContent;

export interface FloatingMessage {
  id: string;
  type: CustomMessageType;
  message: CustomMessageContent;
  duration: number;
  remainingMs: number;
  progress: number;
  paused: boolean;
  startedAt: number | null;
  timerVersion: number;
  repeatNum: number;
  showClose: boolean;
  dangerouslyUseHTMLString: boolean;
  customClass?: string;
  icon?: Component;
  plain: boolean;
  offset: number;
  copyText?: string;
  onClose?: () => void;
}

export interface CustomMessageHandler {
  close: () => void;
}

const DEFAULT_DURATION = 3000;
export const DEFAULT_MESSAGE_OFFSET = 54;

export const floatingMessages = reactive<FloatingMessage[]>([]);

function createMessageId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `top-message-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeDuration(duration?: number) {
  if (duration === undefined) return DEFAULT_DURATION;
  return Number.isFinite(duration) ? Math.max(0, duration) : DEFAULT_DURATION;
}

function normalizeInput(input?: CustomMessageInput): CustomMessageOptions {
  if (
    typeof input === "string" ||
    typeof input === "function" ||
    (typeof input === "object" && input !== null && isVNode(input))
  ) {
    return { message: input };
  }

  return input || {};
}

function findGroupedMessage(
  options: CustomMessageOptions,
  type: CustomMessageType
) {
  if (!options.grouping || typeof options.message !== "string") return;

  return floatingMessages.find(
    (message) =>
      message.type === type &&
      typeof message.message === "string" &&
      message.message === options.message
  );
}

export function closeFloatingMessage(id: string) {
  const index = floatingMessages.findIndex((message) => message.id === id);
  if (index === -1) return;

  const [message] = floatingMessages.splice(index, 1);
  message.onClose?.();
}

function showMessage(
  input: CustomMessageInput | undefined,
  forcedType?: CustomMessageType
): CustomMessageHandler {
  const options = normalizeInput(input);
  const type = forcedType || options.type || "info";
  const groupedMessage = findGroupedMessage(options, type);

  if (groupedMessage) {
    groupedMessage.repeatNum += 1;
    groupedMessage.remainingMs = groupedMessage.duration;
    groupedMessage.progress = 1;
    groupedMessage.paused = false;
    groupedMessage.startedAt = null;
    groupedMessage.timerVersion += 1;

    return { close: () => closeFloatingMessage(groupedMessage.id) };
  }

  const duration = normalizeDuration(options.duration);
  const message: FloatingMessage = {
    id: createMessageId(),
    type,
    message: options.message || "",
    duration,
    remainingMs: duration,
    progress: 1,
    paused: false,
    startedAt: null,
    timerVersion: 0,
    repeatNum: options.repeatNum || 1,
    // 强化后的顶部提示默认给出明确的关闭出口；仍可显式关闭该能力。
    showClose: options.showClose ?? true,
    dangerouslyUseHTMLString: options.dangerouslyUseHTMLString ?? false,
    customClass: options.customClass,
    icon: options.icon,
    plain: options.plain ?? false,
    offset: options.offset ?? DEFAULT_MESSAGE_OFFSET,
    copyText: options.copyText,
    onClose: options.onClose,
  };

  floatingMessages.push(message);
  return { close: () => closeFloatingMessage(message.id) };
}

export function closeAllFloatingMessages(type?: CustomMessageType) {
  [...floatingMessages]
    .filter((message) => !type || message.type === type)
    .forEach((message) => closeFloatingMessage(message.id));
}

type CustomMessageApi = {
  (input?: CustomMessageInput): CustomMessageHandler;
  primary: (input?: CustomMessageInput) => CustomMessageHandler;
  success: (input?: CustomMessageInput) => CustomMessageHandler;
  info: (input?: CustomMessageInput) => CustomMessageHandler;
  warning: (input?: CustomMessageInput) => CustomMessageHandler;
  error: (input?: CustomMessageInput) => CustomMessageHandler;
  closeAll: (type?: CustomMessageType) => void;
};

/**
 * 应用统一的顶部浮动提示 API。
 */
export const customMessage: CustomMessageApi = Object.assign(
  (input?: CustomMessageInput) => showMessage(input),
  {
    primary: (input?: CustomMessageInput) => showMessage(input, "primary"),
    success: (input?: CustomMessageInput) => showMessage(input, "success"),
    info: (input?: CustomMessageInput) => showMessage(input, "info"),
    warning: (input?: CustomMessageInput) => showMessage(input, "warning"),
    error: (input?: CustomMessageInput) => showMessage(input, "error"),
    closeAll: closeAllFloatingMessages,
  }
);

export default customMessage;
