<script setup lang="ts">
import { ref } from "vue";
import { useSettingsStore } from "@/stores/settings";
import { Check, RotateCcw, Pipette, Info } from "lucide-vue-next";
import { Snackbar } from "@varlet/ui";

const settingsStore = useSettingsStore();

// 颜色类型定义
type ColorType = "primary" | "success" | "warning" | "danger" | "info";

interface PresetColor {
  name: string;
  color: string;
}

interface ColorConfig {
  type: ColorType;
  label: string;
  modelKey: "themeColor" | "successColor" | "warningColor" | "dangerColor" | "infoColor";
  defaultColor: string;
  description: string;
  presets: PresetColor[];
}

// 颜色配置列表 - 移植自桌面端并按色系命名
const colorConfigs: ColorConfig[] = [
  {
    type: "primary",
    label: "蓝色系",
    modelKey: "themeColor",
    defaultColor: "#409eff",
    description: "应用的主要色调",
    presets: [
      { name: "默认蓝", color: "#409eff" },
      { name: "深海蓝", color: "#1890ff" },
      { name: "天空蓝", color: "#0ea5e9" },
      { name: "翡翠绿", color: "#00b96b" },
      { name: "薰衣紫", color: "#8b7ec8" },
      { name: "科技紫", color: "#7c3aed" },
      { name: "樱花粉", color: "#ff69b4" },
      { name: "日暮橙", color: "#ff8c00" },
      { name: "初音绿", color: "#39C5BB" },
      { name: "洛天依蓝", color: "#66CCFF" },
      { name: "KAITO蓝", color: "#0000FF" },
      { name: "徵羽摩柯", color: "#0080FF" },
      { name: "星尘紫", color: "#9999FF" },
      { name: "海伊蓝", color: "#3399FF" },
      { name: "心华紫", color: "#EE82EE" },
      { name: "乐步紫", color: "#9880D7" },
      { name: "LUMi蓝", color: "#83C5D6" },
    ],
  },
  {
    type: "success",
    label: "绿色系",
    modelKey: "successColor",
    defaultColor: "#67c23a",
    description: "成功状态或自然色调",
    presets: [
      { name: "Element绿", color: "#67c23a" },
      { name: "翡翠绿", color: "#00b96b" },
      { name: "森林绿", color: "#52c41a" },
      { name: "薄荷绿", color: "#10b981" },
      { name: "青草绿", color: "#22c55e" },
      { name: "深绿", color: "#16a34a" },
      { name: "柠檬绿", color: "#84cc16" },
      { name: "初音绿", color: "#39C5BB" },
      { name: "言和绿", color: "#00FFCC" },
      { name: "龙牙绿", color: "#006666" },
      { name: "GUMI绿", color: "#CCFF00" },
    ],
  },
  {
    type: "warning",
    label: "橙黄色系",
    modelKey: "warningColor",
    defaultColor: "#e6a23c",
    description: "警告、注意或暖色调",
    presets: [
      { name: "Element橙", color: "#e6a23c" },
      { name: "日暮橙", color: "#ff8c00" },
      { name: "琥珀橙", color: "#f59e0b" },
      { name: "金橙", color: "#fb923c" },
      { name: "蜜橙", color: "#fbbf24" },
      { name: "镜音连", color: "#FFE211" },
      { name: "芒果黄", color: "#facc15" },
      { name: "秋叶橙", color: "#f97316" },
      { name: "镜音铃", color: "#FFA500" },
      { name: "墨清弦", color: "#FFFF00" },
      { name: "诗岸黄", color: "#F6BE71" },
      { name: "SeeU橙", color: "#FF8000" },
      { name: "Lily黄", color: "#F9EE70" },
      { name: "Oliver黄", color: "#FFFFCC" },
    ],
  },
  {
    type: "danger",
    label: "红色系",
    modelKey: "dangerColor",
    defaultColor: "#f56c6c",
    description: "危险、错误或强调色调",
    presets: [
      { name: "Element红", color: "#f56c6c" },
      { name: "火焰红", color: "#ff4d4f" },
      { name: "鲜红", color: "#ef4444" },
      { name: "深红", color: "#dc2626" },
      { name: "玫瑰红", color: "#f43f5e" },
      { name: "粉红", color: "#ec4899" },
      { name: "暗红", color: "#b91c1c" },
      { name: "珊瑚红", color: "#ff6b6b" },
      { name: "巡音流歌", color: "#FAAFBE" },
      { name: "MEIKO红", color: "#D80000" },
      { name: "乐正绫", color: "#EE0000" },
      { name: "赤羽红", color: "#FF4004" },
      { name: "IA粉", color: "#FFABBC" },
    ],
  },
  {
    type: "info",
    label: "灰色系",
    modelKey: "infoColor",
    defaultColor: "#909399",
    description: "中性、辅助或背景色调",
    presets: [
      { name: "Element灰", color: "#909399" },
      { name: "金属灰", color: "#6b7280" },
      { name: "石板灰", color: "#64748b" },
      { name: "炭灰", color: "#52525b" },
      { name: "银灰", color: "#94a3b8" },
      { name: "浅蓝灰", color: "#8b9dc3" },
      { name: "深灰", color: "#475569" },
      { name: "钢青灰", color: "#71717a" },
    ],
  },
];

