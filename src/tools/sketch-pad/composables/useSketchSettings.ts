import { ref } from "vue";
import { appDataDir, join } from "@tauri-apps/api/path";
import { readTextFile, writeTextFile, mkdir, exists } from "@tauri-apps/plugin-fs";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { SketchPadSettings } from "../types";

const logger = createModuleLogger("SketchPad/Settings");
const errorHandler = createModuleErrorHandler("SketchPad/Settings");

const SETTINGS_FILENAME = "settings.json";

export const DEFAULT_SKETCH_SETTINGS: SketchPadSettings = {
  // 新建项目默认值
  defaultCanvasWidth: 1920,
  defaultCanvasHeight: 1080,
  defaultCanvasPreset: "hd",

  // 默认图层配置
  createBackgroundLayer: true,
  createObjectLayer: true,
  objectLayerName: "矢量标注",
  backgroundLayerColor: "#ffffff",

  // 画笔默认值
  defaultBrushSize: 5,
  defaultBrushColor: "#ff4d4f",
  defaultBrushOpacity: 1,

  // 形状默认值
  defaultStrokeWidth: 2,
  defaultStrokeColor: "#40a9ff",
  defaultFillColor: null,
  defaultCornerRadius: 0,

  // 文字默认值
  defaultFontSize: 24,
  defaultTextColor: "#000000",
  defaultFontFamily: "sans-serif",

  // 画布外观
  checkerOpacity: 1,

  // 行为设置
  autoSaveEnabled: true,
  autoSaveInterval: 30,
  showToolSwitchHint: true,
};

// 单例状态，确保多处引用共享同一份数据
const settings = ref<SketchPadSettings>({ ...DEFAULT_SKETCH_SETTINGS });
const isLoaded = ref(false);

export function useSketchSettings() {
  async function getSettingsPath() {
    const dataDir = await appDataDir();
    const root = await join(dataDir, "sketch-pad");
    if (!(await exists(root))) {
      await mkdir(root, { recursive: true });
    }
    return await join(root, SETTINGS_FILENAME);
  }

  async function loadSettings(): Promise<SketchPadSettings> {
    if (isLoaded.value) return settings.value;

    const result = await errorHandler.wrapAsync(
      async () => {
        const path = await getSettingsPath();
        if (!(await exists(path))) {
          logger.info("设置文件不存在，使用默认值");
          return { ...DEFAULT_SKETCH_SETTINGS };
        }
        const content = await readTextFile(path);
        const parsed = JSON.parse(content) as Partial<SketchPadSettings>;
        // 合并默认值，确保新增字段有回退
        return { ...DEFAULT_SKETCH_SETTINGS, ...parsed };
      },
      { userMessage: "加载画板设置失败" },
    );

    if (result) {
      settings.value = result;
    }
    isLoaded.value = true;
    return settings.value;
  }

  async function saveSettings(newSettings?: Partial<SketchPadSettings>) {
    if (newSettings) {
      settings.value = { ...settings.value, ...newSettings };
    }

    await errorHandler.wrapAsync(
      async () => {
        const path = await getSettingsPath();
        await writeTextFile(path, JSON.stringify(settings.value, null, 2));
        logger.info("画板设置已保存");
      },
      { userMessage: "保存画板设置失败" },
    );
  }

  async function resetSettings() {
    settings.value = { ...DEFAULT_SKETCH_SETTINGS };
    await saveSettings();
  }

  return {
    settings,
    isLoaded,
    loadSettings,
    saveSettings,
    resetSettings,
  };
}
