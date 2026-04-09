import { defineStore } from "pinia";
import { ref } from "vue";
import { useAppSettingsStore } from "./appSettingsStore";
import { applyLogConfig } from "@/utils/logConfig";
import { initTheme } from "@/composables/useTheme";
import { autoRegisterServices, startupManager } from "@/services";
import { refreshCurrentRoute } from "@/router";
import { useUserProfileStore } from "@/tools/llm-chat/stores/userProfileStore";
import { useDetachedManager } from "@/composables/useDetachedManager";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { initMonacoShikiThemes } from "@/utils/monacoShikiSetup";

const logger = createModuleLogger("stores/appInitStore");
const errorHandler = createModuleErrorHandler("stores/appInitStore");

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

      // 2. 应用日志配置
      setProgress(15, "配置日志系统...");
      applyLogConfig(settings);

      // 3. 初始化主题
      setProgress(25, "配置界面主题...");
      await initTheme();

      // 初始化 Monaco Shiki 主题
      setProgress(30, "初始化编辑器主题...");
      await initMonacoShikiThemes();

      // 4. 自动注册工具服务
      setProgress(40, "正在扫描插件和工具...");
      // 主窗口不传 priorityToolId，内部会完成全量注册
      await autoRegisterServices();
      
      // 插件加载后，立即刷新当前路由匹配状态，确保初始进入插件页面能正确加载
      refreshCurrentRoute();
      
      setProgress(60, "插件加载完成");

      // 5. 加载用户档案
      setProgress(70, "加载用户配置...");
      const userProfileStore = useUserProfileStore();
      await userProfileStore.loadProfiles();

      // 6. 执行启动项任务
      setProgress(80, "执行启动任务...");
      await startupManager.run();

      // 7. 初始化分离窗口管理器
      setProgress(90, "准备窗口管理系统...");
      const detachedManager = useDetachedManager();
      await detachedManager.initialize();

      // 8. 初始化通信总线
      setProgress(95, "建立窗口通信总线...");
      const { initializeSyncBus } = useWindowSyncBus();
      await initializeSyncBus();

      // 9. 完成
      setProgress(100, "启动完成");
      isReady.value = true;
      logger.info("主应用初始化成功");
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

      // 2. 应用日志配置
      setProgress(15, "配置日志...");
      applyLogConfig(settings);

      // 3. 初始化主题
      setProgress(25, "初始化主题...");
      await initTheme();

      // 4. 初始化编辑器主题
      setProgress(35, "初始化编辑器主题...");
      await initMonacoShikiThemes();

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
    const isDetached =
      window.location.pathname.startsWith("/detached-window/") ||
      window.location.pathname.startsWith("/detached-component/");

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
