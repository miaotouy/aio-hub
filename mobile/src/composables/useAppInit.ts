import { ref, computed } from "vue";
import { useSettingsStore } from "@/stores/settings";
import { useThemeStore } from "@/stores/theme";
import { getRegisteredTools } from "@/router";
import { createModuleLogger } from "@/utils/logger";
import type { ToolRegistry } from "@/types/tool";

const logger = createModuleLogger("AppInit");

export function useAppInit() {
  const settingsStore = useSettingsStore();
  const themeStore = useThemeStore();

  const initialized = ref(false);
  const progress = ref(0);
  const statusMessage = ref("正在准备应用...");

  const isReady = computed(() => initialized.value);

  async function bootstrap() {
    if (initialized.value) return;

    try {
      logger.info("开始应用初始化流程...");
      
      // 1. 加载应用设置
      statusMessage.value = "正在加载配置...";
      progress.value = 20;
      await settingsStore.init();
      
      // 2. 初始化主题
      statusMessage.value = "正在应用主题...";
      progress.value = 40;
      themeStore.initTheme();

      // 3. 初始化已注册工具
      const tools = getRegisteredTools() as ToolRegistry[];
      const toolsToInit = tools.filter((t) => typeof t.init === "function");

      if (toolsToInit.length > 0) {
        const stepSize = 40 / toolsToInit.length; // 剩余 40% 进度分配给工具
        for (let i = 0; i < toolsToInit.length; i++) {
          const tool = toolsToInit[i];
          statusMessage.value = `正在初始化工具: ${tool.name}...`;
          try {
            await tool.init!();
          } catch (e) {
            logger.error(`工具 ${tool.id} 初始化失败`, e);
          }
          progress.value = Math.floor(40 + (i + 1) * stepSize);
        }
      }

      // 4. 初始化调试工具
      if (settingsStore.settings.debugMode) {
        statusMessage.value = "正在启动调试面板...";
        const eruda = await import("eruda");
        eruda.default.init();
      }
      
      statusMessage.value = "准备就绪";
      progress.value = 100;
      initialized.value = true;
      logger.info("应用初始化完成");
    } catch (error) {
      logger.error("应用初始化失败", error);
      statusMessage.value = "初始化失败，请检查环境";
    }
  }

  return {
    isReady,
    progress,
    statusMessage,
    bootstrap
  };
}