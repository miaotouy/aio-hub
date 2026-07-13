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

import { defineStore } from "pinia";
import { ref } from "vue";
import { useAppSettingsStore } from "./appSettingsStore";
import { applyLogConfig } from "@/utils/logConfig";
import { initTheme } from "@/composables/useTheme";
import { autoRegisterServices, startupManager } from "@/services";
import { refreshCurrentRoute } from "@/router";
import { useUserProfileStore } from "@/tools/user-profile-manager/stores/userProfileStore";
import { useDetachedManager } from "@/composables/useDetachedManager";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useModelMetadataStore } from "./modelMetadataStore";
import { initAppContext } from "@/config/appContext";

const logger = createModuleLogger("stores/appInitStore");
const errorHandler = createModuleErrorHandler("stores/appInitStore");

function schedulePostReadyTask(name: string, task: () => Promise<void> | void) {
  const run = () => {
    Promise.resolve()
      .then(task)
      .then(() => {
        logger.debug("后台启动任务完成", { task: name });
      })
      .catch((err) => {
        errorHandler.handle(err, {
          userMessage: `${name}失败`,
          showToUser: false,
          context: { task: name },
        });
      });
  };

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(run, { timeout: 3000 });
  } else {
    globalThis.setTimeout(run, 0);
  }
}

export interface AppInitState {
  progress: number;
  statusText: string;
  isReady: boolean;
  error: Error | null;
}

export const useAppInitStore = defineStore("appInit", () => {
  const progress = ref(0);
  const statusText = ref("正在初始化...");
  const isReady = ref(false);
  const error = ref<Error | null>(null);

  const setProgress = (p: number, text: string) => {
    progress.value = p;
    statusText.value = text;
    logger.debug(`初始化进度: ${p}% - ${text}`);
  };

  /**
   * 初始化主应用
   */
  const initMainApp = async () => {
    try {
      isReady.value = false;
      error.value = null;
      setProgress(0, "准备启动...");

      // 模拟启动错误测试
      // throw new Error("模拟启动失败：无法连接到核心服务。请检查网络配置或重试。");

      // 1. 加载应用设置
      setProgress(10, "加载应用设置...");
      const appSettingsStore = useAppSettingsStore();
      const settings = await appSettingsStore.load();

      // 1.5 初始化应用上下文（缓存应用名称、版本号等，供请求头模板变量使用）
      await initAppContext();

      // 2. 应用日志配置
      setProgress(15, "配置日志系统...");
      applyLogConfig(settings);

      // 3. 初始化首帧必需能力
      setProgress(30, "配置界面并扫描工具...");
      // 主窗口不传 priorityToolId，内部会完成全量注册
      await Promise.all([initTheme(), autoRegisterServices()]);

      // 插件加载后，立即刷新当前路由匹配状态，确保初始进入插件页面能正确加载
      refreshCurrentRoute();

      setProgress(100, "启动完成");
      isReady.value = true;
      logger.info("主应用初始化成功");

      schedulePostReadyTask("加载模型元数据", async () => {
        const modelMetadataStore = useModelMetadataStore();
        await modelMetadataStore.loadRules();
      });

      schedulePostReadyTask("加载用户配置", async () => {
        const userProfileStore = useUserProfileStore();
        await userProfileStore.loadProfiles();
      });

      schedulePostReadyTask("执行启动任务", () => startupManager.run());

      schedulePostReadyTask("初始化分离窗口管理器", async () => {
        const detachedManager = useDetachedManager();
        await detachedManager.initialize();
      });

      schedulePostReadyTask("初始化窗口通信总线", async () => {
        const { initializeSyncBus } = useWindowSyncBus();
        await initializeSyncBus();
      });
    } catch (err: any) {
      error.value = err;
      statusText.value = `初始化失败: ${err.message || "未知错误"}`;
      errorHandler.error(err, "主应用初始化失败");
    }
  };

  /**
   * 初始化分离窗口/组件
   */
  const initDetachedApp = async (priorityToolId?: string) => {
    try {
      isReady.value = false;
      error.value = null;
      setProgress(0, "正在启动分离窗口...");

      // 1. 加载应用设置
      setProgress(10, "加载设置...");
      const appSettingsStore = useAppSettingsStore();
      const settings = await appSettingsStore.load();

      // 1.5 初始化应用上下文（缓存应用名称、版本号等，供请求头模板变量使用）
      await initAppContext();

      // 2. 应用日志配置
      setProgress(15, "配置日志...");
      applyLogConfig(settings);

      // 3. 初始化主题
      setProgress(25, "初始化主题...");
      await initTheme();

      // 4. 自动注册工具服务（第一阶段）
      setProgress(50, "加载工具服务...");
      const resumeLoading = await autoRegisterServices(priorityToolId);

      // 插件加载后，立即刷新当前路由匹配状态
      refreshCurrentRoute();

      // 5. 初始化分离窗口管理器
      setProgress(70, "同步窗口状态...");
      const detachedManager = useDetachedManager();
      await detachedManager.initialize();

      // 6. 初始化通信总线
      setProgress(85, "连接通信总线...");
      const { initializeSyncBus } = useWindowSyncBus();
      await initializeSyncBus();

      // 7. 完成第一阶段
      setProgress(100, "就绪");
      isReady.value = true;
      logger.info("分离窗口第一阶段初始化完成", { priorityToolId });

      schedulePostReadyTask("同步模型配置", async () => {
        const modelMetadataStore = useModelMetadataStore();
        await modelMetadataStore.loadRules();
      });

      // 8. 异步加载剩余服务
      if (priorityToolId) {
        setTimeout(() => {
          resumeLoading().catch((err) => {
            logger.error("分离窗口后台加载剩余服务失败", err);
          });
        }, 1000);
      }
    } catch (err: any) {
      error.value = err;
      statusText.value = `初始化失败: ${err.message || "未知错误"}`;
      errorHandler.error(err, "分离窗口初始化失败");
    }
  };

  const retry = () => {
    // 根据当前环境决定重试哪种初始化
    const path = window.location.pathname;
    const isDetached =
      path.startsWith("/detached-window/") ||
      path.startsWith("/detached-component/") ||
      path.startsWith("/canvas-window/");

    if (isDetached) {
      // 尝试从路径解析 priorityToolId
      const parts = window.location.pathname.split("/");
      const lastPart = parts[parts.length - 1];
      let priorityToolId: string | undefined;
      if (lastPart && lastPart.includes(":")) {
        priorityToolId = lastPart.split(":")[0];
      } else if (lastPart) {
        priorityToolId = lastPart;
      }
      initDetachedApp(priorityToolId);
    } else {
      initMainApp();
    }
  };

  return {
    progress,
    statusText,
    isReady,
    error,
    initMainApp,
    initDetachedApp,
    retry,
  };
});
