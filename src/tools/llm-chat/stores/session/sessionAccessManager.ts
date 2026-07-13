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

import type { Ref } from "vue";
import type { ChatMessageNode } from "../../types/message";
import type { ChatSessionDetail, ChatSessionIndex } from "../../types/session";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("llm-chat/session-access");

export interface SessionMaps {
  sessionIndexMap: Ref<Map<string, ChatSessionIndex>>;
  sessionDetailMap: Ref<Map<string, ChatSessionDetail>>;
  currentSessionId: Ref<string | null>;
}

export interface ResolvedSessionContext {
  sessionId: string;
  index: ChatSessionIndex;
  detail: ChatSessionDetail;
}

export function createSessionAccessManager(state: SessionMaps) {
  function resolveSessionContext(
    sessionId?: string | null
  ): ResolvedSessionContext {
    const targetSessionId = sessionId || state.currentSessionId.value;
    if (!targetSessionId) throw new Error("请先创建或选择一个会话");

    const index = state.sessionIndexMap.value.get(targetSessionId);
    const detail = state.sessionDetailMap.value.get(targetSessionId);
    if (!index || !detail) throw new Error("请先创建或选择一个会话");

    return { sessionId: targetSessionId, index, detail };
  }

  function getSessionDetail(sessionId: string): ChatSessionDetail | null {
    return state.sessionDetailMap.value.get(sessionId) || null;
  }

  function getSessionIndex(sessionId: string): ChatSessionIndex | null {
    return state.sessionIndexMap.value.get(sessionId) || null;
  }

  function findSessionIdByNodeId(nodeId: string): string | null {
    for (const [sessionId, detail] of state.sessionDetailMap.value.entries()) {
      if (detail.nodes?.[nodeId]) return sessionId;
    }
    return null;
  }

  function resolveSessionIdForNode(
    nodeId: string,
    explicitSessionId?: string | null
  ): string | null {
    return (
      explicitSessionId ||
      findSessionIdByNodeId(nodeId) ||
      state.currentSessionId.value
    );
  }

  function getActivePath(sessionId?: string | null): ChatMessageNode[] {
    let detail: ChatSessionDetail | null;
    try {
      detail = resolveSessionContext(sessionId).detail;
    } catch {
      return [];
    }

    if (!detail.nodes || !detail.activeLeafId) return [];

    const path: ChatMessageNode[] = [];
    let currentId: string | null = detail.activeLeafId;

    while (currentId !== null) {
      const node: ChatMessageNode | undefined = detail.nodes[currentId];
      if (!node) {
        logger.warn("活动路径中断：节点不存在", {
          sessionId: detail.id,
          nodeId: currentId,
        });
        break;
      }

      path.unshift(node);
      currentId = node.parentId;
    }

    return path.filter((node) => node.id !== detail.rootNodeId);
  }

  return {
    resolveSessionContext,
    resolveSessionIdForNode,
    getSessionDetail,
    getSessionIndex,
    getActivePath,
    findSessionIdByNodeId,
  };
}
