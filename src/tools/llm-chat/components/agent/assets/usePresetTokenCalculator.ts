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

import { ref, computed, watch, type Ref, type ComputedRef } from "vue";
import { createModuleLogger } from "@/utils/logger";
import { useDebounceFn } from "@vueuse/core";
import { useLlmChatStore } from "../../../stores/llmChatStore";
import type { ChatMessageNode, UserProfile } from "../../../types";
import type { AgentAsset } from "../../../types/agent";
import {
  MacroProcessor,
  createMacroContext,
  extractContextFromSession,
} from "../../../macro-engine";
import { useAnchorRegistry } from "../../../composables/ui/useAnchorRegistry";
import { calculateShortHash } from "@/utils/hash";
import { tokenCalculatorEngine } from "@/tools/token-calculator/composables/useTokenCalculator";
import { getActiveModelProperties } from "@/config/model-metadata";

const logger = createModuleLogger("llm-chat/usePresetTokenCalculator");

export function usePresetTokenCalculator(options: {
  localMessages: Ref<ChatMessageNode[]>;
  modelId: Ref<string>;
  agentName: Ref<string>;
  effectiveUserProfile: ComputedRef<UserProfile | undefined>;
  agent: Ref<any>;
  onSyncNeeded: () => void;
}) {
  const {
    localMessages,
    modelId,
    agentName,
    effectiveUserProfile,
    agent,
    onSyncNeeded,
  } = options;
  const chatStore = useLlmChatStore();
  const anchorRegistry = useAnchorRegistry();

  const messageTokens = ref<Map<string, number>>(new Map());
  const isCalculatingTokens = ref(false);

  function isTemplateAnchorType(type?: string): boolean {
    if (!type) return false;
    return anchorRegistry.getAnchorById(type)?.hasTemplate === true;
  }

  function isPurePlaceholderAnchorType(type?: string): boolean {
    if (!type || type === "message") return false;
    const anchor = anchorRegistry.getAnchorById(type);
    return !!anchor && !anchor.hasTemplate;
  }

  function getAnchorDef(type?: string) {
    return type ? anchorRegistry.getAnchorById(type) : undefined;
  }

  async function runWithConcurrency<T>(
    tasks: (() => Promise<T>)[],
    concurrency: number
  ): Promise<T[]> {
    const results: T[] = [];
    let index = 0;
    async function runNext(): Promise<void> {
      while (index < tasks.length) {
        const i = index++;
        results[i] = await tasks[i]();
      }
    }
    await Promise.all(
      Array(Math.min(concurrency, tasks.length))
        .fill(null)
        .map(() => runNext())
    );
    return results;
  }

  const calculateAllTokens = async () => {
    if (!modelId.value || localMessages.value.length === 0) {
      messageTokens.value = new Map();
      return;
    }

    isCalculatingTokens.value = true;
    const newTokens = new Map<string, number>();
    let hasChanges = false;

    const baseContext = createMacroContext({
      userName: effectiveUserProfile.value?.name || "User",
      charName: agentName.value || "Assistant",
      userProfile: effectiveUserProfile.value || undefined,
      agent: agent.value as any,
    });

    if (chatStore.currentFullSession) {
      const sessionContext = extractContextFromSession(
        chatStore.currentFullSession.index,
        chatStore.currentFullSession.detail,
        agent.value as any,
        effectiveUserProfile.value || undefined
      );
      Object.assign(baseContext, sessionContext);
    }

    const macroProcessor = new MacroProcessor();
    const tokenizerResult = await tokenCalculatorEngine.calculateTokens(
      "",
      modelId.value
    );
    const tokenizerName = tokenizerResult.tokenizerName;

    // 获取模型元数据，用于估算附件 token
    const modelMetadata = modelId.value
      ? getActiveModelProperties(modelId.value)
      : undefined;
    const visionTokenCost = modelMetadata?.capabilities?.visionTokenCost;
    const agentAssets: AgentAsset[] = agent.value?.assets || [];

    const tasks = localMessages.value.map((message) => async () => {
      if (isPurePlaceholderAnchorType(message.type) || !message.isEnabled)
        return;
      try {
        let template = message.content;
        if (isTemplateAnchorType(message.type) && !template) {
          template = getAnchorDef(message.type)?.defaultTemplate || "";
        }
        if (
          !template &&
          (!message.presetAttachments || message.presetAttachments.length === 0)
        )
          return;

        // 构建包含附件信息的 hash key
        const attachmentIds = (message.presetAttachments || [])
          .map((ref) => ref.assetId)
          .sort()
          .join(",");
        const contextKey = `${effectiveUserProfile.value?.id || "default"}:${agentName.value}`;
        const rawHashKey = `v4:${tokenizerName}:${template || ""}:${contextKey}:${attachmentIds}`;
        const contentHash = `v4:${tokenizerName}:${await calculateShortHash(rawHashKey)}`;

        if (
          message.metadata?.lastCalcHash === contentHash &&
          message.metadata?.contentTokens !== undefined
        ) {
          newTokens.set(message.id, message.metadata.contentTokens);
          return;
        }

        // 计算文本 token
        let textTokenCount = 0;
        if (template) {
          const processed = await macroProcessor.process(template, baseContext);
          const result = await tokenCalculatorEngine.calculateTokens(
            processed.output,
            modelId.value
          );
          textTokenCount = result.count;
        }

        // 估算预设附件 token
        let attachmentTokenCount = 0;
        if (message.presetAttachments && message.presetAttachments.length > 0) {
          for (const ref of message.presetAttachments) {
            const agentAsset = agentAssets.find((a) => a.id === ref.assetId);
            if (!agentAsset) continue;

            if (agentAsset.type === "image") {
              if (visionTokenCost) {
                // 图片没有精确尺寸信息，使用默认估算
                attachmentTokenCount +=
                  tokenCalculatorEngine.calculateImageTokens(
                    1024,
                    1024,
                    visionTokenCost
                  );
              } else {
                attachmentTokenCount += 1000; // 无视觉能力时的粗略估算
              }
            } else if (agentAsset.type === "audio") {
              // 音频默认按 30 秒估算
              attachmentTokenCount +=
                tokenCalculatorEngine.calculateAudioTokens(30);
            } else if (agentAsset.type === "video") {
              // 视频默认按 30 秒估算
              attachmentTokenCount +=
                tokenCalculatorEngine.calculateVideoTokens(30);
            } else {
              // 文档等其他类型
              attachmentTokenCount += 500;
            }
          }
        }

        const totalTokenCount = textTokenCount + attachmentTokenCount;
        newTokens.set(message.id, totalTokenCount);

        if (!message.metadata) message.metadata = {};
        if (
          message.metadata.contentTokens !== totalTokenCount ||
          message.metadata.lastCalcHash !== contentHash
        ) {
          message.metadata.contentTokens = totalTokenCount;
          message.metadata.lastCalcHash = contentHash;
          hasChanges = true;
        }
      } catch (error) {
        logger.error(
          `Failed to calculate tokens for message ${message.id}`,
          error as Error
        );
      }
    });

    await runWithConcurrency(tasks, 10);
    messageTokens.value = newTokens;
    isCalculatingTokens.value = false;

    if (hasChanges) onSyncNeeded();
  };

  const debouncedCalculateTokens = useDebounceFn(calculateAllTokens, 300);

  const totalTokens = computed(() => {
    let total = 0;
    for (const count of messageTokens.value.values()) total += count;
    return total;
  });

  watch(
    () =>
      [localMessages.value, modelId.value, effectiveUserProfile.value] as const,
    () => {
      if (modelId.value) debouncedCalculateTokens();
    },
    { deep: true, immediate: true }
  );

  return { messageTokens, isCalculatingTokens, totalTokens };
}