const getCurrentColor = (type: ColorType): string => {
  const key = colorConfigs.find((c) => c.type === type)?.modelKey;
  if (!key) return "#000000";
  return (
    settingsStore.settings.appearance[key] ||
    colorConfigs.find((c) => c.type === type)!.defaultColor
  );
};

const selectColor = async (type: ColorType, color: string) => {
  const key = colorConfigs.find((c) => c.type === type)?.modelKey;
  if (key) {
    await settingsStore.updateAppearance({ [key]: color });
  }
};

const resetColor = async (type: ColorType) => {
  const config = colorConfigs.find((c) => c.type === type);
  if (config) {
    await settingsStore.updateAppearance({ [config.modelKey]: config.defaultColor });
    Snackbar.success(`已重置${config.label}`);
  }
};

// 自定义颜色处理
const showCustomPicker = ref(false);
const activeType = ref<ColorType | null>(null);
const customColor = ref("");

const openCustomPicker = (type: ColorType) => {
  activeType.value = type;
  customColor.value = getCurrentColor(type);
  showCustomPicker.value = true;
};

const handleCustomColorApply = async () => {
  if (activeType.value && /^#[0-9A-F]{6}$/i.test(customColor.value)) {
    await selectColor(activeType.value, customColor.value);
    showCustomPicker.value = false;
  } else {
    Snackbar.error("请输入有效的 Hex 颜色值");
  }
};

// 抽屉控制
const showDrawer = ref(false);
</script>

