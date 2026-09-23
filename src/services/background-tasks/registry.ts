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

/**
 * 后台任务内存 registry 服务
 *
 * 对应设计文档：src/tools/sub-agent/docs/Plan/background-agent-observability-and-intervention.md
 * 的 §4（后台任务数据模型）、§5.2（订阅语义）与 §9 Phase 1（可观察任务壳）。
 *
 * Phase 1 边界：
 * - 任务创建后直接进入 running，没有排队器；
 * - registry 只负责任务状态、活动记录、快照读取、事件订阅与持久化恢复，
 *   不负责任务的实际执行（执行由 assistant.ask 埋点与后续 runtime 承担）；
 * - 快照持久化通过 createConfigManager 落盘（非 Tauri 环境自动降级为内存存储）。
 */

import { createConfigManager } from "@/utils/configManager";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import type {
  AppendActivityInput,
  BackgroundTaskActivity,
  BackgroundTaskChangeListener,
  BackgroundTaskChangeEvent,
  BackgroundTaskOperation,
  BackgroundTaskSnapshot,
  BackgroundTaskState,
  BackgroundTerminalTaskState,
  CreateBackgroundTaskInput,
  ListTasksFilter,
  MessageOrigin,
  UpdateTaskStatePatch,
} from "./types";

const logger = createModuleLogger("background-tasks/registry");
const errorHandler = createModuleErrorHandler("background-tasks/registry");

// ==================== 常量 ====================

/** 当前后台运行时代次（Phase 1 内存 registry 固定为 1） */
const CURRENT_RUNTIME_GENERATION = 1;

/** recentActivity 保留的最大条数 */
const RECENT_ACTIVITY_LIMIT = 8;

/** lastOperationSummary 与活动摘要的最大长度（超出截断） */
const SUMMARY_MAX_LENGTH = 120;

/** 持久化快照索引的上限（超出优先淘汰最旧终态任务） */
const MAX_PERSISTED_TASKS = 50;

/** 持久化数据结构版本 */
const PERSISTENCE_VERSION = "1.0.0";

/** 终态集合 */
const TERMINAL_STATES: readonly BackgroundTerminalTaskState[] = [
  "completed",
  "failed",
  "cancelled",
  "interrupted",
];

/** 会推进 lastProgressAt 的活动类型（llm/tool 类） */
const PROGRESS_ACTIVITY_KINDS: ReadonlySet<string> = new Set([
  "llm_started",
  "llm_progress",
  "tool_started",
  "tool_progress",
  "tool_finished",
]);

/** 持久化 payload 结构 */
interface BackgroundTaskPersistencePayload {
  version: string;
  tasks: BackgroundTaskSnapshot[];
}

// ==================== 内部工具函数 ====================

/** 当前时间的 ISO 8601 字符串 */
function nowIso(): string {
  return new Date().toISOString();
}

/** 判断任务状态是否为终态 */
function isTerminalState(
  state: BackgroundTaskState
): state is BackgroundTerminalTaskState {
  return (TERMINAL_STATES as readonly string[]).includes(state);
}

/** 截断超长摘要 */
function truncateSummary(summary: string): string {
  const text = typeof summary === "string" ? summary : String(summary ?? "");
  return text.length > SUMMARY_MAX_LENGTH
    ? `${text.slice(0, SUMMARY_MAX_LENGTH)}…`
    : text;
}

/** 任务快照深拷贝（防止外部改动影响内部状态） */
function cloneSnapshot(
  snapshot: BackgroundTaskSnapshot
): BackgroundTaskSnapshot {
  const cloned: BackgroundTaskSnapshot = {
    ...snapshot,
    owner: { ...snapshot.owner },
    callerAgent: { ...snapshot.callerAgent },
    targetAgent: { ...snapshot.targetAgent },
    recentActivity: snapshot.recentActivity.map((activity) => ({
      ...activity,
      actor: { ...activity.actor },
      operation: activity.operation ? { ...activity.operation } : undefined,
    })),
  };
  if (snapshot.currentOperation) {
    cloned.currentOperation = { ...snapshot.currentOperation };
  }
  if (snapshot.result) {
    cloned.result = { ...snapshot.result };
  }
  if (snapshot.error) {
    cloned.error = { ...snapshot.error };
  }
  return cloned;
}

