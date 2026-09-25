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
  ToolMethodResult,
} from "@/services/types";
import { createConfigManager } from "@/utils/configManager";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import { llmChatService } from "@/tools/llm-chat/services/llmChatService";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import { useLlmChatStore } from "@/tools/llm-chat/stores/llmChatStore";
import { useUserProfileStore } from "@/tools/llm-chat/stores/userProfileStore";
import type {
  ChatMessageNode,
  ChatSessionDetail,
} from "@/tools/llm-chat/types";
import {
  backgroundTaskRegistry,
  type BackgroundTaskLinkSnapshot,
  type BackgroundTaskOperation,
  type BackgroundTaskSnapshot,
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

/** get_task_activity 默认返回与上限的活动条数（recentActivity 最多保留 8 条）。 */
const DEFAULT_ACTIVITY_LIMIT = 5;
const MAX_ACTIVITY_LIMIT = 8;

/** 终态任务的中文标签（合成结果消息展示用）。 */
const TASK_STATE_LABELS: Record<string, string> = {
  completed: "已完成",
  failed: "已失败",
  cancelled: "已取消",
  interrupted: "已中断",
};

/** 工具参数摘要中需要脱敏的键名。 */
const SENSITIVE_ARG_KEY_PATTERN =
  /(key|token|secret|password|passwd|authorization|auth|cookie|credential)/i;

/** 已加载的子智能体定义（带 subAgentConfig）。 */
type LoadedSubAgent = NonNullable<
  Awaited<ReturnType<ReturnType<typeof useAgentStore>["loadAgentDetails"]>>
>;

/** 从子会话节点提取出的工具调用摘要（用于补最近操作活动）。 */
interface ToolCallActivity {
  toolName: string;
  status: string;
  argsSummary: string;
  resultSummary: string;
}

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
  /** 调用模式（默认 foreground）：background 创建任务后立即返回 handle。 */
  mode?: "foreground" | "background";
}

interface ConversationIndexPersistence {
  version: string;
  conversations: SubAgentConversation[];
}

