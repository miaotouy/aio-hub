import { ref, computed } from "vue";
import { customMessage } from "@/utils/customMessage";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { GitCommit, GitBranch, RepoStatistics } from "../types";
import { createModuleLogger } from "@utils/logger";

const logger = createModuleLogger("GitRepository");

// 进度事件类型
interface GitProgressEvent {
  type: "start" | "data" | "end" | "error";
  total?: number;
  branches?: GitBranch[];
  commits?: GitCommit[];
  loaded?: number;
  message?: string;
}

export function useGitRepository() {
  // 状态
  const loading = ref(false);
  const repoPath = ref("");
  const selectedBranch = ref("main");
  const branches = ref<GitBranch[]>([]);
  const commits = ref<GitCommit[]>([]);
  const filteredCommits = ref<GitCommit[]>([]);
  const limitCount = ref(100);
  const batchSize = ref(20);
  const commitRange = ref<[number, number]>([0, 0]);

  // 筛选状态
  const searchQuery = ref("");
  const dateRange = ref<[Date, Date] | null>(null);
  const authorFilter = ref("");
  const reverseOrder = ref(false);
  const commitTypeFilter = ref<string[]>([]);

  // 分页状态
  const currentPage = ref(1);
  const pageSize = ref(20);

  // 增量加载状态：记录上次加载的仓库路径和分支
  const lastLoadedRepo = ref("");
  const lastLoadedBranch = ref("");
  const lastLoadedLimit = ref(0);

  // 进度状态
  const progress = ref({
    loading: false,
    loaded: 0,
    total: 0,
  });

  // 计算属性 - 统计信息
  const statistics = computed<RepoStatistics>(() => {
    const commits = filteredCommits.value;
    if (commits.length === 0) {
      return {
        totalCommits: 0,
        contributors: 0,
        timeSpan: 0,
        averagePerDay: 0,
      };
    }

    const authors = new Set(commits.map((c) => c.author));
    const dates = commits.map((c) => new Date(c.date).getTime());
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    const days = Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));

    return {
      totalCommits: commits.length,
      contributors: authors.size,
      timeSpan: days,
      averagePerDay: commits.length / Math.max(days, 1),
    };
  });

  // 计算属性 - 分页后的提交列表
  const paginatedCommits = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value;
    const end = start + pageSize.value;
    return filteredCommits.value.slice(start, end);
  });

  // 方法 - 选择目录
  async function selectDirectory() {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "选择 Git 仓库目录",
      });
      if (typeof selected === "string") {
        repoPath.value = selected;
        customMessage.success(`已选择目录: ${selected}`);
      }
    } catch (error) {
      logger.error("选择目录失败", error, {
        action: "selectDirectory",
        context: "用户选择 Git 仓库目录时发生错误",
      });
      customMessage.error("选择目录失败");
    }
  }

  // 方法 - 加载仓库（支持增量加载和流式加载）
  async function loadRepository() {
    const currentRepoPath = repoPath.value || ".";
    const currentBranch = selectedBranch.value;

    // 检查是否可以进行增量加载
    const isSameRepo = lastLoadedRepo.value === currentRepoPath;
    const isSameBranch = lastLoadedBranch.value === currentBranch;
    const isIncrementalLoad =
      isSameRepo && isSameBranch && limitCount.value > lastLoadedLimit.value;
    if (isIncrementalLoad) {
      // 增量加载：使用流式加载新增部分
      loading.value = true;

      // 设置增量加载的进度状态
      const skip = lastLoadedLimit.value;
      const newLimit = limitCount.value - lastLoadedLimit.value;
      const initialCommitCount = commits.value.length;

      progress.value = {
        loading: true,
        loaded: skip, // 已有的数量
        total: limitCount.value, // 目标总数
      };

      let unlisten: UnlistenFn | null = null;

      try {
        logger.info(`增量流式加载：跳过 ${skip} 条，加载 ${newLimit} 条新提交`);

        // 监听进度事件
        unlisten = await listen<GitProgressEvent>("git-progress", (event) => {
          const payload = event.payload;

          switch (payload.type) {
            case "start":
              progress.value.total = payload.total || limitCount.value;
              logger.info(`开始增量流式加载，目标总数 ${payload.total}`);
              break;

            case "data":
              if (payload.commits) {
                // 累积新提交记录
                commits.value = [...commits.value, ...payload.commits];
                filteredCommits.value = commits.value;
                progress.value.loaded = payload.loaded || 0;

                logger.debug(
                  `增量加载进度: ${payload.loaded} / ${progress.value.total} (新增 ${commits.value.length - initialCommitCount})`
                );
              }
              break;

            case "end":
              // 加载完成
              progress.value.loading = false;
              loading.value = false;

              // 更新提交范围
              commitRange.value = [0, commits.value.length];

              // 更新记录
              lastLoadedLimit.value = limitCount.value;

              const newCount = commits.value.length - initialCommitCount;
              customMessage.success(`增量加载了 ${newCount} 条新提交记录，当前共 ${commits.value.length} 条`);
              logger.info(`增量流式加载完成，新增 ${newCount} 条，总计 ${commits.value.length} 条`);

              // 清理监听器
              if (unlisten) {
                unlisten();
              }
              break;

            case "error":
              progress.value.loading = false;
              loading.value = false;
              customMessage.error(`增量加载失败: ${payload.message}`);
              logger.error("增量加载失败", new Error(payload.message || "Unknown error"));

              // 清理监听器
              if (unlisten) {
                unlisten();
              }
              break;
          }
        });

        // 调用流式增量加载命令
        await invoke("git_load_incremental_stream", {
          path: currentRepoPath,
          branch: currentBranch,
          skip,
          limit: newLimit,
          batchSize: batchSize.value,
        });

        return true;
      } catch (error) {
        progress.value.loading = false;
        loading.value = false;
        customMessage.error(`增量加载失败: ${error}`);
        logger.error("调用增量加载命令失败", error as Error);

        // 清理监听器
        if (unlisten) {
          unlisten();
        }

        return false;
      }
    }

    // 全量流式加载
    progress.value = {
      loading: true,
      loaded: 0,
      total: 0,
    };
    loading.value = true;
    commits.value = [];
    filteredCommits.value = [];

    let unlisten: UnlistenFn | null = null;

    try {
      // 监听进度事件
      unlisten = await listen<GitProgressEvent>("git-progress", (event) => {
        const payload = event.payload;

        switch (payload.type) {
          case "start":
            progress.value.total = payload.total || 0;
            if (payload.branches) {
              branches.value = payload.branches;
              // 设置当前分支
              const currentBranchInfo = payload.branches.find((b) => b.current);
              if (currentBranchInfo) {
                selectedBranch.value = currentBranchInfo.name;
              }
            }
            logger.info(`开始流式加载仓库，共 ${payload.total} 条提交`);
            break;

          case "data":
            if (payload.commits) {
              // 累积提交记录
              commits.value = [...commits.value, ...payload.commits];
              filteredCommits.value = commits.value;
              progress.value.loaded = payload.loaded || 0;

              logger.debug(`已加载 ${payload.loaded} / ${progress.value.total} 条提交`);
            }
            break;

          case "end":
            // 加载完成
            progress.value.loading = false;
            loading.value = false;

            // 重置提交范围
            commitRange.value = [0, commits.value.length];

            // 更新记录
            lastLoadedRepo.value = currentRepoPath;
            lastLoadedBranch.value = selectedBranch.value;
            lastLoadedLimit.value = limitCount.value;

            customMessage.success(`流式加载完成，共 ${commits.value.length} 条提交记录`);
            logger.info(`流式加载完成，共 ${commits.value.length} 条提交`);

            // 清理监听器
            if (unlisten) {
              unlisten();
            }
            break;

          case "error":
            progress.value.loading = false;
            loading.value = false;
            customMessage.error(`加载失败: ${payload.message}`);
            logger.error("仓库加载失败", new Error(payload.message || "Unknown error"));

            // 清理监听器
            if (unlisten) {
              unlisten();
            }
            break;
        }
      });

      // 调用流式加载命令
      await invoke("git_load_repository_stream", {
        path: currentRepoPath,
        limit: limitCount.value,
        batchSize: batchSize.value,
      });

      return true;
    } catch (error) {
      progress.value.loading = false;
      loading.value = false;
      customMessage.error(`加载仓库失败: ${error}`);
      logger.error("调用加载命令失败", error as Error);

      // 清理监听器
      if (unlisten) {
        unlisten();
      }

      return false;
    }
  }

  // 方法 - 刷新仓库（使用流式加载）
  async function refreshRepository() {
    // 直接调用 loadRepository，它已经实现了流式加载
    return await loadRepository();
  }

  // 方法 - 切换分支
  async function onBranchChange(branch: string) {
    loading.value = true;
    try {
      const result = await invoke<GitCommit[]>("git_get_branch_commits", {
        path: repoPath.value || ".",
        branch,
        limit: limitCount.value,
      });

      commits.value = result;
      filteredCommits.value = result;

      // 重置提交范围
      commitRange.value = [0, result.length];

      customMessage.success(`切换到分支: ${branch}`);

      return true;
    } catch (error) {
      customMessage.error(`切换分支失败: ${error}`);
      return false;
    } finally {
      loading.value = false;
    }
  }

  // 方法 - 筛选提交
  function filterCommits() {
    // 首先根据范围选择器从原始列表中切片
    let filtered = commits.value.slice(commitRange.value[0], commitRange.value[1]);

    // 搜索筛选
    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase();
      filtered = filtered.filter(
        (c) => c.message.toLowerCase().includes(query) || c.hash.toLowerCase().includes(query)
      );
    }

    // 作者筛选
    if (authorFilter.value) {
      const author = authorFilter.value.toLowerCase();
      filtered = filtered.filter((c) => c.author.toLowerCase().includes(author));
    }

    // 日期筛选
    if (dateRange.value) {
      const [start, end] = dateRange.value;
      filtered = filtered.filter((c) => {
        const date = new Date(c.date);
        return date >= start && date <= end;
      });
    }

    // 提交类型筛选
    if (commitTypeFilter.value.length > 0) {
      filtered = filtered.filter((c) => {
        const message = c.message.trim();
        // 提取提交类型 (格式: type: message 或 type(scope): message)
        const match = message.match(/^(\w+)(\(.+?\))?:/);
        if (match) {
          const type = match[1].toLowerCase();
          return commitTypeFilter.value.includes(type);
        }
        // 如果没有匹配到类型，当选择了 "other" 时显示
        return commitTypeFilter.value.includes("other");
      });
    }

    // 倒序排列
    if (reverseOrder.value) {
      filtered = [...filtered].reverse();
    }

    filteredCommits.value = filtered;
    currentPage.value = 1;
  }

  // 方法 - 清除筛选
  function clearFilters() {
    searchQuery.value = "";
    dateRange.value = null;
    authorFilter.value = "";
    reverseOrder.value = false;
    commitTypeFilter.value = [];
    // 重新应用筛选（此时只会应用范围选择）
    filterCommits();
    currentPage.value = 1;
  }

  // 方法 - 处理路径拖放
  function handlePathDrop(paths: string[]) {
    if (paths.length > 0) {
      repoPath.value = paths[0];
      customMessage.success(`已设置 Git 仓库路径: ${paths[0]}`);

      // 自动加载仓库
      setTimeout(() => {
        loadRepository();
      }, 500);
    }
  }

  return {
    // 状态
    loading,
    repoPath,
    selectedBranch,
    branches,
    commits,
    filteredCommits,
    limitCount,
    batchSize,
    commitRange,
    searchQuery,
    dateRange,
    authorFilter,
    reverseOrder,
    commitTypeFilter,
    currentPage,
    pageSize,
    progress,

    // 计算属性
    statistics,
    paginatedCommits,

    // 方法
    selectDirectory,
    loadRepository,
    refreshRepository,
    onBranchChange,
    filterCommits,
    clearFilters,
    handlePathDrop,
  };
}