/**
 * 规整从持久化加载的任务快照，过滤损坏数据并补齐关键字段。
 * 返回 null 表示该条数据无效，应丢弃。
 */
function normalizeLoadedSnapshot(raw: unknown): BackgroundTaskSnapshot | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const candidate = raw as Partial<BackgroundTaskSnapshot>;
  if (
    typeof candidate.taskId !== "string" ||
    candidate.taskId.length === 0 ||
    typeof candidate.seq !== "number" ||
    !Number.isFinite(candidate.seq) ||
    typeof candidate.state !== "string" ||
    !Array.isArray(candidate.recentActivity)
  ) {
    return null;
  }
  const callerAgent = candidate.callerAgent ?? {
    kind: "system",
    channel: "system_event",
  };
  const owner = candidate.owner ?? callerAgent;
  const executionLaneKey =
    candidate.executionLaneKey ??
    (typeof candidate.childSessionId === "string"
      ? `sub-agent:${candidate.childSessionId}`
      : `task:${candidate.taskId}`);
  return {
    ...(candidate as BackgroundTaskSnapshot),
    owner: { ...owner },
    callerAgent: { ...callerAgent },
    executionLaneKey,
    parentSessionId: candidate.parentSessionId || null,
    lastOperationSummary:
      typeof candidate.lastOperationSummary === "string"
        ? candidate.lastOperationSummary
        : "",
    stale: candidate.stale === true,
    recentActivity: candidate.recentActivity.filter(
      (activity) => !!activity && typeof activity.id === "string"
    ),
  };
}

// ==================== 服务类 ====================

/**
 * 后台任务 registry。
 *
 * 持有任务的内存快照索引，提供创建、查询、活动追加、状态流转、
 * 当前操作同步、取消与事件订阅能力；并通过 createConfigManager
 * 将任务快照（上限 50 条）持久化，初始化时恢复。
 */
export class BackgroundTaskRegistry {
  /** 任务快照索引（taskId → snapshot） */
  private tasks = new Map<string, BackgroundTaskSnapshot>();

  /** 任务事件监听器 */
  private listeners = new Set<BackgroundTaskChangeListener>();

  /** 持久化管理器 */
  private persistence: ReturnType<
    typeof createConfigManager<BackgroundTaskPersistencePayload>
  >;

  /** 初始化恢复是否完成（完成前不触发落盘，避免用空状态覆盖旧快照） */
  private hydrated = false;

  /** 初始化恢复的共享 Promise（保证幂等） */
  private hydrationPromise: Promise<void> | null = null;

  /** taskId 生成计数器（模块级顺序号） */
  private taskIdCounter = 0;

  constructor(options?: { persistenceFileName?: string }) {
    this.persistence = createConfigManager<BackgroundTaskPersistencePayload>({
      moduleName: "background-tasks",
      fileName: options?.persistenceFileName ?? "tasks.json",
      version: PERSISTENCE_VERSION,
      createDefault: () => ({ version: PERSISTENCE_VERSION, tasks: [] }),
      mergeConfig: (defaults, loaded) => ({
        version: PERSISTENCE_VERSION,
        tasks: Array.isArray(loaded?.tasks)
          ? (loaded.tasks as BackgroundTaskSnapshot[])
          : defaults.tasks,
      }),
    });
    // 初始化时异步加载持久化快照并恢复观察状态
    void this.loadFromPersistence();
  }

  // ==================== 任务创建与查询 ====================

