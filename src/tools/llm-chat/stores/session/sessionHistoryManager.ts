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

import { computed, type ComputedRef, type Ref } from "vue";
import type { ChatSessionDetail, ChatSessionIndex } from "../../types/session";
import { useSessionNodeHistory } from "../../composables/session/useSessionNodeHistory";
import { useSessionManager } from "../../composables/session/useSessionManager";
import { BranchNavigator } from "../../utils/BranchNavigator";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("llm-chat/session-history");

type HistoryManager = ReturnType<typeof useSessionNodeHistory>;

interface HistoryState {
  sessionIndexMap: Ref<Map<string, ChatSessionIndex>>;
  sessionDetailMap: Ref<Map<string, ChatSessionDetail>>;
  currentSessionId: Ref<string | null>;
}

export function createSessionHistoryManager(state: HistoryState) {
  const historyManagerMap = new Map<string, HistoryManager>();

  function getHistoryManager(sessionId?: string | null): HistoryManager | null {
    const targetSessionId = sessionId || state.currentSessionId.value;
    if (!targetSessionId) return null;

    let manager = historyManagerMap.get(targetSessionId);
    if (!manager) {
      const detailRef = computed(
        () => state.sessionDetailMap.value.get(targetSessionId) || null
      );
      manager = useSessionNodeHistory(
        detailRef as Ref<ChatSessionDetail | null>
      );
      historyManagerMap.set(targetSessionId, manager);
    }
    return manager;
  }

  function clearHistory(sessionId?: string | null): void {
    getHistoryManager(sessionId)?.clearHistory();
  }

  function cleanupSession(sessionId: string): void {
    historyManagerMap.delete(sessionId);
  }

  function persistHistoryMutation(detail: ChatSessionDetail): void {
    BranchNavigator.ensureValidActiveLeaf(detail);
    const index = state.sessionIndexMap.value.get(detail.id);
    if (!index) return;

    const sessionManager = useSessionManager();
    sessionManager.updateMessageCount(
      detail.id,
      detail.nodes,
      state.sessionIndexMap.value
    );
    sessionManager.updateSessionDisplayAgent(
      detail.id,
      detail,
      state.sessionIndexMap.value
    );
    sessionManager.persistSession(index, detail, state.currentSessionId.value);
  }

  function undo(sessionId?: string | null): void {
    const targetSessionId = sessionId || state.currentSessionId.value;
    if (!targetSessionId) return;

    const detail = state.sessionDetailMap.value.get(targetSessionId);
    const manager = getHistoryManager(targetSessionId);
    if (!detail || !manager?.canUndo.value) return;

    manager.undo();
    persistHistoryMutation(detail);
  }

  function redo(sessionId?: string | null): void {
    const targetSessionId = sessionId || state.currentSessionId.value;
    if (!targetSessionId) return;

    const detail = state.sessionDetailMap.value.get(targetSessionId);
    const manager = getHistoryManager(targetSessionId);
    if (!detail || !manager?.canRedo.value) return;

    manager.redo();
    persistHistoryMutation(detail);
  }

  function jumpToHistory(index: number, sessionId?: string | null): void {
    const targetSessionId = sessionId || state.currentSessionId.value;
    if (!targetSessionId) return;

    const detail = state.sessionDetailMap.value.get(targetSessionId);
    const manager = getHistoryManager(targetSessionId);
    if (!detail || !manager) return;

    manager.jumpToState(index);
    persistHistoryMutation(detail);
    logger.info(`已跳转到历史记录索引 ${index}`, {
      sessionId: targetSessionId,
    });
  }

  const currentHistoryManager = computed(() =>
    getHistoryManager(state.currentSessionId.value)
  );
  const canUndo: ComputedRef<boolean> = computed(
    () => currentHistoryManager.value?.canUndo.value ?? false
  );
  const canRedo: ComputedRef<boolean> = computed(
    () => currentHistoryManager.value?.canRedo.value ?? false
  );

  return {
    getHistoryManager,
    clearHistory,
    cleanupSession,
    undo,
    redo,
    jumpToHistory,
    canUndo,
    canRedo,
  };
}