<template>
  <div class="theme-color-settings">
    <!-- 触发单元格 -->
    <var-cell ripple @click="showDrawer = true">
      <template #icon>
        <div class="group-icon">
          <Palette :size="20" />
        </div>
      </template>
      <div class="cell-content">
        <div class="cell-label">主题色板</div>
        <div class="cell-desc">自定义应用各状态颜色</div>
      </div>
      <template #extra>
        <div class="current-color-preview">
          <div
            class="color-dot"
            :style="{ backgroundColor: settingsStore.settings.appearance.themeColor }"
          ></div>
          <ChevronRight :size="20" class="text-hint" />
        </div>
      </template>
    </var-cell>

    <!-- 颜色选择抽屉 -->
    <var-popup position="bottom" v-model:show="showDrawer" round>
      <div class="drawer-content">
        <div class="drawer-header">
          <div class="drawer-title">主题色板</div>
          <var-button type="primary" text @click="showDrawer = false">完成</var-button>
        </div>

        <div class="scroll-area">
          <div v-for="config in colorConfigs" :key="config.type" class="color-group">
            <div class="group-header">
              <span class="group-title">{{ config.label }}</span>
              <var-tooltip :content="config.description">
                <Info :size="14" class="info-icon" />
              </var-tooltip>
            </div>

            <div class="preset-grid">
              <div
                v-for="preset in config.presets"
                :key="preset.color"
                class="color-swatch-wrapper"
              >
                <button
                  class="color-swatch"
                  :style="{ backgroundColor: preset.color }"
                  @click="selectColor(config.type, preset.color)"
                >
                  <Transition name="fade">
                    <Check
                      v-if="
                        getCurrentColor(config.type).toLowerCase() === preset.color.toLowerCase()
                      "
                      :size="16"
                      class="check-icon"
                    />
                  </Transition>
                </button>
              </div>

              <!-- 自定义颜色按钮 -->
              <div class="color-swatch-wrapper">
                <button
                  class="color-swatch custom-btn"
                  :class="{
                    active: !config.presets.some(
                      (p) => p.color.toLowerCase() === getCurrentColor(config.type).toLowerCase()
                    ),
                  }"
                  :style="{
                    backgroundColor: !config.presets.some(
                      (p) => p.color.toLowerCase() === getCurrentColor(config.type).toLowerCase()
                    )
                      ? getCurrentColor(config.type)
                      : 'transparent',
                  }"
                  @click="openCustomPicker(config.type)"
                >
                  <Check
                    v-if="
                      !config.presets.some(
                        (p) => p.color.toLowerCase() === getCurrentColor(config.type).toLowerCase()
                      )
                    "
                    :size="16"
                    class="check-icon"
                  />
                  <Pipette v-else :size="16" />
                </button>
              </div>

              <!-- 重置按钮 -->
              <div class="color-swatch-wrapper">
                <button class="color-swatch reset-btn" @click="resetColor(config.type)">
                  <RotateCcw :size="16" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </var-popup>

    <!-- 自定义颜色弹窗 -->
    <var-dialog
      v-model:show="showCustomPicker"
      :title="`自定义${activeType ? colorConfigs.find((c) => c.type === activeType)?.label : ''}`"
      @confirm="handleCustomColorApply"
    >
      <div class="custom-picker-content">
        <div class="preview-box" :style="{ backgroundColor: customColor }"></div>
        <var-input v-model="customColor" placeholder="#RRGGBB" maxlength="7" variant="standard">
          <template #prepend-icon>
            <input type="color" v-model="customColor" class="native-picker" />
          </template>
        </var-input>
      </div>
    </var-dialog>
  </div>
</template>

<style scoped>
.theme-color-settings {
  width: 100%;
}

.group-icon {
  color: var(--primary-color);
  margin-right: 12px;
}

.cell-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cell-label {
  font-size: 16px;
  color: var(--text-color);
}

.cell-desc {
  font-size: 12px;
  color: var(--text-color);
  opacity: 0.6;
}

.current-color-preview {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid var(--border-color);
}

.text-hint {
  color: var(--text-color);
  opacity: 0.3;
}

.drawer-content {
  background-color: var(--card-bg);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.drawer-header {
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
}

.drawer-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color);
}

.scroll-area {
  padding: 20px 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.color-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 4px;
}

.group-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-on-surface);
}

.info-icon {
  color: var(--color-on-surface-variant);
  opacity: 0.6;
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
  gap: 12px;
  justify-items: center;
}

.color-swatch-wrapper {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.color-swatch {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid transparent;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.color-swatch:active {
  transform: scale(0.9);
}

.check-icon {
  color: #fff;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
}

.custom-btn,
.reset-btn {
  background-color: var(--color-surface-container-high);
  color: var(--color-on-surface-variant);
  border: 1px solid var(--color-outline-variant);
}

.custom-btn.active {
  border: none;
}

.custom-picker-content {
  padding: 20px 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
}

.preview-box {
  width: 100%;
  height: 60px;
  border-radius: 8px;
  border: 1px solid var(--color-outline-variant);
  transition: background-color 0.2s ease;
}

.native-picker {
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
