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
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import { llmChatService } from "@/tools/llm-chat/services/llmChatService";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import { useLlmChatStore } from "@/tools/llm-chat/stores/llmChatStore";
import type {
  ChatMessageNode,
  ChatSessionDetail,
} from "@/tools/llm-chat/types";
import {
  backgroundTaskRegistry,
  type BackgroundTaskOperation,
  type MessageOrigin,
} from "@/services/background-tasks";

const logger = createModuleLogger("sub-agent/registry");
const errorHandler = createModuleErrorHandler("sub-agent/registry");

/** 后台任务终态集合：终态任务不再被 ask 的成功/失败收尾覆盖。 */
const TERMINAL_TASK_STATES: ReadonlySet<string> = new Set([
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);

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

  /**
   * 判断后台任务是否仍可流转（非终态）。
   */
  private isTaskActive(taskId: string): boolean {
    const state = backgroundTaskRegistry.getSnapshot(taskId)?.state;
    return state !== undefined && !TERMINAL_TASK_STATES.has(state);
  }

  /**
   * 订阅后台任务取消事件，并在任务被取消时中止子会话生成。
   *
   * llmChatService 本身没有 stop/abort 方法，但 useLlmChatStore().abortSending
   * 可中止指定会话的生成；这里把 registry.cancelTask 与它打通。
   *
   * @returns 取消订阅函数，由 ask 的 finally 调用
   */
  private bindTaskCancellation(
    taskId: string,
    childSessionId: string,
    store: ReturnType<typeof useLlmChatStore>,
    agentName: string
  ): () => void {
    return backgroundTaskRegistry.subscribe((event) => {
      if (event.taskId !== taskId || event.type !== "state_changed") {
        return;
      }
      const snapshot = backgroundTaskRegistry.getSnapshot(taskId);
      if (snapshot?.state !== "cancelled") {
        return;
      }
      try {
        store.abortSending(childSessionId);
        logger.info("后台任务已取消，已中止子会话生成", {
          taskId,
          childSessionId,
          agentName,
        });
      } catch (error) {
        logger.warn("中止子会话生成失败", { taskId, childSessionId, error });
      }
    });
  }

  /**
   * 生成回复摘要：折叠空白并按展示长度截断，避免把完整回复写入活动记录。
   */
  private buildReplySummary(content: string): string {
    const normalized = (content ?? "").replace(/\s+/g, " ").trim();
    if (!normalized) {
      return "（无文本回复）";
    }
    return normalized.length > 80
      ? `${normalized.slice(0, 80)}…`
      : normalized;
  }

  /**
   * 收集本轮需要写入任务关系的节点：从当前叶子向上，直到最近的 user 消息。
   */
  private collectRoundNodeIds(
    detail: ChatSessionDetail,
    leafId: string
  ): string[] {
    const collected: string[] = [];
    const visited = new Set<string>();
    let currentId: string | null = leafId;
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const node: ChatMessageNode | undefined = detail.nodes[currentId];
      if (!node) {
        break;
      }
      if (node.role === "assistant" || node.role === "user") {
        collected.push(node.id);
      }
      if (node.role === "user") {
        break;
      }
      currentId = node.parentId;
    }
    return collected;
  }

  /**
   * 增量写入任务关系 metadata。使用 store 的 updateMessageMetadata 做浅合并，
   * 不改变消息持久化格式，旧会话缺少这些字段仍可正常读取。
   */
  private writeTaskMetadata(
    store: ReturnType<typeof useLlmChatStore>,
    childSessionId: string,
    leafId: string,
    metadata: Record<string, unknown>
  ): void {
    const detail = store.sessionDetailMap.get(childSessionId);
    if (!detail) {
      return;
    }
    for (const nodeId of this.collectRoundNodeIds(detail, leafId)) {
      store.updateMessageMetadata(childSessionId, nodeId, metadata);
    }
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

    // Phase 1 前台 ask 埋点状态：taskId 与取消订阅句柄在 finally 清理
    const store = useLlmChatStore();
    let taskId: string | undefined;
    let unsubscribeTask: (() => void) | undefined;

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

      // ==================== 后台任务观察埋点（Phase 1） ====================
      // Phase 1 只创建可观察任务，ask 仍保持前台阻塞行为；
      // 任务被 registry.cancelTask 取消时，通过事件订阅中止子会话生成。
      const targetName = targetAgent.displayName || targetAgent.name;
      const targetOrigin: MessageOrigin = {
        kind: "agent",
        channel: "sub_agent",
        actorId: targetAgent.id,
        actorName: targetAgent.name,
        actorDisplayName: targetName,
      };
      // ToolContext.agent 当前只暴露 id，调用方 Agent 的来源按 id 记录
      const callerOrigin: MessageOrigin = context?.agent?.id
        ? {
            kind: "agent",
            channel: "sub_agent",
            actorId: context.agent.id,
            actorName: context.agent.id,
          }
        : { kind: "user", channel: "main_chat" };

      const task = backgroundTaskRegistry.createTask({
        parentSessionId: previousSessionId ?? "",
        childSessionId: sessionId,
        conversationId: conversation!.conversationId,
        callerAgent: callerOrigin,
        targetAgent: targetOrigin,
        phase: "llm_generation",
      });
      taskId = task?.taskId;

      if (taskId) {
        const startedAt = new Date().toISOString();
        const operationSummary = `正在等待 ${targetName} 生成回复`;
        const operation: BackgroundTaskOperation = {
          kind: "llm_generation",
          name: targetName,
          startedAt,
          summary: operationSummary,
        };
        backgroundTaskRegistry.appendActivity(taskId, {
          kind: "llm_started",
          actor: targetOrigin,
          summary: operationSummary,
          operation,
          detailRef: sessionId,
        });
        backgroundTaskRegistry.setCurrentOperation(taskId, operation);
        unsubscribeTask = this.bindTaskCancellation(
          taskId,
          sessionId,
          store,
          targetName
        );
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

      if (taskId && detail && this.isTaskActive(taskId)) {
        const resultSummary = this.buildReplySummary(leaf.content);
        backgroundTaskRegistry.appendActivity(taskId, {
          kind: "llm_progress",
          actor: targetOrigin,
          summary: `回复完成：${resultSummary}`,
          detailRef: sessionId,
        });
        // 仅在任务未被取消时做完成收尾，取消场景保持 cancelled
        backgroundTaskRegistry.updateTaskState(taskId, "completed", {
          result: {
            summary: resultSummary,
            completedAt: new Date().toISOString(),
          },
        });
        // 把任务关系增量写入子会话本轮消息的 metadata（旧会话缺省字段仍兼容）
        this.writeTaskMetadata(store, sessionId, detail.activeLeafId, {
          taskId,
          childSessionId: sessionId,
          parentSessionId: previousSessionId ?? "",
        });
      }

      return JSON.stringify({
        conversationId: conversation!.conversationId,
        agentId: targetAgent.id,
        agentName: targetName,
        response: leaf.content,
        taskId: taskId ?? null,
        state: taskId
          ? backgroundTaskRegistry.getSnapshot(taskId)?.state ?? null
          : null,
      });
    } catch (error) {
      if (taskId && this.isTaskActive(taskId)) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        backgroundTaskRegistry.appendActivity(taskId, {
          kind: "error",
          actor: { kind: "system", channel: "system_event" },
          summary: `子智能体调用失败：${errorMessage}`,
        });
        backgroundTaskRegistry.updateTaskState(taskId, "failed", {
          error: {
            message: errorMessage,
            failedAt: new Date().toISOString(),
          },
        });
      }
      errorHandler.handle(error, {
        userMessage: "子智能体调用失败",
        showToUser: false,
        context: {
          agentId: targetAgent.id,
          sessionId: conversation?.sessionId,
        },
      });
      throw error;
    } finally {
      unsubscribeTask?.();
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