const CONVERSATION_INDEX_VERSION = "1.0.0";
const CONVERSATION_INDEX_FILE = "conversations.json";

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
  private conversationHydrationPromise: Promise<void> | null = null;
  private readonly conversationPersistence =
    createConfigManager<ConversationIndexPersistence>({
      moduleName: "sub-agent",
      fileName: CONVERSATION_INDEX_FILE,
      version: CONVERSATION_INDEX_VERSION,
      createDefault: () => ({
        version: CONVERSATION_INDEX_VERSION,
        conversations: [],
      }),
      mergeConfig: (defaults, loaded) => ({
        version: CONVERSATION_INDEX_VERSION,
        conversations: Array.isArray(loaded?.conversations)
          ? loaded.conversations
          : defaults.conversations,
      }),
    });
  /** 同一 child session 的生成与追加消息共享一条串行执行 lane。 */
  private executionLaneTails = new Map<string, Promise<unknown>>();
  private activeLaneTaskIds = new Map<string, string>();
  /** 首版限制为单层子智能体调用，避免工具链递归扩大。 */
  private activeTargetAgentIds = new Map<string, number>();

  private async ensureConversationIndexLoaded(): Promise<void> {
    this.conversationHydrationPromise ??= this.conversationPersistence
      .load()
      .then((payload) => {
        for (const conversation of payload?.conversations ?? []) {
          if (
            conversation &&
            typeof conversation.conversationId === "string" &&
            typeof conversation.agentId === "string" &&
            typeof conversation.sessionId === "string"
          ) {
            this.conversations.set(conversation.conversationId, {
              ...conversation,
            });
          }
        }
      })
      .catch((error) => {
        logger.warn("加载子智能体会话索引失败，将使用当前进程索引", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    await this.conversationHydrationPromise;
  }

  private persistConversationIndex(): void {
    this.conversationPersistence.saveDebounced({
      version: CONVERSATION_INDEX_VERSION,
      conversations: [...this.conversations.values()].map((conversation) => ({
        ...conversation,
      })),
    });
  }

  private retainTargetAgent(agentId: string): void {
    this.activeTargetAgentIds.set(
      agentId,
      (this.activeTargetAgentIds.get(agentId) ?? 0) + 1
    );
  }

  private releaseTargetAgent(agentId: string): void {
    const count = this.activeTargetAgentIds.get(agentId) ?? 0;
    if (count <= 1) this.activeTargetAgentIds.delete(agentId);
    else this.activeTargetAgentIds.set(agentId, count - 1);
  }

  private executionLaneKey(childSessionId: string): string {
    return `sub-agent:${childSessionId}`;
  }

  private isExecutionLaneBusy(laneKey: string): boolean {
    return this.executionLaneTails.has(laneKey);
  }

  private beginTaskGeneration(
    taskId: string,
    targetOrigin: MessageOrigin,
    targetName: string,
    childSessionId: string
  ): boolean {
    const snapshot = backgroundTaskRegistry.getSnapshot(taskId);
    if (!snapshot || TERMINAL_TASK_STATES.has(snapshot.state)) {
      return false;
    }
    if (snapshot.state === "queued") {
      backgroundTaskRegistry.updateTaskState(taskId, "running", {
        phase: "llm_generation",
      });
    }
    const operation: BackgroundTaskOperation = {
      kind: "llm_generation",
      name: targetName,
      startedAt: new Date().toISOString(),
      summary: `正在等待 ${targetName} 生成回复`,
    };
    backgroundTaskRegistry.appendActivity(taskId, {
      kind: "llm_started",
      actor: targetOrigin,
      summary: operation.summary,
      operation,
      detailRef: childSessionId,
    });
    backgroundTaskRegistry.setCurrentOperation(taskId, operation);
    if (!this.isTaskActive(taskId)) return false;
    this.activeLaneTaskIds.set(snapshot.executionLaneKey, taskId);
    return true;
  }

  private releaseTaskGeneration(
    taskId: string | undefined,
    laneKey: string
  ): void {
    if (taskId && this.activeLaneTaskIds.get(laneKey) === taskId) {
      this.activeLaneTaskIds.delete(laneKey);
    }
  }

  private runInExecutionLane<T>(
    laneKey: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const previous = this.executionLaneTails.get(laneKey) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    const tail = current.then(
      () => undefined,
      () => undefined
    );
    this.executionLaneTails.set(laneKey, tail);
    void tail.finally(() => {
      if (this.executionLaneTails.get(laneKey) === tail) {
        this.executionLaneTails.delete(laneKey);
      }
    });
    return current;
  }

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
            {
              name: "mode",
              type: "string",
              required: false,
              description:
                "调用模式：foreground（默认）等待子智能体完成并返回回复；background 创建任务后立即返回 taskId 等句柄，父智能体可继续执行并用 get_task_status/get_task_activity 检查进展",
            },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
        },
        {
          name: "get_task_status",
          displayName: "查询后台任务状态",
          description:
            "读取某个后台任务的紧凑快照（状态、当前操作、最后摘要与结果），用于判断子任务是推进、完成还是卡住。",
          parameters: [
            {
              name: "taskId",
              type: "string",
              required: true,
              description: "后台任务 ID（ask background 返回或任务中心可见）",
            },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
        },
        {
          name: "get_task_activity",
          displayName: "查询后台任务活动",
          description:
            "读取后台任务最近的操作活动（默认最近 5 条），用于了解子智能体正在做什么。",
          parameters: [
            {
              name: "taskId",
              type: "string",
              required: true,
              description: "后台任务 ID",
            },
            {
              name: "limit",
              type: "number",
              required: false,
              description: "返回的活动条数，默认 5，最大 8",
            },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
        },
        {
          name: "send_task_message",
          displayName: "向后台任务追加消息",
          description:
            "向指定后台子会话追加一条消息，不触发新一轮生成；来源按调用上下文标记为 user/user_intervention 或 agent/sub_agent。",
          parameters: [
            {
              name: "taskId",
              type: "string",
              required: true,
              description: "后台任务 ID",
            },
            {
              name: "message",
              type: "string",
              required: true,
              description: "要追加给子智能体的指导或补充信息",
              uiHint: "textarea",
            },
            {
              name: "delivery",
              type: "string",
              required: false,
              description:
                "兼容旧参数；当前接口固定为 append-only，不承诺 next_turn 或 after_current_step",
            },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
        },
        {
          name: "cancel_task",
          displayName: "取消后台任务",
          description: "取消自己创建的后台任务；已处于终态的任务返回幂等结果。",
          parameters: [
            {
              name: "taskId",
              type: "string",
              required: true,
              description: "后台任务 ID",
            },
            {
              name: "reason",
              type: "string",
              required: false,
              description: "取消原因（会写入任务错误信息与活动记录）",
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
      if (
        snapshot?.state !== "cancelled" ||
        this.activeLaneTaskIds.get(snapshot.executionLaneKey) !== taskId
      ) {
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
    return normalized.length > 80 ? `${normalized.slice(0, 80)}…` : normalized;
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
    metadata: Record<string, unknown>,
    origins?: {
      user?: MessageOrigin;
      assistant?: MessageOrigin;
      tool?: MessageOrigin;
    }
  ): void {
    const detail = store.sessionDetailMap.get(childSessionId);
    if (!detail) {
      return;
    }
    for (const nodeId of this.collectRoundNodeIds(detail, leafId)) {
      const node = detail.nodes[nodeId];
      const origin =
        node?.role === "user"
          ? origins?.user
          : node?.role === "tool"
            ? origins?.tool
            : origins?.assistant;
      store.updateMessageMetadata(childSessionId, nodeId, {
        ...metadata,
        ...(origin ? { origin } : {}),
      });
    }
  }

  /**
   * 从实时快照抽取自包含关系快照，写入工具节点的 resultMetadata。
   *
   * 只保留派遣卡片降级展示所需的最小字段；`recentActivity` 等易失数据
   * 仍由 UI 按需从 registry 读取，避免把完整快照写进消息持久化。
   */
  private buildTaskLinkSnapshot(
    snapshot: BackgroundTaskSnapshot
  ): BackgroundTaskLinkSnapshot {
    return {
      taskId: snapshot.taskId,
      childSessionId: snapshot.childSessionId,
      conversationId: snapshot.conversationId,
      parentSessionId: snapshot.parentSessionId,
      state: snapshot.state,
      phase: snapshot.phase,
      callerAgent: snapshot.callerAgent,
      targetAgent: snapshot.targetAgent,
      lastOperationSummary: snapshot.lastOperationSummary,
      updatedAt: snapshot.updatedAt,
    };
  }

  /** 仅工具调用链使用结构化信封；呈现给 Agent 的 result 仍是原 JSON 字符串。 */
  private wrapAskResult(
    result: string,
    context: ToolContext | undefined,
    taskId: string | undefined,
    childSessionId: string
  ): string | ToolMethodResult<string> {
    if (!context?.requestId || !taskId) return result;
    const snapshot = backgroundTaskRegistry.getSnapshot(taskId);
    const link =
      snapshot && snapshot.childSessionId === childSessionId
        ? this.buildTaskLinkSnapshot(snapshot)
        : { taskId, childSessionId };
    return {
      result,
      executionMetadata: {
        backgroundTask: link,
      },
    };
  }

  public async ask(
    args: AskSubAgentArgs,
    context?: ToolContext
  ): Promise<string | ToolMethodResult<string>> {
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
    await this.ensureConversationIndexLoaded();
    const agentStore = useAgentStore();
    const targetAgent = await agentStore.loadAgentDetails(args.agentId);
    if (!targetAgent) throw new Error(`目标智能体不存在：${args.agentId}`);
    if (targetAgent.subAgentConfig?.enabled !== true) {
      throw new Error("目标智能体未开启“允许被调用”开关");
    }

    const existingConversation = args.conversationId
      ? this.conversations.get(args.conversationId)
      : undefined;
    if (args.conversationId && !existingConversation) {
      throw new Error(
        `conversationId 不存在：${args.conversationId}。请省略 conversationId 创建新对话`
      );
    }
    if (
      existingConversation &&
      existingConversation.agentId !== targetAgent.id
    ) {
      throw new Error("conversationId 与目标智能体不匹配");
    }

    // Phase 2：background 模式创建任务与子会话后立即返回 handle，父 Agent 继续执行
    if (args.mode === "background") {
      const result = await this.askInBackground({
        args,
        context,
        targetAgent,
        existingConversation,
        message,
      });
      const handle = JSON.parse(result) as {
        taskId?: string;
        childSessionId: string;
      };
      return this.wrapAskResult(
        result,
        context,
        handle.taskId,
        handle.childSessionId
      );
    }

    const previousSessionId = llmChatService.getCurrentSession()?.id;
    let conversation = existingConversation;
    this.retainTargetAgent(targetAgent.id);

    // Phase 1 前台 ask 埋点状态：taskId 与取消订阅句柄在 finally 清理
    const store = useLlmChatStore();
    let taskId: string | undefined;
    let unsubscribeTask: (() => void) | undefined;

    try {
      let sessionId = conversation?.sessionId;
      const sessionExists =
        !!sessionId &&
        llmChatService.getSessions().some((s) => s.id === sessionId);
      if (conversation && !sessionExists) {
        throw new Error(
          `conversationId 对应的子会话不可用：${conversation.conversationId}。请省略 conversationId 重新创建任务`
        );
      }
      if (!sessionId) {
        sessionId = await useLlmChatStore().createSession(
          targetAgent.id,
          `子智能体：${targetAgent.displayName || targetAgent.name}`
        );
        const now = new Date().toISOString();
        conversation = {
          conversationId: createConversationId(),
          agentId: targetAgent.id,
          sessionId,
          createdAt: now,
          lastUsedAt: now,
        };
        this.conversations.set(conversation.conversationId, conversation);
        this.persistConversationIndex();
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

      const executionLaneKey = this.executionLaneKey(sessionId);
      const laneBusy = this.isExecutionLaneBusy(executionLaneKey);
      const task = backgroundTaskRegistry.createTask({
        parentSessionId: previousSessionId ?? null,
        childSessionId: sessionId,
        conversationId: conversation!.conversationId,
        callerAgent: callerOrigin,
        owner: callerOrigin,
        targetAgent: targetOrigin,
        executionLaneKey,
        initialState: laneBusy ? "queued" : "running",
        phase: laneBusy ? "queued_for_execution" : "llm_generation",
      });
      taskId = task?.taskId;

      if (taskId) {
        unsubscribeTask = this.bindTaskCancellation(
          taskId,
          sessionId,
          store,
          targetName
        );
      }

      const leaf = await this.runInExecutionLane(
        this.executionLaneKey(sessionId),
        async () => {
          try {
            if (
              taskId &&
              !this.beginTaskGeneration(
                taskId,
                targetOrigin,
                targetName,
                sessionId
              )
            ) {
              throw new Error("后台任务已取消，未启动新的生成轮次");
            }
            await llmChatService.sendMessage(message, {
              agentId: targetAgent.id,
              sessionId,
            });

            const detail = store.sessionDetailMap.get(sessionId);
            const leaf = detail?.nodes?.[detail.activeLeafId];
            if (!leaf || leaf.role !== "assistant") {
              throw new Error("子智能体没有返回可读取的助手消息");
            }

            conversation!.lastUsedAt = new Date().toISOString();
            this.persistConversationIndex();

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
              this.writeTaskMetadata(
                store,
                sessionId,
                detail.activeLeafId,
                {
                  taskId,
                  childSessionId: sessionId,
                  parentSessionId: previousSessionId ?? null,
                },
                {
                  user: { ...callerOrigin, taskId },
                  assistant: { ...targetOrigin, taskId },
                  tool: { ...targetOrigin, taskId },
                }
              );
            }
            return leaf;
          } finally {
            this.releaseTaskGeneration(taskId, executionLaneKey);
          }
        }
      );

      return this.wrapAskResult(
        JSON.stringify({
          conversationId: conversation!.conversationId,
          agentId: targetAgent.id,
          agentName: targetName,
          response: leaf.content,
          taskId: taskId ?? null,
          state: taskId
            ? (backgroundTaskRegistry.getSnapshot(taskId)?.state ?? null)
            : null,
        }),
        context,
        taskId,
        sessionId
      );
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
      this.releaseTargetAgent(targetAgent.id);
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

  // ==================== Phase 2：后台调度与任务检查 ====================

  /**
   * 后台模式：创建任务与子会话后立即返回 handle，父 Agent 继续执行。
   *
   * 子 Agent 的实际执行放到不阻塞主流程的异步链里（void async IIFE），
   * 期间照常追加活动、同步当前操作并绑定取消订阅；任务进入终态后向父会话
   * 投递一条 system_event 合成结果，并把任务关系写入子会话 metadata。
   * 子会话使用不切换当前选中会话的 createDetachedSession 创建，避免后台任务
   * 干扰父 Agent 正在进行的会话。
   */
  private async askInBackground(params: {
    args: AskSubAgentArgs;
    context?: ToolContext;
    targetAgent: LoadedSubAgent;
    existingConversation?: SubAgentConversation;
    message: string;
  }): Promise<string> {
    const { context, targetAgent, existingConversation, message } = params;
    const targetName = targetAgent.displayName || targetAgent.name;
    const store = useLlmChatStore();
    const parentSessionId = llmChatService.getCurrentSession()?.id ?? null;
    const targetOrigin: MessageOrigin = {
      kind: "agent",
      channel: "sub_agent",
      actorId: targetAgent.id,
      actorName: targetAgent.name,
      actorDisplayName: targetName,
    };
    const callerOrigin: MessageOrigin = context?.agent?.id
      ? {
          kind: "agent",
          channel: "sub_agent",
          actorId: context.agent.id,
          actorName: context.agent.id,
        }
      : { kind: "user", channel: "main_chat" };

    this.retainTargetAgent(targetAgent.id);
    try {
      let conversation = existingConversation;
      let sessionId = conversation?.sessionId;
      const sessionExists =
        !!sessionId &&
        llmChatService.getSessions().some((s) => s.id === sessionId);
      if (conversation && !sessionExists) {
        throw new Error(
          `conversationId 对应的子会话不可用：${conversation.conversationId}。请省略 conversationId 重新创建任务`
        );
      }
      if (!sessionId) {
        const createdSessionId = await store.createDetachedSession(
          targetAgent.id,
          `子智能体：${targetName}`
        );
        if (!createdSessionId) {
          throw new Error("创建子会话失败");
        }
        sessionId = createdSessionId;
        const now = new Date().toISOString();
        conversation = {
          conversationId: createConversationId(),
          agentId: targetAgent.id,
          sessionId,
          createdAt: now,
          lastUsedAt: now,
        };
        this.conversations.set(conversation.conversationId, conversation);
        this.persistConversationIndex();
      }
      const activeConversation = conversation!;
      const activeSessionId = sessionId;

      const executionLaneKey = this.executionLaneKey(activeSessionId);
      const laneBusy = this.isExecutionLaneBusy(executionLaneKey);
      const task = backgroundTaskRegistry.createTask({
        parentSessionId,
        childSessionId: activeSessionId,
        conversationId: activeConversation.conversationId,
        callerAgent: callerOrigin,
        owner: callerOrigin,
        targetAgent: targetOrigin,
        executionLaneKey,
        initialState: laneBusy ? "queued" : "running",
        phase: laneBusy ? "queued_for_execution" : "llm_generation",
      });
      const taskId = task?.taskId;

      let unsubscribeTask: (() => void) | undefined;
      if (taskId) {
        unsubscribeTask = this.bindTaskCancellation(
          taskId,
          activeSessionId,
          store,
          targetName
        );
      }

      // 不阻塞调用方的后台执行链；同一 child session 的生成按 lane 串行。
      void (async () => {
        try {
          await this.runInExecutionLane(executionLaneKey, async () => {
            try {
              if (
                taskId &&
                !this.beginTaskGeneration(
                  taskId,
                  targetOrigin,
                  targetName,
                  activeSessionId
                )
              ) {
                throw new Error("后台任务已取消，未启动新的生成轮次");
              }
              await llmChatService.sendMessage(message, {
                agentId: targetAgent.id,
                sessionId: activeSessionId,
              });

              const detail = store.sessionDetailMap.get(activeSessionId);
              const leaf = detail?.nodes?.[detail.activeLeafId];
              if (!leaf || leaf.role !== "assistant") {
                throw new Error("子智能体没有返回可读取的助手消息");
              }

              activeConversation.lastUsedAt = new Date().toISOString();
              this.persistConversationIndex();

              if (taskId && detail && this.isTaskActive(taskId)) {
                const resultSummary = this.buildReplySummary(leaf.content);
                // 低成本补充工具调用类活动（§4.1 摘要），读不到工具节点则自动跳过
                this.appendToolActivities(
                  taskId,
                  detail,
                  detail.activeLeafId,
                  targetOrigin
                );
                backgroundTaskRegistry.appendActivity(taskId, {
                  kind: "llm_progress",
                  actor: targetOrigin,
                  summary: `回复完成：${resultSummary}`,
                  detailRef: activeSessionId,
                });
                backgroundTaskRegistry.updateTaskState(taskId, "completed", {
                  result: {
                    summary: resultSummary,
                    completedAt: new Date().toISOString(),
                  },
                });
                this.writeTaskMetadata(
                  store,
                  activeSessionId,
                  detail.activeLeafId,
                  {
                    taskId,
                    childSessionId: activeSessionId,
                    parentSessionId,
                  },
                  {
                    user: { ...callerOrigin, taskId },
                    assistant: { ...targetOrigin, taskId },
                    tool: { ...targetOrigin, taskId },
                  }
                );
              }
            } finally {
              this.releaseTaskGeneration(taskId, executionLaneKey);
            }
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          if (taskId && this.isTaskActive(taskId)) {
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
            userMessage: "后端子智能体调用失败",
            showToUser: false,
            context: {
              agentId: targetAgent.id,
              sessionId: activeSessionId,
              taskId,
            },
          });
        } finally {
          unsubscribeTask?.();
          this.releaseTargetAgent(targetAgent.id);
          if (taskId) {
            this.deliverSyntheticResult(taskId, store);
          }
        }
      })();

      return JSON.stringify({
        taskId: taskId ?? null,
        conversationId: activeConversation.conversationId,
        childSessionId: activeSessionId,
        state: taskId
          ? (backgroundTaskRegistry.getSnapshot(taskId)?.state ?? null)
          : null,
      });
    } catch (error) {
      this.releaseTargetAgent(targetAgent.id);
      errorHandler.handle(error, {
        userMessage: "启动后端子智能体任务失败",
        showToUser: false,
        context: { agentId: targetAgent.id },
      });
      throw error;
    }
  }

  /**
   * 任务进入终态后，向父会话投递一条 system_event 合成结果消息。
   *
   * 父会话详情未加载时跳过（结果仍保留在任务中心），不强行重开会话。
   */
  private deliverSyntheticResult(
    taskId: string,
    store: ReturnType<typeof useLlmChatStore>
  ): void {
    const snapshot = backgroundTaskRegistry.getSnapshot(taskId);
    if (!snapshot || !TERMINAL_TASK_STATES.has(snapshot.state)) {
      return;
    }
    const label = TASK_STATE_LABELS[snapshot.state] ?? snapshot.state;
    const summary =
      snapshot.result?.summary ??
      snapshot.error?.message ??
      snapshot.lastOperationSummary ??
      "（无摘要）";
    const targetName =
      snapshot.targetAgent.actorDisplayName ??
      snapshot.targetAgent.actorName ??
      snapshot.targetAgent.actorId ??
      "未知智能体";
    const content = [
      `【后台任务${label}】`,
      `任务 ID：${snapshot.taskId}`,
      `子智能体：${targetName}`,
      `结果摘要：${summary}`,
    ].join("\n");

    if (!snapshot.parentSessionId) return;
    const nodeId = store.appendMessageNode(snapshot.parentSessionId, {
      role: "system",
      content,
      metadata: {
        origin: {
          kind: "system",
          channel: "system_event",
          taskId: snapshot.taskId,
          actorDisplayName: "后台任务",
        },
      },
    });
    if (!nodeId) {
      logger.info("父会话未加载，后台任务合成结果仅保留在任务中心", {
        taskId: snapshot.taskId,
        parentSessionId: snapshot.parentSessionId,
      });
    }
  }

  /**
   * 校验调用方（调度 Agent）对任务的访问权限。
   *
   * 规则：调度 Agent 只能访问自己创建的任务及其后代（沿 parentTaskId 链）；
   * 无 agent 上下文（用户/系统触发）时放行。校验不通过抛出可读错误。
   */
  private assertTaskAccess(
    taskId: string,
    context?: ToolContext
  ): BackgroundTaskSnapshot {
    const snapshot = backgroundTaskRegistry.getSnapshot(taskId);
    if (!snapshot) {
      throw new Error(`后台任务不存在：${taskId}`);
    }
    const callerActorId = context?.agent?.id;
    if (!callerActorId) {
      return snapshot;
    }
    if (this.isTaskOwnedBy(snapshot, callerActorId)) {
      return snapshot;
    }
    throw new Error(
      "无权访问该后台任务：仅创建它的调度 Agent 及其父任务链可以读取或操作"
    );
  }

  /** 判断任务（含父任务链）是否由指定调用方 Agent 创建。 */
  private isTaskOwnedBy(
    snapshot: BackgroundTaskSnapshot,
    callerActorId: string
  ): boolean {
    const visited = new Set<string>();
    let current: BackgroundTaskSnapshot | null = snapshot;
    while (current && !visited.has(current.taskId)) {
      visited.add(current.taskId);
      if (current.owner?.actorId === callerActorId) {
        return true;
      }
      if (!current.parentTaskId) {
        break;
      }
      current = backgroundTaskRegistry.getSnapshot(current.parentTaskId);
    }
    return false;
  }

  /** 构造面向 Agent 的紧凑任务状态（不含完整活动列表与 transcript）。 */
  private buildCompactTaskStatus(
    snapshot: BackgroundTaskSnapshot
  ): Record<string, unknown> {
    return {
      taskId: snapshot.taskId,
      state: snapshot.state,
      phase: snapshot.phase,
      parentTaskId: snapshot.parentTaskId ?? null,
      owner: snapshot.owner,
      executionLaneKey: snapshot.executionLaneKey,
      parentSessionId: snapshot.parentSessionId,
      childSessionId: snapshot.childSessionId,
      conversationId: snapshot.conversationId,
      callerAgent: snapshot.callerAgent,
      targetAgent: snapshot.targetAgent,
      createdAt: snapshot.createdAt,
      startedAt: snapshot.startedAt ?? null,
      updatedAt: snapshot.updatedAt,
      lastActivityAt: snapshot.lastActivityAt ?? null,
      lastProgressAt: snapshot.lastProgressAt ?? null,
      stale: snapshot.stale,
      staleReason: snapshot.staleReason ?? null,
      attention: snapshot.attention ?? null,
      currentOperation: snapshot.currentOperation ?? null,
      lastOperationSummary: snapshot.lastOperationSummary,
      result: snapshot.result ?? null,
      error: snapshot.error ?? null,
    };
  }

  /** 查询后台任务紧凑状态。 */
  public async get_task_status(
    args: { taskId: string },
    context?: ToolContext
  ): Promise<string> {
    const taskId = args?.taskId?.trim();
    if (!taskId) throw new Error("必须提供后台任务 ID");
    const snapshot = this.assertTaskAccess(taskId, context);
    return JSON.stringify(
      { status: this.buildCompactTaskStatus(snapshot) },
      null,
      2
    );
  }

  /** 查询后台任务最近活动（默认最近 5 条，最多 8 条）。 */
  public async get_task_activity(
    args: { taskId: string; limit?: number },
    context?: ToolContext
  ): Promise<string> {
    const taskId = args?.taskId?.trim();
    if (!taskId) throw new Error("必须提供后台任务 ID");
    const snapshot = this.assertTaskAccess(taskId, context);
    const rawLimit =
      typeof args?.limit === "number" ? args.limit : DEFAULT_ACTIVITY_LIMIT;
    const limit = Math.min(
      Math.max(Math.floor(rawLimit), 1),
      MAX_ACTIVITY_LIMIT
    );
    const activities = snapshot.recentActivity
      .slice(-limit)
      .map((activity) => ({
        kind: activity.kind,
        actor: activity.actor,
        timestamp: activity.timestamp,
        summary: activity.summary,
        operation: activity.operation ?? null,
      }));
    return JSON.stringify(
      { taskId, count: activities.length, activities },
      null,
      2
    );
  }

  /**
   * 向指定后台子会话追加一条消息，但不触发新的生成轮次。
   *
   * 这是 append-only 契约：消息写入与当前 child session 的生成共享 execution
   * lane，避免并发修改同一消息树；真正的下一轮投递由后续 enqueue 接口负责。
   */
  public async send_task_message(
    args: {
      taskId: string;
      message: string;
      /** 兼容旧调用方；append-only 不再承诺该投递时机。 */
      delivery?: "next_turn" | "after_current_step";
    },
    context?: ToolContext
  ): Promise<string> {
    const taskId = args?.taskId?.trim();
    const message = args?.message?.trim();
    if (!taskId) throw new Error("必须提供后台任务 ID");
    if (!message) throw new Error("必须提供要追加的消息");
    const snapshot = this.assertTaskAccess(taskId, context);
    if (TERMINAL_TASK_STATES.has(snapshot.state)) {
      return JSON.stringify({
        taskId,
        appended: false,
        state: snapshot.state,
        message: "任务已结束，无法再追加消息",
      });
    }

    const origin = this.buildTaskMessageOrigin(context, taskId);
    const userProfile =
      origin.kind === "user"
        ? useUserProfileStore().getEffectiveProfile()
        : null;
    const store = useLlmChatStore();
    const nodeId = await this.runInExecutionLane(
      snapshot.executionLaneKey,
      async () => {
        const latest = backgroundTaskRegistry.getSnapshot(taskId);
        if (
          !latest ||
          latest.state === "cancelled" ||
          latest.state === "failed" ||
          latest.state === "interrupted"
        ) {
          return null;
        }
        const nextNodeId = store.appendMessageNode(snapshot.childSessionId, {
          role: "user",
          content: message,
          metadata: {
            origin,
            ...(userProfile
              ? {
                  userProfileId: userProfile.id,
                  userProfileName: userProfile.name,
                  userProfileDisplayName: userProfile.displayName,
                  userProfileIcon: userProfile.icon,
                }
              : {}),
          },
        });
        if (!nextNodeId) {
          throw new Error("子会话未加载，无法追加消息");
        }
        backgroundTaskRegistry.appendActivity(taskId, {
          kind: "user_intervention",
          actor: origin,
          summary: `${origin.kind === "agent" ? "调度 Agent 指令" : "用户介入"}：${
            message.length > 60 ? `${message.slice(0, 60)}…` : message
          }`,
          detailRef: snapshot.childSessionId,
        });
        return nextNodeId;
      }
    );

    if (!nodeId) {
      const latest = backgroundTaskRegistry.getSnapshot(taskId);
      return JSON.stringify({
        taskId,
        appended: false,
        state: latest?.state ?? null,
        message: latest
          ? "任务在消息进入 execution lane 前已取消或中断"
          : "后台任务不存在",
      });
    }

    logger.info("已向后台子会话追加消息（append-only）", {
      taskId,
      requestedDelivery: args.delivery,
      nodeId,
      origin: origin.kind,
    });
    return JSON.stringify({
      taskId,
      appended: true,
      delivery: "append_only",
      nodeId,
      origin,
      note: "消息已追加到子会话；本接口不触发下一轮生成",
    });
  }

  private buildTaskMessageOrigin(
    context: ToolContext | undefined,
    taskId: string
  ): MessageOrigin {
    if (context?.agent?.id) {
      const agent = useAgentStore().getAgentById(context.agent.id);
      return {
        kind: "agent",
        channel: "sub_agent",
        actorId: context.agent.id,
        actorName: agent?.name ?? context.agent.id,
        actorDisplayName: agent?.displayName ?? agent?.name,
        taskId,
      };
    }
    const profile = useUserProfileStore().getEffectiveProfile();
    return {
      kind: "user",
      channel: "user_intervention",
      actorId: profile?.id,
      actorName: profile?.name,
      actorDisplayName: profile?.displayName ?? profile?.name,
      taskId,
    };
  }

  /** 取消后台任务（幂等：已终态时返回 cancelled:false）。 */
  public async cancel_task(
    args: { taskId: string; reason?: string },
    context?: ToolContext
  ): Promise<string> {
    const taskId = args?.taskId?.trim();
    if (!taskId) throw new Error("必须提供后台任务 ID");
    const snapshot = this.assertTaskAccess(taskId, context);
    if (TERMINAL_TASK_STATES.has(snapshot.state)) {
      return JSON.stringify({
        taskId,
        cancelled: false,
        state: snapshot.state,
        message: "任务已处于终态",
      });
    }
    const reason = args?.reason?.trim() || "调度 Agent 取消任务";
    const cancelled = backgroundTaskRegistry.cancelTask(taskId, reason);
    const latest = backgroundTaskRegistry.getSnapshot(taskId);
    logger.info("调度 Agent 取消后台任务", { taskId, cancelled, reason });
    return JSON.stringify({
      taskId,
      cancelled,
      state: latest?.state ?? null,
    });
  }

  /**
   * 从子会话本轮节点补充工具调用类活动（§4.1 摘要）。
   *
   * 读不到工具节点时自然跳过，不做深挖；活动摘要中的参数已脱敏与截断。
   */
  private appendToolActivities(
    taskId: string,
    detail: ChatSessionDetail,
    leafId: string,
    actor: MessageOrigin
  ): void {
    const nodes = this.collectRoundToolNodes(detail, leafId);
    for (const node of nodes) {
      for (const call of this.extractToolCalls(node)) {
        if (!call.toolName) continue;
        if (call.status === "completed" || call.status === "success") {
          backgroundTaskRegistry.appendActivity(taskId, {
            kind: "tool_finished",
            actor,
            summary: `工具 ${call.toolName} 已完成，结果：${
              call.resultSummary || "（无输出）"
            }`,
            detailRef: node.id,
          });
        } else if (call.status === "error" || call.status === "denied") {
          backgroundTaskRegistry.appendActivity(taskId, {
            kind: "error",
            actor,
            summary: `工具 ${call.toolName} 失败：${
              call.resultSummary || "未知错误"
            }`,
            detailRef: node.id,
          });
        } else {
          backgroundTaskRegistry.appendActivity(taskId, {
            kind: "tool_started",
            actor,
            summary: `正在执行工具 ${call.toolName}：${call.argsSummary}`,
            detailRef: node.id,
          });
        }
      }
    }
  }

  /**
   * 收集本轮需要检查工具调用的节点：从叶子向上，直到最近的 user 消息。
   */
  private collectRoundToolNodes(
    detail: ChatSessionDetail,
    leafId: string
  ): ChatMessageNode[] {
    const collected: ChatMessageNode[] = [];
    const visited = new Set<string>();
    let currentId: string | null = leafId;
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const node: ChatMessageNode | undefined = detail.nodes[currentId];
      if (!node) {
        break;
      }
      if (node.role === "tool" || node.role === "assistant") {
        collected.push(node);
      }
      if (node.role === "user") {
        break;
      }
      currentId = node.parentId;
    }
    return collected;
  }

  /** 从单个节点提取工具调用摘要（优先 assistant 的请求、其次 tool 的结果）。 */
  private extractToolCalls(node: ChatMessageNode): ToolCallActivity[] {
    const metadata = node.metadata;
    if (!metadata) return [];
    const results: ToolCallActivity[] = [];

    if (node.role === "tool") {
      const calls =
        metadata.toolCalls ?? (metadata.toolCall ? [metadata.toolCall] : []);
      for (const call of calls) {
        results.push({
          toolName: call.toolName,
          status: call.status,
          argsSummary: this.buildSafeArgsSummary(call.rawArgs),
          resultSummary: this.buildReplySummary(node.content),
        });
      }
      return results;
    }

    if (
      node.role === "assistant" &&
      Array.isArray(metadata.toolCallsRequested)
    ) {
      for (const call of metadata.toolCallsRequested) {
        results.push({
          toolName: call.toolName,
          status: call.status,
          argsSummary: this.buildSafeArgsSummary(call.args),
          resultSummary: call.error ?? "",
        });
      }
    }
    return results;
  }

  /** 生成工具参数的安全摘要：敏感键脱敏、值折叠空白并截断。 */
  private buildSafeArgsSummary(rawArgs?: Record<string, any>): string {
    if (!rawArgs || typeof rawArgs !== "object") {
      return "（无参数）";
    }
    const parts: string[] = [];
    for (const [key, value] of Object.entries(rawArgs)) {
      if (SENSITIVE_ARG_KEY_PATTERN.test(key)) {
        parts.push(`${key}=***`);
        continue;
      }
      const text = typeof value === "string" ? value : JSON.stringify(value);
      const compact = (text ?? "").replace(/\s+/g, " ").trim();
      parts.push(
        `${key}=${compact.length > 40 ? `${compact.slice(0, 40)}…` : compact}`
      );
    }
    return parts.length > 0 ? parts.join(", ") : "（无参数）";
  }
}
