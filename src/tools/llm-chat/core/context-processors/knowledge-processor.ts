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

import { ContextProcessor, PipelineContext } from "../../types/pipeline";
import { ProcessableMessage } from "../../types/context";
import { resolvePlaceholderRetrieval } from "@/tools/recall/services/api";
import type { RecallRetrievalRequest } from "@/tools/recall/types/retrieval";
import type { AgentKnowledgeBaseConfig } from "@/tools/agent-manager/types/agent";

/**
 * 知识库占位符解析结果接口
 */
export interface KBPlaceholder {
  /** 原始占位符文本，用于替换 */
  raw: string;

  /** 所在消息的索引 */
  messageIndex: number;

  /** 知识库名称 (可选，为空则检索所有库) */
  kbName?: string;

  /** 召回上限 */
  limit?: number;

  /** 最低相关度分数阈值 */
  minScore?: number;

  /** 激活模式: always | gate | turn | static */
  mode: "always" | "gate" | "turn" | "static";

  /** 模式特定参数 (如标签列表、轮次数、条目 ID 列表) */
  modeParams?: string[];

  /** 检索引擎 ID (可选，覆盖默认设置) */
  engineId?: string;
}

/**
 * 匹配所有 KB 占位符的正则表达式
 */
const KB_PLACEHOLDER_REGEX = /【(?:kb|knowledge)(?:::([^【】]*?))?】/g;

/**
 * 参数解析函数：将链式字符串解析为结构化对象
 * 格式: kbName::limit::minScore::mode::modeParams
 */
export function parseKBParams(
  raw: string,
  paramStr: string,
  messageIndex: number
): KBPlaceholder {
  const parts = (paramStr || "").split("::");
  return {
    raw,
    messageIndex,
    kbName: parts[0] || undefined,
    limit: parts[1] ? parseInt(parts[1]) : undefined,
    minScore: parts[2] ? parseFloat(parts[2]) : undefined,
    mode: (parts[3] as any) || "always",
    modeParams: parts[4] ? parts[4].split(",").map((t) => t.trim()) : undefined,
    engineId: parts[5] || undefined,
  };
}

/**
 * 扫描消息中的占位符
 *
 * 只扫描预设消息和注入消息，跳过对话历史。
 */
export function scanPlaceholders(
  messages: ProcessableMessage[]
): KBPlaceholder[] {
  const placeholders: KBPlaceholder[] = [];
  messages.forEach((msg, index) => {
    if (typeof msg.content !== "string") return;

    // 跳过对话历史消息，只处理预设/注入类消息
    if (msg.sourceType === "session_history") return;

    let match;
    // 必须重置 lastIndex 因为是全局匹配
    KB_PLACEHOLDER_REGEX.lastIndex = 0;
    while ((match = KB_PLACEHOLDER_REGEX.exec(msg.content)) !== null) {
      placeholders.push(parseKBParams(match[0], match[1], index));
    }
  });
  return placeholders;
}

export class KnowledgeProcessor implements ContextProcessor {
  id = "primary:knowledge-processor";
  name = "知识库处理器";
  description = "执行 RAG 检索并替换【kb】占位符";
  priority = 450;

  async execute(context: PipelineContext): Promise<void> {
    const { agentConfig, messages } = context;

    // 1. 扫描占位符
    const placeholders = scanPlaceholders(messages);

    // 自动注入逻辑
    const kbConfig = agentConfig.knowledgeBaseConfig;
    if (kbConfig?.enabled && kbConfig.autoInjectIfMacroMissing) {
      const hasUnnamedPlaceholder = placeholders.some((p) => !p.kbName);
      const referencedKbNames = new Set(
        placeholders.map((p) => p.kbName).filter((n): n is string => !!n)
      );

      if (!hasUnnamedPlaceholder) {
        const autoPlaceholders = this.generateAutoPlaceholders(
          kbConfig,
          messages,
          referencedKbNames
        );
        if (autoPlaceholders.length > 0) {
          placeholders.push(...autoPlaceholders);
        }
      }
    }

    if (placeholders.length === 0) {
      return;
    }

    // 2. 准备检索所需上下文
    const { userText, aiText } = this.extractContextParts(context);
    const knowledgeSettings = agentConfig.knowledgeSettings;
    const turnCount = messages.filter((m) => m.role === "user").length;
    const gateScanDepth = knowledgeSettings?.gateScanDepth || 3;
    const recentMessageTexts = messages
      .slice(-gateScanDepth)
      .filter((m) => typeof m.content === "string")
      .map((m) => m.content as string);

    const enabledBindings =
      agentConfig.knowledgeBaseConfig?.bindings
        ?.filter((b: any) => b.enabled)
        .map((b: any) => ({
          recallId: b.kbId,
          recallName: b.kbName,
        })) || [];

    // 3. 遍历占位符并处理
    for (const ph of placeholders) {
      // 构造检索请求
      const req: RecallRetrievalRequest = {
        recallName: ph.kbName,
        limit: ph.limit,
        minScore: ph.minScore,
        mode: ph.mode,
        modeParams: ph.modeParams,
        engineId: ph.engineId,
        userText,
        aiText,
        turnCount,
        recentMessageTexts,
        settings: {
          defaultEngineId: knowledgeSettings?.defaultEngineId,
          defaultLimit: knowledgeSettings?.defaultLimit,
          defaultMinScore: knowledgeSettings?.defaultMinScore,
          maxRecallChars: knowledgeSettings?.maxRecallChars,
          enableCache:
            knowledgeSettings?.enableCache ??
            (agentConfig.knowledgeSettings as any)?.aggregation?.enableCache ??
            false,
          gateScanDepth: knowledgeSettings?.gateScanDepth,
          resultTemplate: knowledgeSettings?.resultTemplate,
          emptyText: knowledgeSettings?.emptyText,
        },
        enabledBindings,
      };

      // 调用知识库下沉后的统一检索门面
      const response = await resolvePlaceholderRetrieval(req);

      const msg = messages[ph.messageIndex];
      if (typeof msg.content === "string") {
        if (response.activated) {
          msg.content = msg.content.replace(ph.raw, response.content);
        } else {
          msg.content = msg.content.replace(ph.raw, ""); // 未激活则移除占位符
        }
      }

      // 记录日志
      if (response.activated) {
        context.logs.push({
          processorId: this.id,
          level: "info",
          message: `知识库占位符替换完成: ${ph.raw}`,
          details: {
            kbName: ph.kbName,
            resultCount: response.resultCount,
            mode: ph.mode,
          },
        });
      }
    }
  }

