import { ref, reactive, watch, toRefs, toRaw } from "vue";
import { createConfigManager } from "@/utils/configManager";

/**
 * 创建默认状态的工厂函数
 * 它是所有属性默认值的 **唯一定义源**
 */
function createDefaultState() {
  return {
    panelWidth: 360,
    isPanelCollapsed: false,
    lastRootPath: "",
    // 搜索输入状态
    pattern: "",
    replacement: "",
    isRegex: false,
    caseSensitive: false,
    wholeWord: false,
    includeGlobs: "",
    excludeGlobs: "",
    useGitignore: true,
    showReplace: false,
  };
}

type UiState = ReturnType<typeof createDefaultState>;

interface DirSearchUiConfig extends UiState {
  version?: string;
}

const configManager = createConfigManager<DirSearchUiConfig>({
  moduleName: "dir-search",
  fileName: "ui-state.json",
  fileType: "json",
  debounceDelay: 500,
  createDefault: () => ({
    ...createDefaultState(),
    version: "1.2.0",
  }),
});

// 使用单例模式，确保整个工具共享同一个 UI 状态实例
const state = reactive(createDefaultState());
const isLoaded = ref(false);

export function useDirSearchUiState() {
  /** 从 AppData 加载持久化状态 */
  async function load() {
    if (isLoaded.value) return;
    const config = await configManager.load();
    // 合并配置，缺失字段使用默认值
    Object.assign(state, { ...createDefaultState(), ...config });
    isLoaded.value = true;
  }

  /** 保存当前状态（防抖） */
  function save() {
    if (!isLoaded.value) return;
    configManager.saveDebounced(toRaw(state));
  }

  // 监听整个状态对象的变化并自动保存
  watch(state, () => save(), { deep: true });

  // 初始化加载
  load();

  return {
    ...toRefs(state),
    isLoaded,
  };
}
