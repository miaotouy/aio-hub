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

import { nextTick } from "vue";
import { useSingleNodeExecutor } from "./useSingleNodeExecutor";
import { useToolCalling } from "@/tools/tool-calling/composables/useToolCalling";
import { useToolCallingStore } from "../../stores/toolCallingStore";
import { useSessionManager } from "../session/useSessionManager";
import { useNodeManager } from "../session/useNodeManager";
import { useChatResponseHandler } from "./useChatResponseHandler";
import { useLlmChatStore } from "../../stores/llmChatStore";
import { parseToolRequests } from "@/tools/tool-calling/core/parser";
import { createModuleLogger } from "@/utils/logger";
import {
  runChatOrchestration,
  type OrchestrateParams,
} from "../../core/execution/chatOrchestrator";
export type { OrchestrateParams } from "../../core/execution/chatOrchestrator";

const logger = createModuleLogger("llm-chat/tool-call-orchestrator");

/** Renderer host adapter for the shared Agent execution loop. */
export function useToolCallOrchestrator() {
  const { execute: executeSingleNode } = useSingleNodeExecutor();
  const { resolveProtocol, processCycle, formatCycleResults } =
    useToolCalling();
  const { handleNodeError } = useChatResponseHandler();
  const toolCallingStore = useToolCallingStore();
  const sessionManager = useSessionManager();
  const nodeManager = useNodeManager();

  const orchestrate = async (params: OrchestrateParams): Promise<void> => {
    const store = useLlmChatStore();
    await runChatOrchestration(params, {
      executeSingleNode,
      processCycle,
      formatCycleResults,
      handleNodeError,
      logger,
      parseRequests: (text, protocol) =>
        parseToolRequests(text, resolveProtocol(protocol)),
      requestApproval: ({ sessionId, request, security, signal, agent }) =>
        toolCallingStore.requestApproval(sessionId, request, undefined, {
          signal,
          source: "orchestrator",
          agentId: agent.id,
          agentName: agent.displayName,
          forceApproval: security?.forceApproval === true,
          effectiveArgs: security?.effectiveArgs,
          toolDescription: security?.toolDescription,
        }),
      waitForContextCompression: (sessionId, signal) =>
        store.waitForContextCompression(sessionId, signal),
      getNodePath: nodeManager.getNodePath,
      updateActiveLeaf: nodeManager.updateActiveLeaf,
      persistSession: (session) => {
        const index = store.sessionIndexMap.get(session.id);
        if (index) sessionManager.persistSession(index, session, session.id);
      },
      generateSessionTopic: (sessionId) =>
        store.generateSessionTopic(sessionId),
      beforeToolNode: async () => {
        await nextTick();
      },
    });
  };
  const reparseAndOrchestrate = (params: OrchestrateParams): Promise<void> =>
    orchestrate({ ...params, isReparse: true });
  return { orchestrate, reparseAndOrchestrate };
}
