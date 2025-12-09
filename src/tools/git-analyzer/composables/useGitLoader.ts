import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { GitCommit, GitBranch } from "../types";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("GitLoader");
const errorHandler = createModuleErrorHandler("GitLoader");

// ==================== 类型定义 ====================

/**
 * Git 进度事件
 */
export interface GitProgressEvent {
  type: "start" | "data" | "end" | "error";
  total?: number;
  branches?: GitBranch[];
  commits?: GitCommit[];
  loaded?: number;
  message?: string;
}

/**
 * 流式加载选项
 */
export interface StreamLoadOptions {
  path: string;
  limit: number;
  batchSize: number;
}

/**
 * 增量加载选项
 */
export interface IncrementalLoadOptions extends StreamLoadOptions {
  branch: string;
  skip: number;
}

/**
 * 流式加载结果
 */
export interface StreamLoadResult {
  branches?: GitBranch[];
  commits: GitCommit[];
  total: number;
}

// ==================== 数据获取函数 ====================

/**
 * 获取分支列表
 */
export async function fetchBranches(path: string): Promise<GitBranch[]> {
  logger.info("获取分支列表", { path });
  
  try {
    const branches = await invoke<GitBranch[]>("git_get_branches", { path });
    logger.info(`成功获取 ${branches.length} 个分支`);
    return branches;
  } catch (error) {
    errorHandler.handle(error as Error, { userMessage: "获取分支列表失败", context: { path }, showToUser: false });
    throw error;
  }
}

/**
 * 获取指定分支的提交记录
 */
export async function fetchBranchCommits(
  path: string,
  branch: string,
  limit: number
): Promise<GitCommit[]> {
  logger.info("获取分支提交", { path, branch, limit });
  
  try {
    const commits = await invoke<GitCommit[]>("git_get_branch_commits", {
      path,
      branch,
      limit,
    });
    logger.info(`成功获取 ${commits.length} 条提交`);
    return commits;
  } catch (error) {
    errorHandler.handle(error as Error, { userMessage: "获取分支提交失败", context: { path, branch, limit }, showToUser: false });
    throw error;
  }
}

/**
 * 获取指定提交的详细信息
 */
export async function fetchCommitDetail(
  path: string,
  hash: string
): Promise<GitCommit> {
  logger.info("获取提交详情", { path, hash });
  
  try {
    const commit = await invoke<GitCommit>("git_get_commit_detail", {
      path,
      hash,
    });
    logger.info(`成功获取提交 ${hash} 的详情`);
    return commit;
  } catch (error) {
    errorHandler.handle(error as Error, { userMessage: "获取提交详情失败", context: { path, hash }, showToUser: false });
    throw error;
  }
}

/**
 * 流式加载仓库数据
 * 通过事件监听逐步获取数据
 */
export async function streamLoadRepository(
  options: StreamLoadOptions,
  onProgress: (event: GitProgressEvent) => void
): Promise<void> {
  const { path, limit, batchSize } = options;
  logger.info("开始流式加载仓库", { path, limit, batchSize });

  return new Promise<void>(async (resolve, reject) => {
    let unlisten: UnlistenFn | null = null;

    try {
      // 监听进度事件
      unlisten = await listen<GitProgressEvent>("git-progress", (event) => {
        const payload = event.payload;
        
        // 调用进度回调
        onProgress(payload);
        
        // 当接收到 end 或 error 事件时，清理监听器并完成 Promise
        if (payload.type === "end") {
          if (unlisten) {
            unlisten();
            unlisten = null;
          }
          resolve();
        } else if (payload.type === "error") {
          if (unlisten) {
            unlisten();
            unlisten = null;
          }
          reject(new Error(payload.message || "Unknown error"));
        }
      });

      // 调用流式加载命令
      await invoke("git_load_repository_stream", {
        path,
        limit,
        batchSize,
      });
    } catch (error) {
      // 清理监听器
      if (unlisten) {
        unlisten();
      }
      errorHandler.handle(error as Error, { userMessage: "流式加载失败", context: { path, limit }, showToUser: false });
      reject(error);
    }
  });
}

/**
 * 流式增量加载
 */
export async function streamIncrementalLoad(
  options: IncrementalLoadOptions,
  onProgress: (event: GitProgressEvent) => void
): Promise<void> {
  const { path, branch, skip, limit, batchSize } = options;
  logger.info("开始增量流式加载", { path, branch, skip, limit, batchSize });

  return new Promise<void>(async (resolve, reject) => {
    let unlisten: UnlistenFn | null = null;

    try {
      // 监听进度事件
      unlisten = await listen<GitProgressEvent>("git-progress", (event) => {
        const payload = event.payload;
        
        // 调用进度回调
        onProgress(payload);
        
        // 当接收到 end 或 error 事件时，清理监听器并完成 Promise
        if (payload.type === "end") {
          if (unlisten) {
            unlisten();
            unlisten = null;
          }
          resolve();
        } else if (payload.type === "error") {
          if (unlisten) {
            unlisten();
            unlisten = null;
          }
          reject(new Error(payload.message || "Unknown error"));
        }
      });

      // 调用增量加载命令
      await invoke("git_load_incremental_stream", {
        path,
        branch,
        skip,
        limit,
        batchSize,
      });
    } catch (error) {
      // 清理监听器
      if (unlisten) {
        unlisten();
      }
      errorHandler.handle(error as Error, { userMessage: "增量加载失败", context: { path, branch, skip, limit }, showToUser: false });
      reject(error);
    }
  });
}