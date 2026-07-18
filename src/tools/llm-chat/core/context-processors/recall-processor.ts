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

import type { ContextProcessor, PipelineContext } from "../../types/pipeline";
import type { ProcessableMessage } from "../../types/context";
import { resolvePlaceholderRetrieval } from "@/tools/recall/services/api";
import type { RecallRetrievalRequest } from "@/tools/recall/types/retrieval";
import {
  scanRecallPlaceholders,
  serializeRecallPlaceholder,
} from "./recall-placeholder";

const LEGACY_RECALL_ENVELOPE = /【kb(?:::[^【】]*)?】/g;

function isLegacyRecallEnvelope(raw: string): boolean {
  return raw.startsWith("【kb");
}

function insertAutoPlaceholders(
  messages: ProcessableMessage[],
  raws: string[],
  position: "context_head" | "before_last_user"
) {
  const content = raws.join("\n");
  if (position === "before_last_user") {
    const lastUserIndex = messages
      .map((message) => message.role)
      .lastIndexOf("user");
    const previous =
      lastUserIndex > 0 ? messages[lastUserIndex - 1] : undefined;
    if (previous?.role === "system" && typeof previous.content === "string") {
      previous.content = `${previous.content.trimEnd()}\n\n${content}`;
      return;
    }
    messages.splice(Math.max(0, lastUserIndex), 0, {
      role: "user",
      content,
      sourceType: "depth_injection",
    });
    return;
  }

  const lastSystemIndex = messages
    .map((message) => message.role)
    .lastIndexOf("system");
  const system = lastSystemIndex >= 0 ? messages[lastSystemIndex] : undefined;
  if (system && typeof system.content === "string") {
    system.content = `${system.content.trimEnd()}\n\n${content}`;
    return;
  }
  messages.unshift({ role: "user", content, sourceType: "depth_injection" });
}

function extractQuery(messages: ProcessableMessage[]) {
  const history = messages.filter(
    (message) => message.sourceType === "session_history"
  );
  const userIndex = history.map((message) => message.role).lastIndexOf("user");
  if (userIndex < 0) return { userText: "", aiText: "" };
  const userText =
    typeof history[userIndex].content === "string"
      ? history[userIndex].content.trim()
      : "";
  const aiText = history
    .slice(userIndex + 1)
    .filter(
      (message) =>
        message.role === "assistant" && typeof message.content === "string"
    )
    .map((message) => (message.content as string).trim())
    .filter(Boolean)
    .join("\n");
  return { userText, aiText };
}

export class RecallProcessor implements ContextProcessor {
  id = "primary:recall-processor";
  name = "思绪处理器";
  description = "执行 Recall 检索并替换【recall】占位符";
  priority = 450;

  async execute(context: PipelineContext): Promise<void> {
    const config = context.agentConfig.recallConfig;
    const settings = context.agentConfig.recallSettings;
    context.messages.forEach((message, messageIndex) => {
      if (
        message.sourceType === "session_history" ||
        typeof message.content !== "string"
      )
        return;
      const candidates = message.content.match(LEGACY_RECALL_ENVELOPE);
      for (const raw of candidates?.filter(isLegacyRecallEnvelope) ?? []) {
        context.logs.push({
          processorId: this.id,
          level: "warn",
          message: "检测到已废弃的知识库占位符，未执行检索",
          details: {
            messageIndex,
            raw,
            replacement: "【recall::collection=<collection-id>】",
          },
        });
      }
    });
    if (!config?.enabled) return;
    let placeholders = scanRecallPlaceholders(context.messages);
    const enabledBindings = config.bindings.filter(
      (binding) => binding.enabled
    );
    if (
      config.autoInjectIfMacroMissing &&
      !placeholders.some((item) => !item.collection)
    ) {
      const referenced = new Set(
        placeholders.map((item) => item.collection).filter(Boolean)
      );
      const generated = enabledBindings.filter(
        (binding) => !referenced.has(binding.recallId)
      );
      if (generated.length) {
        const raw = generated.map((binding) =>
          serializeRecallPlaceholder({
            collection: binding.recallId,
            profile: binding.profile,
            limit: binding.limit,
            minScore: binding.minScore,
            when: binding.when,
            gateTags: binding.when === "gate" ? binding.whenParams : undefined,
            everyTurns:
              binding.when === "turn"
                ? Number(binding.whenParams?.[0])
                : undefined,
            entries: binding.when === "static" ? binding.whenParams : undefined,
          })
        );
        insertAutoPlaceholders(
          context.messages,
          raw,
          config.autoInjectPosition ?? "context_head"
        );
        placeholders = scanRecallPlaceholders(context.messages);
      }
    }
    const { userText, aiText } = extractQuery(context.messages);
    const sessionHistory = context.messages.filter(
      (message) => message.sourceType === "session_history"
    );
    const recentMessageTexts = sessionHistory
      .filter((message) => typeof message.content === "string")
      .map((message) => message.content as string);
    const turnCount = sessionHistory.filter(
      (message) => message.role === "user"
    ).length;
    for (const placeholder of placeholders) {
      if (
        placeholder.collection &&
        !enabledBindings.some(
          (binding) => binding.recallId === placeholder.collection
        )
      ) {
        context.logs.push({
          processorId: this.id,
          level: "warn",
          message: "Recall 占位符引用未授权集合",
          details: { collection: placeholder.collection, raw: placeholder.raw },
        });
        continue;
      }
      const request: RecallRetrievalRequest = {
        recallId: placeholder.collection,
        limit: placeholder.limit,
        minScore: placeholder.minScore,
        mode: placeholder.when ?? "always",
        modeParams:
          placeholder.gateTags ??
          (placeholder.everyTurns
            ? [String(placeholder.everyTurns)]
            : placeholder.entries),
        profile: placeholder.profile ?? settings?.defaultProfile ?? "semantic",
        userText,
        aiText,
        turnCount,
        recentMessageTexts,
        settings: {
          defaultProfile: settings?.defaultProfile ?? "semantic",
          defaultLimit: settings?.defaultLimit,
          defaultMinScore: settings?.defaultMinScore,
          maxRecallChars: settings?.maxRecallChars,
          enableCache: settings?.enableCache,
          gateScanDepth: settings?.gateScanDepth,
          resultTemplate: settings?.resultTemplate,
          emptyText: settings?.emptyText,
        },
        enabledBindings: enabledBindings.map((binding) => ({
          recallId: binding.recallId,
          recallName: binding.recallName,
        })),
      };
      const response = await resolvePlaceholderRetrieval(request);
      const message = context.messages[placeholder.messageIndex];
      if (message && typeof message.content === "string")
        message.content = message.content.replace(
          placeholder.raw,
          response.activated ? response.content : ""
        );
    }
  }
}

export const recallProcessor = new RecallProcessor();
