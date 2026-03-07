/**
 * 异步任务系统 - 核心类型定义
 *
 * 定义异步任务的元数据、状态、上下文和结果类型
 */

/**
 * 任务状态枚举
 */
export type TaskStatus =
  | "pending" // 等待执行
  | "running" // 执行中
  | "completed" // 已完成
  | "failed" // 失败
  | "cancelled" // 已取消
  | "interrupted"; // 中断（应用重启导致）

/**
 * 异步任务元数据
 */
export interface AsyncTaskMetadata {
  /** 任务唯一 ID */
  taskId: string;

  /** 请求 ID（关联原始 ParsedToolRequest） */
  requestId: string;

  /** 工具 ID */
  toolId: string;

  /** 方法名称 */
  methodName: string;

  /** 完整工具名称（toolId_methodName） */
  toolName: string;

  /** 任务参数 */
  args: Record<string, unknown>;

  /** 创建时间 */
  createdAt: number;

  /** 开始执行时间 */
  startedAt?: number;

  /** 完成时间 */
  completedAt?: number;

  /** 任务状态 */
  status: TaskStatus;

  /** 进度（0-100） */
  progress?: number;

  /** 进度描述 */
  progressMessage?: string;

  /** 执行结果（仅 completed 状态） */
  result?: string;

  /** 错误信息（仅 failed/interrupted 状态） */
  error?: string;

  /** 是否可取消 */
  cancellable: boolean;

  /** 重试来源（如果是重试任务） */
  retriedFrom?: string;

  /** 进度日志 */
  progressLogs?: Array<{ timestamp: number; message: string; percent: number }>;

  /** 关联资产 ID 列表（用于多模态产物，如生成的图片、处理后的视频） */
  resultAssetIds?: string[];
}

/**
 * 任务进度回调
 */
export interface TaskProgressCallback {
  (progress: number, message?: string): void;
}

/**
 * 任务状态变更回调
 */
export interface TaskStatusChangeCallback {
  (taskId: string, status: TaskStatus, metadata: AsyncTaskMetadata): void;
}

/**
 * 异步任务执行上下文
 * 注入到工具方法的 args 中，工具可以通过 args.__asyncContext 访问
 */
export interface AsyncTaskContext {
  /** 任务 ID */
  taskId: string;

  /** 取消信号 */
  signal: AbortSignal;

  /** 进度报告函数 */
  reportProgress: TaskProgressCallback;

  /** 检查是否已取消 */
  checkCancellation: () => void;

  /** 日志记录函数 */
  log: (message: string, data?: Record<string, unknown>) => void;

  /** 任务元数据（只读） */
  readonly metadata: Readonly<Pick<AsyncTaskMetadata, "toolName" | "toolId" | "methodName">>;
}

/**
 * 异步任务执行结果
 */
export interface AsyncTaskResult {
  /** 任务 ID */
  taskId: string;

  /** 执行状态 */
  status: "submitted" | "immediate_result";

  /** 立即结果（仅 immediate_result 状态） */
  result?: string;

  /** 消息提示 */
  message?: string;
}
