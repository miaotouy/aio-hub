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
  ToolRegistry,
  ServiceMetadata,
  ToolContext,
} from "@/services/types";
import { createModuleLogger } from "@/utils/logger";
import { llmChatService } from "@/tools/llm-chat/services/llmChatService";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import { useLlmChatStore } from "@/tools/llm-chat/stores/llmChatStore";

const logger = createModuleLogger("sub-agent/registry");

interface SubAgentConversation {
  conversationId: string;
  agentId: string;
  sessionId: string;
  createdAt: string;
  lastUsedAt: string;
}

interface AskSubAgentArgs {
  agentId: string;
  message: string;
  conversationId?: string;
}

const createConversationId = () =>
  `sub-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * 子智能体交互工具
 *
 * 把已明确允许“被调用”的 Agent 暴露为协作对象。会话使用独立的聊天
 * session，调用完成后恢复调用前的当前会话，避免把子任务消息混入主对话。
 */
export default class SubAgentRegistry implements ToolRegistry {
  public readonly id = "sub-agent";
  public readonly runMode = "any" as const;
  public readonly name = "子智能体交互";
  public readonly description =
    "调用已授权的智能体完成专项任务，并返回独立会话中的最新回复";

  private conversations = new Map<string, SubAgentConversation>();
  /** 首版限制为单层子智能体调用，避免工具链递归扩大。 */
  private activeTargetAgentIds = new Set<string>();

  public getMetadata(): ServiceMetadata {
    return {
      methods: [
        {
          name: "list_available_agents",
          displayName: "列出可调用智能体",
          description: "列出已开启子智能体调用开关的智能体",
          parameters: [],
          returnType: "Promise<string>",
          agentCallable: true,
        },
        {
          name: "ask",
          displayName: "询问子智能体",
          description:
            "向一个已授权的子智能体发送任务或追问。使用返回的 conversationId 可继续同一段子对话。",
          parameters: [
            {
              name: "agentId",
              type: "string",
              required: true,
              description: "目标智能体 ID，可先调用 list_available_agents 获取",
            },
            {
              name: "message",
              type: "string",
              required: true,
              description: "要交给子智能体处理的任务或问题",
              uiHint: "textarea",
            },
            {
              name: "conversationId",
              type: "string",
              required: false,
              description: "已有子对话 ID；省略时创建新的子对话",
            },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
        },
      ],
    };
  }

  public async list_available_agents(): Promise<string> {
    await llmChatService.ensureInitialized();
    const agentStore = useAgentStore();
    const loadedAgents = await Promise.all(
      agentStore.agents.map((agent) => agentStore.loadAgentDetails(agent.id))
    );
    const agents = loadedAgents
      .filter((agent) => agent?.subAgentConfig?.enabled === true)
      .map((agent) => ({
        id: agent!.id,
        name: agent!.displayName || agent!.name,
        description: agent!.description || "",
      }));

    return JSON.stringify({ agents }, null, 2);
  }

  public async ask(
    args: AskSubAgentArgs,
    context?: ToolContext
  ): Promise<string> {
    const message = args.message?.trim();
    if (!args.agentId?.trim()) throw new Error("必须提供目标智能体 ID");
    if (!message) throw new Error("必须提供要交给子智能体的消息");
    if (context?.agent?.id === args.agentId) {
      throw new Error("当前智能体不能调用自身，避免形成递归调用");
    }
    if (context?.agent?.id && this.activeTargetAgentIds.has(context.agent.id)) {
      throw new Error("子智能体调用暂时限制为单层，当前目标不能继续委托子任务");
    }

    await llmChatService.ensureInitialized();
    const agentStore = useAgentStore();
    const targetAgent = await agentStore.loadAgentDetails(args.agentId);
    if (!targetAgent) throw new Error(`目标智能体不存在：${args.agentId}`);
    if (targetAgent.subAgentConfig?.enabled !== true) {
      throw new Error("目标智能体未开启“允许被调用”开关");
    }

    const existingConversation = args.conversationId
      ? this.conversations.get(args.conversationId)
      : undefined;
    if (
      existingConversation &&
      existingConversation.agentId !== targetAgent.id
    ) {
      throw new Error("conversationId 与目标智能体不匹配");
    }

    const previousSessionId = llmChatService.getCurrentSession()?.id;
    let conversation = existingConversation;
    this.activeTargetAgentIds.add(targetAgent.id);

    try {
      let sessionId = conversation?.sessionId;
      if (
        !sessionId ||
        !llmChatService.getSessions().some((s) => s.id === sessionId)
      ) {
        sessionId = await useLlmChatStore().createSession(
          targetAgent.id,
          `子智能体：${targetAgent.displayName || targetAgent.name}`
        );
        const now = new Date().toISOString();
        conversation = {
          conversationId:
            conversation?.conversationId || createConversationId(),
          agentId: targetAgent.id,
          sessionId,
          createdAt: conversation?.createdAt || now,
          lastUsedAt: now,
        };
        this.conversations.set(conversation.conversationId, conversation);
      }

      await llmChatService.sendMessage(message, {
        agentId: targetAgent.id,
        sessionId,
      });

      const detail = useLlmChatStore().sessionDetailMap.get(sessionId);
      const leaf = detail?.nodes?.[detail.activeLeafId];
      if (!leaf || leaf.role !== "assistant") {
        throw new Error("子智能体没有返回可读取的助手消息");
      }

      conversation!.lastUsedAt = new Date().toISOString();
      return JSON.stringify({
        conversationId: conversation!.conversationId,
        agentId: targetAgent.id,
        agentName: targetAgent.displayName || targetAgent.name,
        response: leaf.content,
      });
    } finally {
      this.activeTargetAgentIds.delete(targetAgent.id);
      if (
        previousSessionId &&
        previousSessionId !== llmChatService.getCurrentSession()?.id
      ) {
        try {
          await useLlmChatStore().switchSession(previousSessionId);
        } catch (error) {
          logger.warn("恢复主会话失败", { previousSessionId, error });
        }
      }
    }
  }
}
