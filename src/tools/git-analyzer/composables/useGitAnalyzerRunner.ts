import { customMessage } from "@/utils/customMessage";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { GitProgressEvent } from "./useGitLoader";
import {
  fetchBranches,
  fetchBranchCommits,
  streamLoadRepository,
  streamIncrementalLoad,
} from "./useGitLoader";
import { filterCommits as processFilter } from "./useGitProcessor";
import { useGitAnalyzerState } from "./useGitAnalyzerState";
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
      customMessage.error(`加载分支失败: ${error}`);
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
      customMessage.error(`切换分支失败: ${error}`);
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
      case "start":
        state.progress.value.total = event.total || state.limitCount.value;
        if (event.branches) {
          state.branches.value = event.branches;
          const currentBranchInfo = event.branches.find((b) => b.current);
          if (currentBranchInfo) {
            state.selectedBranch.value = currentBranchInfo.name;
          }
        }
        logger.info(`开始${isIncremental ? '增量' : ''}流式加载，目标总数 ${event.total}`);
        break;

      case "data":
        if (event.commits) {
          if (isIncremental) {
            // 增量加载：累积新提交
            state.commits.value = [...state.commits.value, ...event.commits];
          } else {
            // 全量加载：直接累积
            state.commits.value = [...state.commits.value, ...event.commits];
          }
          
          // 实时更新 commitRange 以反映当前已加载的数据
          state.commitRange.value = [0, state.commits.value.length];
          
          // 应用筛选条件，而不是直接赋值
          filterCommits();
          
          state.progress.value.loaded = event.loaded || 0;
          
          logger.debug(
            `加载进度: ${event.loaded} / ${state.progress.value.total}`
          );
        }
        break;

      case "end":
        state.progress.value.loading = false;
        state.loading.value = false;
        state.commitRange.value = [0, state.commits.value.length];

        if (isIncremental) {
          state.lastLoadedLimit.value = state.limitCount.value;
          const newCount = state.commits.value.length - initialCount;
          customMessage.success(`增量加载了 ${newCount} 条新提交记录，当前共 ${state.commits.value.length} 条`);
        } else {
          state.lastLoadedRepo.value = state.repoPath.value;
          state.lastLoadedBranch.value = state.selectedBranch.value;
          state.lastLoadedLimit.value = state.limitCount.value;
          customMessage.success(`流式加载完成，共 ${state.commits.value.length} 条提交记录`);
        }
        break;

      case "error":
        state.progress.value.loading = false;
        state.loading.value = false;
        const errorMsg = `${isIncremental ? "增量" : ""}加载失败: ${event.message}`;
        customMessage.error(errorMsg);
        errorHandler.error(new Error(event.message || "Unknown error"), errorMsg, { showToUser: false });
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
    const isIncrementalLoad =
      isSameRepo && isSameBranch && state.limitCount.value > state.lastLoadedLimit.value;

    if (isIncrementalLoad) {
      // 增量加载
      const skip = state.lastLoadedLimit.value;
      const newLimit = state.limitCount.value - state.lastLoadedLimit.value;
      const initialCommitCount = state.commits.value.length;

      state.loading.value = true;
      state.progress.value = {
        loading: true,
        loaded: skip,
        total: state.limitCount.value,
      };

      try {
        await streamIncrementalLoad(
          {
            path: currentRepoPath,
            branch: currentBranch,
            skip,
            limit: newLimit,
            batchSize: state.batchSize.value,
          },
          (event) => handleProgressEvent(event, true, initialCommitCount)
        );
        return true;
      } catch (error) {
        state.progress.value.loading = false;
        state.loading.value = false;
        customMessage.error(`增量加载失败: ${error}`);
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
        },
        (event) => handleProgressEvent(event, false, 0)
      );
      return true;
    } catch (error) {
      state.progress.value.loading = false;
      state.loading.value = false;
      customMessage.error(`加载仓库失败: ${error}`);
      return false;
    }
  }

  /**
   * 刷新仓库
   */
  async function refreshRepository() {
    return await loadRepository();
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

    // 筛选操作
    filterCommits,
    clearFilters,
  };
}