  /**
   * 创建后台任务。
   *
   * 生成 taskId（前缀 bgtask-），state 初始为 running（Phase 1 无排队器），
   * seq 从 1 递增（task_created 活动），并返回快照拷贝。
   *
   * @returns 任务快照；创建失败时返回 null
   */
  public createTask(
    input: CreateBackgroundTaskInput
  ): BackgroundTaskSnapshot | null {
    return errorHandler.wrapSync(
      () => {
        const now = nowIso();
        const taskId = this.generateTaskId();
        const targetName =
          input.targetAgent.actorDisplayName ??
          input.targetAgent.actorName ??
          input.targetAgent.actorId ??
          "未知智能体";
        const snapshot: BackgroundTaskSnapshot = {
          taskId,
          seq: 0,
          parentTaskId: input.parentTaskId,
          owner: { ...input.owner },
          executionLaneKey: input.executionLaneKey,
          parentSessionId: input.parentSessionId,
          childSessionId: input.childSessionId,
          conversationId: input.conversationId,
          callerAgent: { ...input.callerAgent },
          targetAgent: { ...input.targetAgent },
          state: input.initialState ?? "running",
          phase: input.phase ?? "started",
          createdAt: now,
          startedAt:
            (input.initialState ?? "running") === "running" ? now : undefined,
          updatedAt: now,
          lastOperationSummary: "",
          stale: false,
          recentActivity: [],
          runtimeGeneration: CURRENT_RUNTIME_GENERATION,
        };
        this.tasks.set(taskId, snapshot);
        this.appendActivityRecord(snapshot, {
          kind: "task_created",
          actor: { ...input.callerAgent },
          summary: `任务已创建：${targetName}`,
          detailRef: input.childSessionId,
        });
        this.emit({ taskId, seq: snapshot.seq, type: "updated" });
        this.persistDebounced();
        logger.info("后台任务已创建", {
          taskId,
          childSessionId: input.childSessionId,
          conversationId: input.conversationId,
        });
        return cloneSnapshot(snapshot);
      },
      {
        userMessage: "创建后台任务失败",
        context: { conversationId: input.conversationId },
      }
    );
  }

  /**
   * 按任务 ID 读取快照。
   *
   * @returns 快照浅拷贝；任务不存在时返回 null
   */
  public getSnapshot(taskId: string): BackgroundTaskSnapshot | null {
    return errorHandler.wrapSync(
      () => {
        const snapshot = this.tasks.get(taskId);
        return snapshot ? cloneSnapshot(snapshot) : null;
      },
      { userMessage: "读取后台任务快照失败", context: { taskId } }
    );
  }

  /**
   * 列出任务快照。
   *
   * 可按状态集合与父任务 ID 过滤；结果按 updatedAt 倒序排列。
   *
   * @returns 快照拷贝数组
   */
  public listTasks(filter?: ListTasksFilter): BackgroundTaskSnapshot[] {
    return (
      errorHandler.wrapSync(
        () => {
          const states = filter?.states;
          const parentTaskId = filter?.parentTaskId;
          const list = [...this.tasks.values()].filter((snapshot) => {
            if (states && !states.includes(snapshot.state)) {
              return false;
            }
            if (
              parentTaskId !== undefined &&
              snapshot.parentTaskId !== parentTaskId
            ) {
              return false;
            }
            return true;
          });
          list.sort(
            (a, b) =>
              b.updatedAt.localeCompare(a.updatedAt) ||
              b.createdAt.localeCompare(a.createdAt)
          );
          return list.map(cloneSnapshot);
        },
        { userMessage: "列出后台任务失败", context: { filter } }
      ) ?? []
    );
  }

  // ==================== 活动与状态 ====================

  /**
   * 追加一条活动记录。
   *
   * 自动生成活动 id 与 timestamp，任务 seq 递增，刷新 lastActivityAt
   * （llm/tool 类活动同时刷新 lastProgressAt）与 updatedAt；
   * recentActivity 只保留最近 8 条。
   *
   * @returns 更新后的快照拷贝；任务不存在时返回 null
   */
  public appendActivity(
    taskId: string,
    input: AppendActivityInput
  ): BackgroundTaskSnapshot | null {
    return errorHandler.wrapSync(
      () => {
        const snapshot = this.tasks.get(taskId);
        if (!snapshot) {
          return null;
        }
        this.appendActivityRecord(snapshot, input);
        this.emit({ taskId, seq: snapshot.seq, type: "activity" });
        this.persistDebounced();
        logger.debug("后台任务活动已追加", { taskId, kind: input.kind });
        return cloneSnapshot(snapshot);
      },
      {
        userMessage: "追加后台任务活动失败",
        context: { taskId, kind: input.kind },
      }
    );
  }