  /**
   * 从对话上下文中提取最近一对 User 和 AI 文本
   */
  private extractContextParts(context: PipelineContext): {
    userText: string;
    aiText: string;
  } {
    const { messages } = context;
    const historyOnly = messages.filter(
      (m) => m.sourceType === "session_history"
    );

    if (historyOnly.length === 0) {
      return { userText: "", aiText: "" };
    }

    let userText = "";
    let aiText = "";

    let lastUserIdx = -1;
    for (let i = historyOnly.length - 1; i >= 0; i--) {
      if (historyOnly[i].role === "user") {
        lastUserIdx = i;
        break;
      }
    }

    if (lastUserIdx !== -1) {
      const userContent = historyOnly[lastUserIdx].content;
      if (typeof userContent === "string") {
        userText = userContent.trim();
      }

      const aiParts: string[] = [];
      for (let j = lastUserIdx + 1; j < historyOnly.length; j++) {
        const msg = historyOnly[j];
        if (msg.role === "user") break;
        if (typeof msg.content !== "string") continue;

        if (msg.role === "assistant" && msg.content.trim()) {
          aiParts.push(msg.content.trim());
        }
      }
      aiText = aiParts.join("\n");
    }

    return { userText, aiText };
  }

  /**
   * 自动生成占位符
   */
  private generateAutoPlaceholders(
    kbConfig: AgentKnowledgeBaseConfig,
    messages: ProcessableMessage[],
    excludeKbNames: Set<string> = new Set()
  ): KBPlaceholder[] {
    const enabledBindings = kbConfig.bindings.filter(
      (b: any) => b.enabled && !excludeKbNames.has(b.kbName)
    );
    if (enabledBindings.length === 0) return [];

    const placeholderRaws: string[] = [];
    for (const binding of enabledBindings) {
      const parts: string[] = [binding.kbName];
      if (binding.limit) parts.push(binding.limit.toString());
      else parts.push("");
      if (binding.minScore) parts.push(binding.minScore.toFixed(2));
      else parts.push("");
      parts.push(binding.mode || "always");
      if (binding.modeParams && binding.modeParams.length > 0) {
        parts.push(binding.modeParams.join(","));
      }

      while (parts.length > 0) {
        const last = parts[parts.length - 1];
        if (last === "" || last === "always") {
          parts.pop();
        } else {
          break;
        }
      }

      placeholderRaws.push(
        parts.length > 0
          ? `【kb::${parts.join("::")}】`
          : `【kb::${binding.kbName}】`
      );
    }

    let targetIndex = 0;
    let needInsertNewMessage = false;

    if (kbConfig.autoInjectPosition === "before_last_user") {
      let lastUserIndex = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "user") {
          lastUserIndex = i;
          break;
        }
      }

      if (lastUserIndex <= 0) {
        needInsertNewMessage = true;
        targetIndex = Math.max(0, lastUserIndex);
      } else {
        const prevMsg = messages[lastUserIndex - 1];
        if (prevMsg.role === "system") {
          targetIndex = lastUserIndex - 1;
        } else {
          needInsertNewMessage = true;
          targetIndex = lastUserIndex;
        }
      }
    } else {
      let foundSystem = false;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "system") {
          targetIndex = i;
          foundSystem = true;
          break;
        }
      }
      if (!foundSystem) {
        needInsertNewMessage = true;
        targetIndex = 0;
      }
    }

    const placeholderTexts = placeholderRaws.join("\n");

    if (needInsertNewMessage) {
      const injectedMsg: ProcessableMessage = {
        role: "user",
        content: `【RAG信息】\n${placeholderTexts}\n【RAG信息结束】`,
      };
      messages.splice(targetIndex, 0, injectedMsg);
    } else {
      const targetMsg = messages[targetIndex];
      if (targetMsg && typeof targetMsg.content === "string") {
        if (!targetMsg.content.includes(placeholderTexts)) {
          targetMsg.content =
            targetMsg.content.trimEnd() + "\n\n" + placeholderTexts;
        }
      }
    }

    const placeholders: KBPlaceholder[] = [];
    for (let i = 0; i < enabledBindings.length; i++) {
      const binding = enabledBindings[i];
      placeholders.push({
        raw: placeholderRaws[i],
        messageIndex: targetIndex,
        kbName: binding.kbName,
        limit: binding.limit,
        minScore: binding.minScore,
        mode: binding.mode || "always",
        modeParams: binding.modeParams,
      });
    }

    return placeholders;
  }
}

export const knowledgeProcessor = new KnowledgeProcessor();
