// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import {
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  watch,
} from "vue";
import {
  autoRefreshInterval,
  currentRepoPath,
  enableAutoRefresh,
  isRefreshing,
  loadRepositories,
} from "./useGitCommitterState";
import { refreshAllStatuses } from "./useGitCommitterRunner";

/** 状态刷新跟随工具激活状态，缓存中的页面保留数据并暂停轮询。 */
export function useGitStatusPolling(): void {
  let isActive = true;
  let isReady = false;
  let isDisposed = false;
  let refreshTimer: number | null = null;

  const refresh = () => {
    if (
      isActive &&
      isReady &&
      !document.hidden &&
      !isRefreshing.value &&
      currentRepoPath.value
    ) {
      void refreshAllStatuses();
    }
  };

  const stopPolling = () => {
    if (refreshTimer !== null) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  };

  const startPolling = () => {
    stopPolling();
    if (!isActive || !isReady || !enableAutoRefresh.value) return;
    const intervalMs = Math.max(3, autoRefreshInterval.value) * 1000;
    refreshTimer = window.setInterval(refresh, intervalMs);
  };

  const resume = () => {
    window.addEventListener("focus", refresh);
    refresh();
    startPolling();
  };

  const suspend = () => {
    isActive = false;
    window.removeEventListener("focus", refresh);
    stopPolling();
  };

  watch([enableAutoRefresh, autoRefreshInterval], startPolling);
  onMounted(async () => {
    await loadRepositories();
    if (isDisposed) return;
    isReady = true;
    if (isActive) resume();
  });
  onActivated(() => {
    if (isActive) return;
    isActive = true;
    if (isReady) resume();
  });
  onDeactivated(suspend);
  onBeforeUnmount(() => {
    isDisposed = true;
    suspend();
  });
}