  /**
   * 更新任务状态并追加 state_changed 活动。
   *
   * 终态时清空 currentOperation；updatedAt 随活动追加自动刷新。
   * 任务已处于终态时拒绝流转（返回 null），防止改写历史。
   *
   * @returns 更新后的快照拷贝；任务不存在或已终态时返回 null
   */
  public updateTaskState(
    taskId: string,
    state: BackgroundTaskState,
    patch?: UpdateTaskStatePatch
  ): BackgroundTaskSnapshot | null {
    return errorHandler.wrapSync(
      () => {
        const snapshot = this.tasks.get(taskId);
        if (!snapshot) {
          return null;
        }
        if (isTerminalState(snapshot.state)) {
          logger.debug("任务已处于终态，拒绝状态流转", {
            taskId,
            from: snapshot.state,
            to: state,
          });
          return null;
        }
        const previousState = snapshot.state;
        snapshot.state = state;
        if (state === "running" && !snapshot.startedAt) {
          snapshot.startedAt = nowIso();
        }
        const { result, error, stale, staleReason, attention, phase } =
          patch ?? {};
        if (result !== undefined) {
          snapshot.result = { ...result };
        }
        if (error !== undefined) {
          snapshot.error = { ...error };
        }
        if (stale !== undefined) {
          snapshot.stale = stale;
        }
        if (staleReason !== undefined) {
          snapshot.staleReason = staleReason;
        }
        if (attention !== undefined) {
          snapshot.attention = attention;
        }
        if (phase !== undefined) {
          snapshot.phase = phase;
        }
        if (isTerminalState(state)) {
          snapshot.currentOperation = undefined;
        }
        this.appendActivityRecord(snapshot, {
          kind: "state_changed",
          actor: { kind: "system", channel: "system_event" },
          summary: `任务状态由 ${previousState} 变更为 ${state}`,
        });
        this.emit({ taskId, seq: snapshot.seq, type: "state_changed" });
        this.persistDebounced();
        logger.info("后台任务状态流转", { taskId, previousState, state });
        return cloneSnapshot(snapshot);
      },
      { userMessage: "更新后台任务状态失败", context: { taskId, state } }
    );
  }

  /**
   * 同步当前操作。
   *
   * 传入 operation 时记录 currentOperation 并由其 summary 派生
   * lastOperationSummary（超长截断）；传入 null 时仅清空 currentOperation，
   * lastOperationSummary 保留最后一次摘要。
   *
   * @returns 更新后的快照拷贝；任务不存在或已终态时返回 null
   */
  public setCurrentOperation(
    taskId: string,
    operation: BackgroundTaskOperation | null
  ): BackgroundTaskSnapshot | null {
    return errorHandler.wrapSync(
      () => {
        const snapshot = this.tasks.get(taskId);
        if (!snapshot) {
          return null;
        }
        if (isTerminalState(snapshot.state)) {
          logger.debug("任务已处于终态，忽略当前操作更新", { taskId });
          return null;
        }
        if (operation) {
          snapshot.currentOperation = {
            ...operation,
            summary: truncateSummary(operation.summary),
          };
          snapshot.lastOperationSummary = truncateSummary(operation.summary);
        } else {
          snapshot.currentOperation = undefined;
        }
        snapshot.updatedAt = nowIso();
        this.emit({ taskId, seq: snapshot.seq, type: "updated" });
        this.persistDebounced();
        return cloneSnapshot(snapshot);
      },
      {
        userMessage: "更新后台任务当前操作失败",
        context: { taskId },
      }
    );
  }

