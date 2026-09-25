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
 * 伴生会话只读视图状态（进程内单例）
 *
 * 对应设计文档 §6.2（Level 2 伴生视窗）与 §12.6 的 T2：
 * 在不切换主会话选中态的前提下，按 childSessionId 读取子会话消息，
 * 以只读 MessageList 呈现完整的执行流。
 *
 * 数据来源全部走 llmChatStore 的按会话 id 只读 API（T1 契约），
 * 本 composable 不改变 currentSessionId，也不写任何会话数据。
 */

import { ref, shallowRef } from "vue";
import { createModuleLogger } from "@/utils/logger";
import {
  backgroundTaskRegistry,
  type BackgroundTaskSnapshot,
} from "@/services/background-tasks";
import { useLlmChatStore } from "@/tools/llm-chat/stores/llmChatStore";
import { useChatCompanionDock } from "@/tools/llm-chat/composables/ui/useChatCompanionDock";
import type {
  ChatMessageNode,
  ChatSessionDetail,
  ChatSessionIndex,
} from "@/tools/llm-chat/types";

/** 伴生视图呈现形态：侧栏伴生栏 / 画中画悬浮窗 */
export type CompanionSessionMode = "sheet" | "pip";

/** 打开伴生视图的入参 */
export interface OpenCompanionOptions {
  /** 关联的后台任务 ID */
  taskId: string;
  /** 子 Agent 的完整聊天会话 ID */
  childSessionId: string;
  /** 期望的呈现形态；省略时沿用上一次形态 */
  mode?: CompanionSessionMode;
}

// ==================== 模块级单例状态 ====================

/** 伴生视图是否可见 */
const isOpen = ref(false);
/** 当前透视的后台任务 ID */
const targetTaskId = ref<string | null>(null);
/** 当前透视的子会话 ID */
const childSessionId = ref<string | null>(null);
/** 呈现形态 */
const mode = ref<CompanionSessionMode>("sheet");
/** 任务快照（用于标题的身份与状态摘要） */
const taskSnapshot = shallowRef<BackgroundTaskSnapshot | null>(null);
const sessionIndex = shallowRef<ChatSessionIndex | null>(null);
const sessionDetail = shallowRef<ChatSessionDetail | null>(null);
const messages = shallowRef<ChatMessageNode[]>([]);
const isLoading = ref(false);
/** 数据加载失败时的可读提示；为空表示正常 */
const errorMessage = ref<string | null>(null);

const logger = createModuleLogger("companion-session");
const DOCK_SOURCE_ID = "companion-session";
let currentLoadVersion = 0;
const { closeDock } = useChatCompanionDock();

async function loadSessionData(): Promise<void> {
  const thisVersion = ++currentLoadVersion;
  const sessionId = childSessionId.value;
  if (!sessionId) {
    sessionIndex.value = null;
    sessionDetail.value = null;
    messages.value = [];
    errorMessage.value = null;
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  errorMessage.value = null;
  try {
    const store = useLlmChatStore();
    const detail = await store.ensureSessionDetailLoaded(sessionId);
    if (
      thisVersion !== currentLoadVersion ||
      childSessionId.value !== sessionId
    ) {
      logger.debug("丢弃已过期的伴生会话异步加载结果", {
        sessionId,
        thisVersion,
        currentLoadVersion,
      });
      return;
    }

    if (!detail) {
      sessionIndex.value = null;
      sessionDetail.value = null;
      messages.value = [];
      errorMessage.value = "子会话数据加载失败，可稍后重试或跳转到完整会话";
      return;
    }
    sessionIndex.value = store.getSessionIndexById(sessionId);
    sessionDetail.value = detail;
    messages.value = [...store.getActivePathBySessionId(sessionId)];
  } catch (error) {
    if (
      thisVersion !== currentLoadVersion ||
      childSessionId.value !== sessionId
    ) {
      return;
    }
    sessionIndex.value = null;
    sessionDetail.value = null;
    messages.value = [];
    errorMessage.value =
      error instanceof Error ? error.message : "子会话数据加载失败，请稍后重试";
  } finally {
    if (
      thisVersion === currentLoadVersion &&
      childSessionId.value === sessionId
    ) {
      isLoading.value = false;
    }
  }
}

function syncSnapshot(): void {
  taskSnapshot.value = targetTaskId.value
    ? (backgroundTaskRegistry.getSnapshot(targetTaskId.value) ?? null)
    : null;
}

/**
 * 刷新任务快照与子会话消息。
 *
 * 由视图在任务变更事件或手动重试时调用；不改变主会话选中态。
 */
async function refresh(): Promise<void> {
  if (!isOpen.value) return;
  syncSnapshot();
  await loadSessionData();
}

/** 打开伴生视图并按需装载子会话数据（加载失败只给出可读提示，不抛出） */
async function openCompanion(options: OpenCompanionOptions): Promise<void> {
  targetTaskId.value = options.taskId;
  childSessionId.value = options.childSessionId;
  if (options.mode) {
    mode.value = options.mode;
  }
  isOpen.value = true;
  syncSnapshot();
  await loadSessionData();
}

/** 关闭伴生视图（保留已装载数据，便于下次打开时复用） */
function closeCompanion(): void {
  currentLoadVersion += 1;
  isLoading.value = false;
  isOpen.value = false;
  closeDock(DOCK_SOURCE_ID);
}

/** 打开或收起指定任务的指定伴生视图形态。 */
function toggleCompanion(options: Required<OpenCompanionOptions>): void {
  if (
    isOpen.value &&
    targetTaskId.value === options.taskId &&
    mode.value === options.mode
  ) {
    closeCompanion();
    return;
  }
  void openCompanion(options);
}

/** 在侧栏伴生栏与画中画之间切换 */
function toggleMode(): void {
  mode.value = mode.value === "sheet" ? "pip" : "sheet";
  if (mode.value === "pip") {
    closeDock(DOCK_SOURCE_ID);
  }
}

export interface UseCompanionSessionReturn {
  isOpen: typeof isOpen;
  targetTaskId: typeof targetTaskId;
  childSessionId: typeof childSessionId;
  mode: typeof mode;
  taskSnapshot: typeof taskSnapshot;
  sessionIndex: typeof sessionIndex;
  sessionDetail: typeof sessionDetail;
  messages: typeof messages;
  isLoading: typeof isLoading;
  errorMessage: typeof errorMessage;
  openCompanion: typeof openCompanion;
  closeCompanion: typeof closeCompanion;
  toggleMode: typeof toggleMode;
  toggleCompanion: typeof toggleCompanion;
  refresh: typeof refresh;
}

/**
 * 获取伴生会话视图的单例状态与操作入口。
 *
 * 所有调用方共享同一份状态，因此任务中心、派遣卡片与标题栏胶囊
 * 始终打开同一个伴生视图实例。
 */
export function useCompanionSession(): UseCompanionSessionReturn {
  return {
    isOpen,
    targetTaskId,
    childSessionId,
    mode,
    taskSnapshot,
    sessionIndex,
    sessionDetail,
    messages,
    isLoading,
    errorMessage,
    openCompanion,
    closeCompanion,
    toggleMode,
    toggleCompanion,
    refresh,
  };
}
