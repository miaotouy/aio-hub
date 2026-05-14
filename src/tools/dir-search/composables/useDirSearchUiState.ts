import { ref, watch } from "vue";
import { createConfigManager } from "@/utils/configManager";

interface DirSearchUiConfig {
  panelWidth: number;
  isPanelCollapsed: boolean;
  lastRootPath: string;
  version?: string;
}

const configManager = createConfigManager<DirSearchUiConfig>({
  moduleName: "dir-search",
  fileName: "ui-state.json",
  fileType: "json",
  debounceDelay: 500,
  createDefault: () => ({
    panelWidth: 360,
    isPanelCollapsed: false,
    lastRootPath: "",
  }),
});

export function useDirSearchUiState() {
  const panelWidth = ref(360);
  const isPanelCollapsed = ref(false);
  const lastRootPath = ref("");

  /** 从 AppData 加载持久化状态 */
  async function load() {
    const config = await configManager.load();
    panelWidth.value = config.panelWidth;
    isPanelCollapsed.value = config.isPanelCollapsed;
    lastRootPath.value = config.lastRootPath;
  }

  /** 保存当前状态（防抖） */
  function save() {
    configManager.saveDebounced({
      panelWidth: panelWidth.value,
      isPanelCollapsed: isPanelCollapsed.value,
      lastRootPath: lastRootPath.value,
    });
  }

  // 监听变化自动保存
  watch([panelWidth, isPanelCollapsed, lastRootPath], () => {
    save();
  });

  // 初始化加载
  load();

  return {
    panelWidth,
    isPanelCollapsed,
    lastRootPath,
  };
}