  /**
   * 取消任务。
   *
   * 仅非终态任务可取消；置为 cancelled 并追加 state_changed 活动。
   * 终态任务重复取消时返回 false（幂等），任务不存在时也返回 false。
   */
  public cancelTask(taskId: string, reason?: string): boolean {
    const result = errorHandler.wrapSync(
      () => {
        const snapshot = this.tasks.get(taskId);
        if (!snapshot) {
          logger.debug("取消失败：任务不存在", { taskId });
          return false;
        }
        if (isTerminalState(snapshot.state)) {
          logger.debug("取消失败：任务已处于终态", {
            taskId,
            state: snapshot.state,
          });
          return false;
        }
        const previousState = snapshot.state;
        snapshot.state = "cancelled";
        snapshot.attention = undefined;
        snapshot.currentOperation = undefined;
        if (reason) {
          snapshot.error = {
            code: "user_cancelled",
            message: reason,
            failedAt: nowIso(),
          };
        }
        this.appendActivityRecord(snapshot, {
          kind: "state_changed",
          actor: { kind: "system", channel: "system_event" },
          summary: reason ? `任务已取消：${reason}` : "任务已取消",
        });
        this.emit({ taskId, seq: snapshot.seq, type: "state_changed" });
        this.persistDebounced();
        logger.info("后台任务已取消", { taskId, previousState, reason });
        return true;
      },
      { userMessage: "取消后台任务失败", context: { taskId, reason } }
    );
    return result ?? false;
  }

  // ==================== 事件订阅 ====================

