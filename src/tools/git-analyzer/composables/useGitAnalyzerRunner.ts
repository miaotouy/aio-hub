import { customMessage } from "@/utils/customMessage";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { GitAnalyzerContext } from "../GitAnalyzerContext";
import type { GitProgressEvent } from "./useGitLoader";
import {
  fetchBranches,
  fetchBranchCommits,
  streamLoadRepository,
  streamIncrementalLoad,
} from "./useGitLoader";
import { filterCommits as processFilter } from "./useGitProcessor";
import { createModuleLogger } from "@utils/logger";

const logger = createModuleLogger("GitAnalyzerRunner");

/**
 * Git 分析器业务编排器
 * 负责协调数据获取和状态更新
 */
export function useGitAnalyzerRunner(context: GitAnalyzerContext) {
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
        context.repoPath.value = selected;
        customMessage.success(`已选择目录: ${selected}`);
      }
    } catch (error) {
      logger.error("选择目录失败", error as Error);
      customMessage.error("选择目录失败");
    }
  }

  // ==================== 分支操作 ====================

  /**
   * 加载分支列表
   */
  async function loadBranches() {
    const currentRepoPath = context.repoPath.value || ".";

    try {
      const branchList = await fetchBranches(currentRepoPath);
      context.branches.value = branchList;

      // 设置当前分支
      const currentBranchInfo = branchList.find((b) => b.current);
      if (currentBranchInfo) {
        context.selectedBranch.value = currentBranchInfo.name;
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
    context.loading.value = true;
    try {
      const result = await fetchBranchCommits(
        context.repoPath.value || ".",
        branch,
        context.limitCount.value
      );

      context.commits.value = result;
      context.filteredCommits.value = result;
      context.commitRange.value = [0, result.length];

      customMessage.success(`切换到分支: ${branch}`);
      return true;
    } catch (error) {
      customMessage.error(`切换分支失败: ${error}`);
      return false;
    } finally {
      context.loading.value = false;
    }
  }

  // ==================== 仓库加载 ====================

  /**
   * 处理进度事件
   */
  function handleProgressEvent(event: GitProgressEvent, isIncremental: boolean, initialCount: number) {
    switch (event.type) {
      case "start":
        context.progress.value.total = event.total || context.limitCount.value;
        if (event.branches) {
          context.branches.value = event.branches;
          const currentBranchInfo = event.branches.find((b) => b.current);
          if (currentBranchInfo) {
            context.selectedBranch.value = currentBranchInfo.name;
          }
        }
        logger.info(`开始${isIncremental ? '增量' : ''}流式加载，目标总数 ${event.total}`);
        break;

      case "data":
        if (event.commits) {
          if (isIncremental) {
            // 增量加载：累积新提交
            context.commits.value = [...context.commits.value, ...event.commits];
          } else {
            // 全量加载：直接累积
            context.commits.value = [...context.commits.value, ...event.commits];
          }
          context.filteredCommits.value = context.commits.value;
          context.progress.value.loaded = event.loaded || 0;
          
          logger.debug(
            `加载进度: ${event.loaded} / ${context.progress.value.total}`
          );
        }
        break;

      case "end":
        context.progress.value.loading = false;
        context.loading.value = false;
        context.commitRange.value = [0, context.commits.value.length];

        if (isIncremental) {
          context.lastLoadedLimit.value = context.limitCount.value;
          const newCount = context.commits.value.length - initialCount;
          customMessage.success(`增量加载了 ${newCount} 条新提交记录，当前共 ${context.commits.value.length} 条`);
        } else {
          context.lastLoadedRepo.value = context.repoPath.value || ".";
          context.lastLoadedBranch.value = context.selectedBranch.value;
          context.lastLoadedLimit.value = context.limitCount.value;
          customMessage.success(`流式加载完成，共 ${context.commits.value.length} 条提交记录`);
        }
        break;

      case "error":
        context.progress.value.loading = false;
        context.loading.value = false;
        customMessage.error(`${isIncremental ? '增量' : ''}加载失败: ${event.message}`);
        logger.error(`${isIncremental ? '增量' : ''}加载失败`, new Error(event.message || "Unknown error"));
        break;
    }
  }

  /**
   * 加载仓库（支持增量加载）
   */
  async function loadRepository() {
    const currentRepoPath = context.repoPath.value || ".";
    const currentBranch = context.selectedBranch.value;

    // 检查是否可以进行增量加载
    const isSameRepo = context.lastLoadedRepo.value === currentRepoPath;
    const isSameBranch = context.lastLoadedBranch.value === currentBranch;
    const isIncrementalLoad =
      isSameRepo && isSameBranch && context.limitCount.value > context.lastLoadedLimit.value;

    if (isIncrementalLoad) {
      // 增量加载
      const skip = context.lastLoadedLimit.value;
      const newLimit = context.limitCount.value - context.lastLoadedLimit.value;
      const initialCommitCount = context.commits.value.length;

      context.loading.value = true;
      context.progress.value = {
        loading: true,
        loaded: skip,
        total: context.limitCount.value,
      };

      try {
        await streamIncrementalLoad(
          {
            path: currentRepoPath,
            branch: currentBranch,
            skip,
            limit: newLimit,
            batchSize: context.batchSize.value,
          },
          (event) => handleProgressEvent(event, true, initialCommitCount)
        );
        return true;
      } catch (error) {
        context.progress.value.loading = false;
        context.loading.value = false;
        customMessage.error(`增量加载失败: ${error}`);
        return false;
      }
    }

    // 全量加载
    context.resetCommits();
    context.loading.value = true;
    context.progress.value = {
      loading: true,
      loaded: 0,
      total: 0,
    };

    try {
      await streamLoadRepository(
        {
          path: currentRepoPath,
          limit: context.limitCount.value,
          batchSize: context.batchSize.value,
        },
        (event) => handleProgressEvent(event, false, 0)
      );
      return true;
    } catch (error) {
      context.progress.value.loading = false;
      context.loading.value = false;
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
    // 首先根据范围选择器从原始列表中切片
    const rangedCommits = context.commits.value.slice(
      context.commitRange.value[0],
      context.commitRange.value[1]
    );

    // 应用筛选
    const filtered = processFilter(rangedCommits, {
      searchQuery: context.searchQuery.value,
      authorFilter: context.authorFilter.value,
      dateRange: context.dateRange.value,
      commitTypeFilter: context.commitTypeFilter.value,
      reverseOrder: context.reverseOrder.value,
    });

    context.filteredCommits.value = filtered;
    context.currentPage.value = 1;
  }

  /**
   * 清除筛选条件
   */
  function clearFilters() {
    context.resetFilters();
    // 重新应用筛选（此时只会应用范围选择）
    filterCommits();
  }

  // ==================== 文件操作 ====================

  /**
   * 处理路径拖放
   */
  function handlePathDrop(paths: string[]) {
    if (paths.length > 0) {
      context.repoPath.value = paths[0];
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