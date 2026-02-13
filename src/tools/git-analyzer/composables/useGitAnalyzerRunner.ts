import { invoke } from "@tauri-apps/api/core";
import { customMessage } from "@/utils/customMessage";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { GitCommit } from "../types";
import type { GitProgressEvent } from "./useGitLoader";
import {
  fetchBranches,
  fetchBranchCommits,
  streamLoadRepository,
  streamIncrementalLoad,
  cancelLoadRepository as apiCancelLoadRepository,
  updateCommitMessage as apiUpdateCommitMessage,
} from "./useGitLoader";
import { filterCommits as processFilter } from "./useGitProcessor";
import { useGitAnalyzerState } from "./useGitAnalyzerState";
import { commitCache } from "./useCommitCache";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("GitAnalyzerRunner");
const errorHandler = createModuleErrorHandler("GitAnalyzerRunner");

/**
 * Git 分析器业务编排器
 * 负责协调数据获取和状态更新
 *
 * 采用去中心化组合模式，直接从 useGitAnalyzerState 获取状态
 */
export function useGitAnalyzerRunner() {
  // 获取状态
  const state = useGitAnalyzerState();
  // ==================== 目录选择 ====================

  /**
   * 选择 Git 仓库目录
   */
  async function selectDirectory() {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "选择 Git 仓库目录",
      });
      if (typeof selected === "string") {
        state.repoPath.value = selected;
        customMessage.success(`已选择目录: ${selected}`);
      }
    } catch (error) {
      errorHandler.error(error as Error, "选择目录失败");
    }
  }

  // ==================== 分支操作 ====================

  /**
   * 加载分支列表
   */
  async function loadBranches() {
    const currentRepoPath = state.repoPath.value;

    // 必须提供路径
    if (!currentRepoPath) {
      customMessage.warning('请先输入或选择 Git 仓库路径');
      return false;
    }

    try {
      const branchList = await fetchBranches(currentRepoPath);
      state.branches.value = branchList;

      // 设置当前分支
      const currentBranchInfo = branchList.find((b) => b.current);
      if (currentBranchInfo) {
        state.selectedBranch.value = currentBranchInfo.name;
      }

      return true;
    } catch (error) {
      errorHandler.error(error, "加载分支失败");
      return false;
    }
  }

  /**
   * 切换分支
   */
  async function onBranchChange(branch: string) {
    const currentRepoPath = state.repoPath.value;

    if (!currentRepoPath) {
      customMessage.warning('请先输入或选择 Git 仓库路径');
      return false;
    }

    state.loading.value = true;
    try {
      const result = await fetchBranchCommits(
        currentRepoPath,
        branch,
        state.limitCount.value
      );

      state.commits.value = result;
      state.filteredCommits.value = result;
      state.commitRange.value = [0, result.length];

      customMessage.success(`切换到分支: ${branch}`);
      return true;
    } catch (error) {
      errorHandler.error(error, "切换分支失败");
      return false;
    } finally {
      state.loading.value = false;
    }
  }

  // ==================== 仓库加载 ====================

  /**
   * 处理进度事件
   */
  function handleProgressEvent(event: GitProgressEvent, isIncremental: boolean, initialCount: number) {
    switch (event.type) {
      case "start": {
        state.progress.value.total = event.total || state.limitCount.value;
        if (event.branches) {
          state.branches.value = event.branches;
          const currentBranchInfo = event.branches.find((b) => b.current);
          if (currentBranchInfo) {
            state.selectedBranch.value = currentBranchInfo.name;
          }
        }
        const loadType = state.batchSize.value === 0 ? "" : "流式";
        logger.info(`开始${isIncremental ? '增量' : ''}${loadType}加载，目标总数 ${event.total}`);
        break;
      }

      case "data":
        if (event.commits) {
          if (isIncremental) {
            state.commits.value = [...state.commits.value, ...event.commits];
          } else {
            state.commits.value = [...state.commits.value, ...event.commits];
          }

          // 如果 commit 自带 files，直接存入缓存
          if (state.includeFiles.value && event.commits.some(c => c.files)) {
            const repoPath = state.repoPath.value;
            const branch = state.selectedBranch.value;
            const existing = commitCache.getBatchCommits(repoPath, branch) || [];
            commitCache.setBatchCommits(repoPath, branch, [...existing, ...event.commits]);
          }

          // 实时更新 commitRange 以反映当前已加载的数据
          state.commitRange.value = [0, state.commits.value.length];

          // 应用筛选条件，而不是直接赋值
          filterCommits();

          state.progress.value.loaded = event.loaded || 0;
          // 实时更新已加载限制，以便终止后能继续增量加载
          state.lastLoadedLimit.value = state.progress.value.loaded;

          logger.debug(
            `加载进度: ${event.loaded} / ${state.progress.value.total}`
          );
        }
        break;

      case "end": {
        state.progress.value.loading = false;
        state.loading.value = false;
        state.commitRange.value = [0, state.commits.value.length];

        const loadType = state.batchSize.value === 0 ? "" : "流式";
        if (isIncremental) {
          state.lastLoadedLimit.value = state.limitCount.value;
          const newCount = state.commits.value.length - initialCount;
          customMessage.success(`增量${loadType}加载完成，新增 ${newCount} 条记录，共 ${state.commits.value.length} 条`);
        } else {
          state.lastLoadedRepo.value = state.repoPath.value;
          state.lastLoadedBranch.value = state.selectedBranch.value;
          state.lastLoadedLimit.value = state.limitCount.value;
          customMessage.success(`${loadType}加载完成，共 ${state.commits.value.length} 条提交记录`);
        }

        // 如果流式加载已包含文件信息，则标记完成；否则后台补充加载
        if (state.includeFiles.value) {
          state.loadingFiles.value = false;
          logger.info("文件变更信息已随流式加载一并获取");
        } else {
          loadCommitsWithFiles();
        }
        break;
      }

      case "cancelled":
        state.progress.value.loading = false;
        state.loading.value = false;
        // 确保记录已加载的状态
        state.lastLoadedRepo.value = state.repoPath.value;
        state.lastLoadedBranch.value = state.selectedBranch.value;
        state.lastLoadedLimit.value = state.progress.value.loaded;
        customMessage.info("加载已终止");
        break;

      case "error":
        state.progress.value.loading = false;
        state.loading.value = false;
        const errorMsg = `${isIncremental ? "增量" : ""}加载失败: ${event.message}`;
        errorHandler.error(new Error(event.message || "Unknown error"), errorMsg);
        break;
    }
  }

  /**
   * 加载仓库（支持增量加载）
   */
  async function loadRepository() {
    const currentRepoPath = state.repoPath.value;

    // 必须提供路径
    if (!currentRepoPath) {
      customMessage.warning('请先输入或选择 Git 仓库路径');
      return false;
    }

    const currentBranch = state.selectedBranch.value;

    // 检查是否可以进行增量加载
    const isSameRepo = state.lastLoadedRepo.value === currentRepoPath;
    const isSameBranch = state.lastLoadedBranch.value === currentBranch;
    // 增量加载条件：相同仓库和分支，且 (新限制 > 旧限制 或 新限制为 0 且旧限制 > 0)
    const isIncrementalLoad =
      isSameRepo &&
      isSameBranch &&
      state.lastLoadedLimit.value > 0 &&
      (state.limitCount.value > state.lastLoadedLimit.value || state.limitCount.value === 0);

    if (isIncrementalLoad) {
      // 增量加载
      const skip = state.lastLoadedLimit.value;
      // 如果 limitCount 为 0，则 newLimit 也设为 0（表示加载剩余全部）
      const newLimit =
        state.limitCount.value === 0 ? 0 : state.limitCount.value - state.lastLoadedLimit.value;
      const initialCommitCount = state.commits.value.length;

      state.loading.value = true;
      state.progress.value = {
        loading: true,
        loaded: skip,
        total: state.limitCount.value === 0 ? state.progress.value.total : state.limitCount.value,
      };

      try {
        await streamIncrementalLoad(
          {
            path: currentRepoPath,
            branch: currentBranch,
            skip,
            limit: newLimit,
            batchSize: state.batchSize.value,
            includeFiles: state.includeFiles.value,
          },
          (event) => handleProgressEvent(event, true, initialCommitCount)
        );
        return true;
      } catch (error) {
        state.progress.value.loading = false;
        state.loading.value = false;
        errorHandler.error(error, "增量加载失败");
        return false;
      }
    }

    // 全量加载
    state.resetCommits();
    state.loading.value = true;
    state.progress.value = {
      loading: true,
      loaded: 0,
      total: 0,
    };

    try {
      await streamLoadRepository(
        {
          path: currentRepoPath,
          limit: state.limitCount.value,
          batchSize: state.batchSize.value,
          includeFiles: state.includeFiles.value,
        },
        (event) => handleProgressEvent(event, false, 0)
      );
      return true;
    } catch (error) {
      state.progress.value.loading = false;
      state.loading.value = false;
      errorHandler.error(error, "加载仓库失败");
      return false;
    }
  }

  /**
   * 刷新仓库（强制全量重新加载）
   */
  async function refreshRepository() {
    // 强制重置最后加载的限制，以触发全量加载
    state.lastLoadedLimit.value = 0;
    return await loadRepository();
  }

  /**
   * 终止加载
   */
  async function cancelLoading() {
    await apiCancelLoadRepository();
    // 状态更新将通过事件回调中的 "cancelled" 事件统一处理
  }

  // ==================== 文件变更信息加载 ====================

  /**
   * 后台加载所有提交的文件变更信息
   * 在仓库加载完成后自动调用，数据存入 commitCache
   */
  async function loadCommitsWithFiles() {
    const currentRepoPath = state.repoPath.value;
    const currentBranch = state.selectedBranch.value;

    if (!currentRepoPath || state.commits.value.length === 0) return;

    // 检查缓存是否已存在
    const cached = commitCache.getBatchCommits(currentRepoPath, currentBranch);
    if (cached && cached.length > 0) {
      logger.debug("文件变更信息已有缓存，跳过加载", {
        repoPath: currentRepoPath,
        branch: currentBranch,
        cachedCount: cached.length,
      });
      return;
    }

    state.loadingFiles.value = true;
    try {
      const commits = await invoke<GitCommit[]>("git_load_commits_with_files", {
        path: currentRepoPath,
        branch: currentBranch,
        limit: state.commits.value.length,
      });

      commitCache.setBatchCommits(currentRepoPath, currentBranch, commits);
      logger.info("文件变更信息加载完成", { count: commits.length });
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "加载文件变更信息失败",
        showToUser: false,
        context: {
          repoPath: currentRepoPath,
          branch: currentBranch,
          totalCommits: state.commits.value.length,
        },
      });
    } finally {
      state.loadingFiles.value = false;
    }
  }

  // ==================== 筛选操作 ====================

  /**
   * 应用筛选条件
   */
  function filterCommits() {
    if (state.hasActiveFilters.value) {
      logger.info(`应用筛选`, state.filterSummary.value);
    }
    // 首先根据范围选择器从原始列表中切片
    const rangedCommits = state.commits.value.slice(
      state.commitRange.value[0],
      state.commitRange.value[1]
    );

    // 应用筛选
    const filtered = processFilter(rangedCommits, {
      searchQuery: state.searchQuery.value,
      authorFilter: state.authorFilter.value,
      dateRange: state.dateRange.value,
      commitTypeFilter: state.commitTypeFilter.value,
      reverseOrder: state.reverseOrder.value,
    });

    state.filteredCommits.value = filtered;
    state.currentPage.value = 1;
  }

  /**
   * 清除筛选条件
   */
  function clearFilters() {
    state.resetFilters();
    // 重新应用筛选（此时只会应用范围选择）
    filterCommits();
  }

  // ==================== 文件操作 ====================

  /**
   * 修改提交消息
   */
  async function updateCommitMessage(hash: string, message: string) {
    const currentRepoPath = state.repoPath.value;
    if (!currentRepoPath) {
      customMessage.warning("请先选择 Git 仓库路径");
      return false;
    }

    state.loading.value = true;
    try {
      const result = await apiUpdateCommitMessage(currentRepoPath, hash, message);
      customMessage.success(result);

      // 更新本地状态中的提交记录
      const commitIndex = state.commits.value.findIndex(c => c.hash === hash);
      if (commitIndex !== -1) {
        const commit = state.commits.value[commitIndex];
        // 更新简短消息和完整消息
        const lines = message.split('\n');
        commit.message = lines[0] || "";
        commit.full_message = message;
      }

      // 重新应用筛选以更新视图
      filterCommits();

      return true;
    } catch (error) {
      errorHandler.error(error, "修改提交消息失败");
      return false;
    } finally {
      state.loading.value = false;
    }
  }

  /**
   * 处理路径拖放
   */
  function handlePathDrop(paths: string[]) {
    if (paths.length > 0) {
      state.repoPath.value = paths[0];
      customMessage.success(`已设置 Git 仓库路径: ${paths[0]}`);

      // 自动加载仓库
      setTimeout(() => {
        loadRepository();
      }, 500);
    }
  }

  // ==================== 返回接口 ====================

  return {
    // 目录操作
    selectDirectory,
    handlePathDrop,

    // 分支操作
    loadBranches,
    onBranchChange,

    // 仓库加载
    loadRepository,
    refreshRepository,
    cancelLoading,

    // 提交操作
    updateCommitMessage,

    // 筛选操作
    filterCommits,
    clearFilters,
  };
}