  /**
   * 订阅任务变更事件。
   *
   * 任何变更（更新、活动、状态流转）都会发出
   * { taskId, seq, type: "updated" | "activity" | "state_changed" }。
   *
   * @returns 取消订阅函数
   */
  public subscribe(listener: BackgroundTaskChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** 向所有监听器广播事件；单个监听器异常不影响其它监听器与调用方 */
  private emit(event: BackgroundTaskChangeEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (error) {
        logger.warn("后台任务事件监听器执行失败", {
          taskId: event.taskId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // ==================== 持久化与恢复 ====================

  /**
   * 加载持久化快照并恢复观察状态。
   *
   * - 加载的内容与内存中已有任务按 taskId 合并，内存优先（处理初始化
   *   异步窗口期间创建的任务）；
   * - 非终态任务转换为 interrupted、stale=true、
   *   staleReason="runtime_heartbeat_lost"，并追加一条 state_changed
   *   活动（actor 为 system_event）；
   * - 方法幂等，重复调用复用同一次加载。
   */
  public loadFromPersistence(): Promise<void> {
    this.hydrationPromise ??= this.doHydrate();
    return this.hydrationPromise;
  }

  /** 实际执行恢复流程 */
  private async doHydrate(): Promise<void> {
    try {
      const payload = await this.persistence.load();
      const loaded = Array.isArray(payload?.tasks) ? payload.tasks : [];
      const existing = new Map(this.tasks);
      const restored: BackgroundTaskSnapshot[] = [];
      for (const raw of loaded) {
        const snapshot = normalizeLoadedSnapshot(raw);
        if (!snapshot) {
          logger.warn("忽略无效的后台任务持久化快照", {
            taskId: (raw as Partial<BackgroundTaskSnapshot>)?.taskId,
          });
          continue;
        }
        if (existing.has(snapshot.taskId)) {
          // 内存中已存在同 ID 任务（初始化窗口期间创建），内存优先
          continue;
        }
        restored.push(snapshot);
      }

      this.tasks.clear();
      for (const snapshot of restored) {
        this.tasks.set(snapshot.taskId, snapshot);
      }
      for (const [taskId, snapshot] of existing) {
        this.tasks.set(taskId, snapshot);
      }

      const systemActor: MessageOrigin = {
        kind: "system",
        channel: "system_event",
      };
      let recovered = 0;
      for (const snapshot of restored) {
        if (isTerminalState(snapshot.state)) {
          continue;
        }
        // 应用重启后任务不能声称仍在执行，统一恢复为明确的中断状态
        snapshot.state = "interrupted";
        snapshot.stale = true;
        snapshot.staleReason = "runtime_heartbeat_lost";
        snapshot.currentOperation = undefined;
        this.appendActivityRecord(snapshot, {
          kind: "state_changed",
          actor: systemActor,
          summary: "后台运行时心跳丢失，任务在应用重启后标记为中断",
        });
        this.emit({
          taskId: snapshot.taskId,
          seq: snapshot.seq,
          type: "state_changed",
        });
        recovered += 1;
      }

      this.hydrated = true;
      if (restored.length > 0 || recovered > 0) {
        logger.info("后台任务快照恢复完成", {
          restored: restored.length,
          recoveredToInterrupted: recovered,
        });
      }
      if (recovered > 0) {
        // 把恢复结果落盘，避免下次启动重复转换
        this.persistDebounced();
      }
    } catch (error) {
      // 失败也要标记完成，避免永久阻塞后续落盘
      this.hydrated = true;
      errorHandler.handle(error as Error, {
        userMessage: "恢复后台任务快照失败",
        showToUser: false,
      });
    }
  }

  /** 触发防抖持久化；恢复完成前不落盘，避免用不完整状态覆盖旧快照 */
  private persistDebounced(): void {
    if (!this.hydrated) {
      return;
    }
    this.persistence.saveDebounced(this.buildPersistencePayload());
  }

  /**
   * 构建持久化 payload。
   *
   * 超过上限时优先淘汰最旧的终态任务；非终态任务不受淘汰影响。
   */
  private buildPersistencePayload(): BackgroundTaskPersistencePayload {
    const all = [...this.tasks.values()];
    let list = all;
    if (all.length > MAX_PERSISTED_TASKS) {
      const byOldest = [...all].sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) ||
          a.taskId.localeCompare(b.taskId)
      );
      const evictIds = new Set(
        byOldest
          .filter((snapshot) => isTerminalState(snapshot.state))
          .slice(0, all.length - MAX_PERSISTED_TASKS)
          .map((snapshot) => snapshot.taskId)
      );
      if (evictIds.size > 0) {
        logger.info("持久化快照超出上限，淘汰最旧终态任务", {
          evicted: evictIds.size,
          total: all.length,
          limit: MAX_PERSISTED_TASKS,
        });
      }
      list = all.filter((snapshot) => !evictIds.has(snapshot.taskId));
    }
    return {
      version: PERSISTENCE_VERSION,
      tasks: list.map(cloneSnapshot),
    };
  }

  // ==================== 内部辅助 ====================

  /** 生成任务 ID（前缀 bgtask-） */
  private generateTaskId(): string {
    this.taskIdCounter += 1;
    const random =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10);
    return `bgtask-${this.taskIdCounter.toString(36)}-${random}`;
  }

  /**
   * 内部活动追加：生成活动 id 与 timestamp，seq 递增，
   * 刷新 lastActivityAt / lastProgressAt / updatedAt，维护 recentActivity 上限。
   * 不负责 emit 与持久化，由调用方按变更类型处理。
   */
  private appendActivityRecord(
    snapshot: BackgroundTaskSnapshot,
    input: AppendActivityInput
  ): BackgroundTaskActivity {
    const now = nowIso();
    snapshot.seq += 1;
    const activity: BackgroundTaskActivity = {
      id: `bgtact-${snapshot.taskId}-${snapshot.seq}`,
      taskId: snapshot.taskId,
      kind: input.kind,
      actor: { ...input.actor },
      timestamp: now,
      summary: truncateSummary(input.summary),
      operation: input.operation ? { ...input.operation } : undefined,
      detailRef: input.detailRef,
    };
    snapshot.recentActivity.push(activity);
    if (snapshot.recentActivity.length > RECENT_ACTIVITY_LIMIT) {
      snapshot.recentActivity.splice(
        0,
        snapshot.recentActivity.length - RECENT_ACTIVITY_LIMIT
      );
    }
    snapshot.lastActivityAt = now;
    if (PROGRESS_ACTIVITY_KINDS.has(input.kind)) {
      snapshot.lastProgressAt = now;
    }
    snapshot.updatedAt = now;
    return activity;
  }
}

// ==================== 单例导出 ====================

/** 后台任务 registry 单例 */
export const backgroundTaskRegistry = new BackgroundTaskRegistry();
