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

import { useChatSettings } from "../settings/useChatSettings";
import { useLlmChatStore } from "../../stores/llmChatStore";
import { useLlmRequest } from "@/composables/useLlmRequest";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useChatResponseHandler } from "./useChatResponseHandler";
import { useNodeManager } from "../session/useNodeManager";
import { useContextPipelineStore } from "../../stores/contextPipelineStore";
import { useTranscriptionManager } from "../features/useTranscriptionManager";
import { useContextCompressor } from "../features/useContextCompressor";
import { useAnchorRegistry } from "../ui/useAnchorRegistry";
import { buildEffectiveParameters } from "../../config/parameter-config";
import { createModuleLogger } from "@/utils/logger";
import { isAbortError } from "@/llm-apis/common";

import {
  loadSnapshotSettings,
  snapshotSettings,
  requestSnapshots,
  reportSnapshotError,
} from "../../services/requestSnapshots";
import { createRequestSnapshotRecorder } from "../../services/requestSnapshotRecorder";

import type { SingleNodeExecuteParams } from "../../core/execution/types";
export type {
  SingleNodeExecuteParams,
  SingleNodeExecuteResult,
} from "../../core/execution/types";

import {
  executeSingleNode,
  type SingleNodeExecutionPorts,
} from "../../core/execution/singleNodeExecutor";

const logger = createModuleLogger("llm-chat/single-node-executor");

/** Renderer adapter for the shared single-node execution path. */
export function useSingleNodeExecutor() {
  const responseHandler = useChatResponseHandler();
  const { checkAndCompress } = useContextCompressor();
  const { sendRequest } = useLlmRequest();
  const contextPipelineStore = useContextPipelineStore();
  const nodeManager = useNodeManager();

  const execute = (params: SingleNodeExecuteParams) => {
    const { settings } = useChatSettings();
    const chatStore = useLlmChatStore();
    const { getProfileById } = useLlmProfiles();
    const ports: SingleNodeExecutionPorts = {
      getSettings: () => settings.value,
      getSessionIndex: (id) => chatStore.sessionIndexMap.get(id),
      getProfileById,
      buildEffectiveParameters,
      getAvailableAnchors: () => useAnchorRegistry().getAvailableAnchors(),
      loadWorldbooks: async (ids) => {
        if (import.meta.env.SSR) return undefined;
        const { useWorldbookStore } =
          await import("@/tools/st-worldbook-manager/stores/worldbookStore");
        return useWorldbookStore().getEntriesForAgent(ids);
      },
      ensureTranscriptions: (...args) =>
        useTranscriptionManager().ensureTranscriptions(...args),
      executePipeline: (context) =>
        contextPipelineStore.executePipeline(context),
      sendRequest,
      ...responseHandler,
      checkAndCompress,
      isAbortError,
      nodes: nodeManager,
      snapshots: {
        loadSettings: async () => {
          await loadSnapshotSettings();
          return snapshotSettings;
        },
        prepare: (id) => requestSnapshots.prepare(id),
        reportError: reportSnapshotError,
        createRecorder: createRequestSnapshotRecorder,
      },
      logger,
    };
    return executeSingleNode(params, ports);
  };
  return { execute };
}
