import { ref, watch } from "vue";
import { useSettingsStore } from "@/stores/settings";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("DebugPanel");

// 单例模式管理 vConsole 实例
const vConsoleInstance = ref<any>(null);

export function useDebugPanel() {
  const settingsStore = useSettingsStore();

  const initDebugPanel = async () => {
    if (vConsoleInstance.value) return;

    try {
      logger.info("正在初始化 vConsole...");
      const VConsole = (await import("vconsole")).default;
      vConsoleInstance.value = new VConsole();
    } catch (error) {
      logger.error("vConsole 加载失败", error);
    }
  };

  const destroyDebugPanel = () => {
    if (vConsoleInstance.value) {
      logger.info("正在销毁 vConsole...");
      vConsoleInstance.value.destroy();
      vConsoleInstance.value = null;
    }
  };

  const toggleDebugPanel = (enabled: boolean) => {
    if (enabled) {
      initDebugPanel();
    } else {
      destroyDebugPanel();
    }
  };

  // 提供一个自动同步的方法
  const syncWithSettings = () => {
    watch(
      () => settingsStore.settings.debugMode,
      (newVal) => {
        toggleDebugPanel(newVal);
      },
      { immediate: true }
    );
  };

  return {
    initDebugPanel,
    destroyDebugPanel,
    toggleDebugPanel,
    syncWithSettings,
  };
}