<script setup lang="ts">
import { ref, computed } from "vue";
import { useSettingsStore } from "@/stores/settings";
import { Check, RotateCcw, Pipette, Palette, ChevronRight } from "lucide-vue-next";
import { Snackbar } from "@varlet/ui";

const settingsStore = useSettingsStore();

interface PresetColor {
  name: string;
  color: string;
}

interface ColorGroup {
  label: string;
  description: string;
  presets: PresetColor[];
}

// 颜色配置列表 - 移植自桌面端并按色系命名
const colorGroups: ColorGroup[] = [
  {
    label: "蓝色系",
    description: "经典、科技与深邃",
    presets: [
      { name: "默认蓝", color: "#409eff" },
      { name: "深海蓝", color: "#1890ff" },
      { name: "天空蓝", color: "#0ea5e9" },
      { name: "洛天依蓝", color: "#66CCFF" },
      { name: "KAITO蓝", color: "#0000FF" },
      { name: "徵羽摩柯", color: "#0080FF" },
      { name: "海伊蓝", color: "#3399FF" },
      { name: "LUMi蓝", color: "#83C5D6" },
    ],
  },
  {
    label: "绿色系",
    description: "自然、成长与成功",
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
    label: "橙黄色系",
    description: "警告、活力与温暖",
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
    label: "红色系",
    description: "危险、热情与严谨",
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
    label: "灰色系",
    description: "中性、稳重与简约",
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
  {
    label: "紫色系",
    description: "优雅、神秘与灵感",
    presets: [
      { name: "科技紫", color: "#7c3aed" },
      { name: "薰衣紫", color: "#8b7ec8" },
      { name: "星尘紫", color: "#9999FF" },
      { name: "心华紫", color: "#EE82EE" },
      { name: "乐步紫", color: "#9880D7" },
    ],
  },
  {
    label: "粉红系",
    description: "可爱、浪漫与活力",
    presets: [
      { name: "樱花粉", color: "#ff69b4" },
      { name: "粉红", color: "#ec4899" },
      { name: "巡音流歌", color: "#FAAFBE" },
      { name: "IA粉", color: "#FFABBC" },
    ],
  },
];

const currentThemeColor = computed(() => settingsStore.settings.appearance.themeColor || "#409eff");

// 获取当前颜色名称
const currentThemeColorName = computed(() => {
  for (const group of colorGroups) {
    const preset = group.presets.find(
      (p) => p.color.toLowerCase() === currentThemeColor.value.toLowerCase()
    );
    if (preset) return preset.name;
  }
  return "自定义颜色";
});

const selectColor = async (color: string, name?: string) => {
  await settingsStore.updateAppearance({ themeColor: color });
  if (name) {
    Snackbar.success(`已切换至: ${name} (${color.toUpperCase()})`);
  }
};

const resetColor = async () => {
  await settingsStore.updateAppearance({ themeColor: "#409eff" });
  Snackbar.success("已重置主题色");
};

// 自定义颜色处理
const showCustomPicker = ref(false);
const customColor = ref("");

const openCustomPicker = () => {
  customColor.value = currentThemeColor.value;
  showCustomPicker.value = true;
};

const handleCustomColorApply = async () => {
  if (/^#[0-9A-F]{6}$/i.test(customColor.value)) {
    await selectColor(customColor.value);
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
        <div class="cell-desc">自定义应用全局主题颜色</div>
      </div>
      <template #extra>
        <div class="current-color-preview">
          <div class="color-dot" :style="{ backgroundColor: currentThemeColor }"></div>
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
          <div class="action-bar">
            <div class="action-item" @click="openCustomPicker">
              <Pipette :size="18" />
              <span>自定义</span>
            </div>
            <div class="action-item" @click="resetColor">
              <RotateCcw :size="18" />
              <span>重置默认</span>
            </div>
          </div>

          <!-- 当前选中预览 -->
          <div class="current-preview-card">
            <div class="preview-info">
              <div class="preview-label">当前主题色</div>
              <div class="preview-value">
                <span class="color-name">{{ currentThemeColorName }}</span>
                <span class="color-hex">{{ currentThemeColor.toUpperCase() }}</span>
              </div>
            </div>
            <div class="preview-dot" :style="{ backgroundColor: currentThemeColor }"></div>
          </div>

          <div v-for="group in colorGroups" :key="group.label" class="color-group">
            <div class="group-header">
              <span class="group-title">{{ group.label }}</span>
              <span class="group-desc">{{ group.description }}</span>
            </div>

            <div class="preset-grid">
              <div v-for="preset in group.presets" :key="preset.color" class="color-swatch-wrapper">
                <var-tooltip :content="preset.name">
                  <button
                    class="color-swatch"
                    :style="{ backgroundColor: preset.color }"
                    @click="selectColor(preset.color, preset.name)"
                  >
                    <Transition name="fade">
                      <Check
                        v-if="currentThemeColor.toLowerCase() === preset.color.toLowerCase()"
                        :size="16"
                        class="check-icon"
                      />
                    </Transition>
                  </button>
                </var-tooltip>
                <span class="swatch-name">{{ preset.name }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </var-popup>

    <!-- 自定义颜色弹窗 -->
    <var-dialog
      v-model:show="showCustomPicker"
      title="自定义主题色"
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
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.text-hint {
  color: var(--text-color);
  opacity: 0.3;
}

.drawer-content {
  background-color: var(--card-bg);
  max-height: 80vh;
  max-height: 80dvh;
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
  padding: 0 16px 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.action-bar {
  display: flex;
  gap: 12px;
  padding: 16px 0;
  position: sticky;
  top: 0;
  background-color: var(--card-bg);
  z-index: 10;
}

.action-item {
  flex: 1;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background-color: var(--color-surface-container-high);
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-on-surface);
}

.action-item:active {
  opacity: 0.7;
}

.current-preview-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background-color: var(--color-surface-container-low);
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.preview-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.preview-label {
  font-size: 12px;
  color: var(--color-on-surface-variant);
}

.preview-value {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.color-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-on-surface);
}

.color-hex {
  font-size: 12px;
  font-family: monospace;
  color: var(--color-on-surface-variant);
  opacity: 0.8;
}

.preview-dot {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
  border: 2px solid #fff;
}

.color-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.group-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 0 4px;
}

.group-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-on-surface);
}

.group-desc {
  font-size: 12px;
  color: var(--color-on-surface-variant);
  opacity: 0.7;
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
  gap: 16px 12px;
  justify-items: center;
}

.color-swatch-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.swatch-name {
  font-size: 10px;
  color: var(--color-on-surface-variant);
  text-align: center;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
