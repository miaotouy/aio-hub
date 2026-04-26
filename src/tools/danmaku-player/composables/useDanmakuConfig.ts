import { ref, watch, onMounted } from "vue";
import { createConfigManager } from "@/utils/configManager";
import type { DanmakuConfig } from "../types";

const DEFAULT_CONFIG: DanmakuConfig = {
  version: "1.0.0",
  enabled: true,
  showScroll: true,
  showFixed: true,
  showColored: true,
  displayArea: 50,
  opacity: 84,
  fontScale: 100,
  speed: 1.0,
  density: 100,
  preventSubtitleOverlap: false,
  fontFamily: "sans-serif",
  isBold: true,
  borderType: "shadow",
  blockKeywords: [],
};

const configManager = createConfigManager<DanmakuConfig>({
  moduleName: "danmaku-player",
  createDefault: () => ({ ...DEFAULT_CONFIG }),
});

export function useDanmakuConfig() {
  const config = ref<DanmakuConfig>({ ...DEFAULT_CONFIG });

  // 加载配置
  onMounted(async () => {
    const saved = await configManager.load();
    config.value = saved;
  });

  // 持久化
  watch(
    config,
    (newVal) => {
      configManager.saveDebounced(newVal);
    },
    { deep: true },
  );

  const resetConfig = () => {
    config.value = { ...DEFAULT_CONFIG };
  };

  return {
    config,
    resetConfig,
  };
}
