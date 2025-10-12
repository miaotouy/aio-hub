<script setup lang="ts">
import { ref } from "vue";
import { InfoFilled, Refresh } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";

// 颜色类型定义
type ColorType = 'primary' | 'success' | 'warning' | 'danger' | 'info';

interface PresetColor {
  name: string;
  color: string;
}

interface ColorConfig {
  type: ColorType;
  label: string;
  modelKey: 'themeColor' | 'successColor' | 'warningColor' | 'dangerColor' | 'infoColor';
  defaultColor: string;
  description: string;
  presets: PresetColor[];
}

// 颜色配置列表 - 每种颜色类型都有专属的预设色板
const colorConfigs: ColorConfig[] = [
  {
    type: 'primary',
    label: '主题色',
    modelKey: 'themeColor',
    defaultColor: '#409eff',
    description: '应用的主要色调',
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
    ]
  },
  {
    type: 'success',
    label: '成功色',
    modelKey: 'successColor',
    defaultColor: '#67c23a',
    description: '成功状态的颜色',
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
    ]
  },
  {
    type: 'warning',
    label: '警告色',
    modelKey: 'warningColor',
    defaultColor: '#e6a23c',
    description: '警告状态的颜色',
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
    ]
  },
  {
    type: 'danger',
    label: '危险色',
    modelKey: 'dangerColor',
    defaultColor: '#f56c6c',
    description: '危险/错误状态的颜色',
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
    ]
  },
  {
    type: 'info',
    label: '信息色',
    modelKey: 'infoColor',
    defaultColor: '#909399',
    description: '信息提示的颜色',
    presets: [
      { name: "Element灰", color: "#909399" },
      { name: "金属灰", color: "#6b7280" },
      { name: "石板灰", color: "#64748b" },
      { name: "炭灰", color: "#52525b" },
      { name: "银灰", color: "#94a3b8" },
      { name: "浅蓝灰", color: "#8b9dc3" },
      { name: "深灰", color: "#475569" },
      { name: "钢青灰", color: "#71717a" },
    ]
  },
];

// Props - 使用 v-model 绑定所有颜色，支持可选类型
const themeColor = defineModel<string | undefined>('themeColor', { required: true });
const successColor = defineModel<string | undefined>('successColor', { required: true });
const warningColor = defineModel<string | undefined>('warningColor', { required: true });
const dangerColor = defineModel<string | undefined>('dangerColor', { required: true });
const infoColor = defineModel<string | undefined>('infoColor', { required: true });

// 自定义颜色输入状态 - 为每种颜色类型维护独立状态
const customColors = ref<Record<ColorType, string>>({
  primary: '#409eff',
  success: '#67c23a',
  warning: '#e6a23c',
  danger: '#f56c6c',
  info: '#909399',
});

const lastCustomColors = ref<Record<ColorType, string>>({
  primary: '#409eff',
  success: '#67c23a',
  warning: '#e6a23c',
  danger: '#f56c6c',
  info: '#909399',
});

const showColorPickers = ref<Record<ColorType, boolean>>({
  primary: false,
  success: false,
  warning: false,
  danger: false,
  info: false,
});

// 获取当前颜色值，提供默认值
const getCurrentColor = (type: ColorType): string => {
  switch (type) {
    case 'primary': return themeColor.value || '#409eff';
    case 'success': return successColor.value || '#67c23a';
    case 'warning': return warningColor.value || '#e6a23c';
    case 'danger': return dangerColor.value || '#f56c6c';
    case 'info': return infoColor.value || '#909399';
  }
};

// 设置当前颜色值
const setCurrentColor = (type: ColorType, color: string) => {
  switch (type) {
    case 'primary': 
      themeColor.value = color;
      break;
    case 'success': 
      successColor.value = color;
      break;
    case 'warning': 
      warningColor.value = color;
      break;
    case 'danger': 
      dangerColor.value = color;
      break;
    case 'info': 
      infoColor.value = color;
      break;
  }
};

// 选择预设颜色
const selectPresetColor = (type: ColorType, color: string) => {
  setCurrentColor(type, color);
};

// 应用自定义颜色
const applyCustomColor = (type: ColorType) => {
  const color = customColors.value[type];
  if (/^#[0-9A-F]{6}$/i.test(color)) {
    setCurrentColor(type, color);
    lastCustomColors.value[type] = color;
    showColorPickers.value[type] = false;
  } else {
    ElMessage.error("请输入有效的颜色值（格式：#RRGGBB）");
  }
};

// 获取指定颜色类型的预设色板
const getPresetColors = (type: ColorType): PresetColor[] => {
  const config = colorConfigs.find(c => c.type === type);
  return config?.presets || [];
};

// 打开自定义颜色选择器时的处理
const handleColorPickerOpen = (type: ColorType) => {
  const currentColor = getCurrentColor(type);
  const presets = getPresetColors(type);
  const isPreset = presets.some(p => p.color === currentColor);
  
  if (!isPreset) {
    customColors.value[type] = currentColor;
  } else {
    customColors.value[type] = lastCustomColors.value[type];
  }
};

// 重置为默认颜色
const resetColor = (type: ColorType, defaultColor: string) => {
  setCurrentColor(type, defaultColor);
};

// 计算当前选中的预设颜色
const getSelectedPresetColor = (type: ColorType) => {
  const currentColor = getCurrentColor(type);
  const presets = getPresetColors(type);
  return presets.find(p => p.color === currentColor);
};
</script>

<template>
  <div class="theme-color-settings">
    <div 
      v-for="config in colorConfigs" 
      :key="config.type" 
      class="color-config-item"
    >
      <div class="color-config-header">
        <div class="setting-label">
          <span>{{ config.label }}</span>
          <el-tooltip :content="config.description" placement="top">
            <el-icon class="info-icon">
              <InfoFilled />
            </el-icon>
          </el-tooltip>
        </div>
      </div>

      <div class="theme-color-selector">
        <div class="preset-colors">
          <el-tooltip
            v-for="preset in config.presets"
            :key="preset.color"
            :content="preset.name"
            placement="top"
          >
            <button
              class="color-item"
              :class="{ active: getCurrentColor(config.type) === preset.color }"
              :style="{ backgroundColor: preset.color }"
              @click="selectPresetColor(config.type, preset.color)"
            >
              <span v-if="getCurrentColor(config.type) === preset.color" class="check-mark">✓</span>
            </button>
          </el-tooltip>

          <!-- 自定义颜色按钮 -->
          <el-popover
            v-model:visible="showColorPickers[config.type]"
            placement="bottom"
            :width="260"
            trigger="click"
            @before-enter="handleColorPickerOpen(config.type)"
          >
            <template #reference>
              <button
                class="color-item custom-color-btn"
                :class="{ active: !getSelectedPresetColor(config.type) }"
                :style="{
                  backgroundColor: !getSelectedPresetColor(config.type)
                    ? getCurrentColor(config.type)
                    : lastCustomColors[config.type],
                  border: !getSelectedPresetColor(config.type) ? 'none' : '2px dashed var(--border-color)',
                }"
                :title="!getSelectedPresetColor(config.type) ? '当前自定义颜色' : '自定义颜色'"
              >
                <span v-if="!getSelectedPresetColor(config.type)" class="check-mark">✓</span>
                <span v-else class="custom-icon">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <circle cx="13.5" cy="6.5" r="3.5" />
                    <circle cx="8.5" cy="11.5" r="3.5" />
                    <circle cx="15.5" cy="11.5" r="3.5" />
                  </svg>
                </span>
              </button>
            </template>

            <div class="custom-color-picker">
              <h4>自定义{{ config.label }}</h4>
              <div class="color-input-group">
                <el-input
                  v-model="customColors[config.type]"
                  :placeholder="config.defaultColor"
                  :prefix-icon="null"
                  maxlength="7"
                >
                  <template #prepend>
                    <input type="color" v-model="customColors[config.type]" class="native-color-picker" />
                  </template>
                </el-input>
              </div>
              <div class="color-preview" :style="{ backgroundColor: customColors[config.type] }"></div>
              <div class="picker-actions">
                <el-button size="small" @click="showColorPickers[config.type] = false">取消</el-button>
                <el-button type="primary" size="small" @click="applyCustomColor(config.type)">
                  应用
                </el-button>
              </div>
            </div>
          </el-popover>

          <!-- 重置按钮 -->
          <el-tooltip :content="`重置为默认${config.label}`" placement="top">
            <button class="color-item reset-btn" @click="resetColor(config.type, config.defaultColor)">
              <el-icon>
                <Refresh />
              </el-icon>
            </button>
          </el-tooltip>
        </div>

        <!-- 当前颜色显示 -->
        <div class="current-color-info">
          <span class="color-label">当前：</span>
          <span class="color-value">{{ getCurrentColor(config.type) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.theme-color-settings {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 24px;
}

.color-config-item {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.color-config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.setting-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

.info-icon {
  color: var(--text-color-secondary);
  cursor: help;
}

/* 主题色选择器样式 */
.theme-color-selector {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.preset-colors {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.color-item {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 2px solid transparent;
  cursor: pointer;
  position: relative;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  background-color: var(--card-bg);
}

.color-item:hover {
  transform: scale(1.1);
  box-shadow: 0 0 8px rgba(0, 0, 0, 0.2);
}

.color-item.active {
  border-color: var(--text-color);
  box-shadow: 0 0 0 2px rgba(var(--primary-color-rgb), 0.2);
}

.check-mark {
  color: white;
  font-weight: bold;
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
}

.custom-color-btn .custom-icon {
  color: var(--text-color-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.custom-color-btn:not(.active) {
  position: relative;
  overflow: hidden;
}

.custom-color-btn:not(.active)::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
  background: linear-gradient(
    45deg,
    transparent 48%,
    var(--border-color) 49%,
    var(--border-color) 51%,
    transparent 52%
  );
  pointer-events: none;
}

.reset-btn {
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  color: var(--text-color-secondary);
}

.reset-btn:hover {
  color: var(--primary-color);
  border-color: var(--primary-color);
}

/* 自定义颜色选择器弹窗 */
.custom-color-picker {
  padding: 8px;
}

.custom-color-picker h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--text-color);
}

.color-input-group {
  margin-bottom: 12px;
}

.native-color-picker {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  padding: 0;
  background: transparent;
}

.native-color-picker::-webkit-color-swatch-wrapper {
  padding: 2px;
}

.native-color-picker::-webkit-color-swatch {
  border: 1px solid var(--border-color);
  border-radius: 4px;
}

.color-preview {
  width: 100%;
  height: 60px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  margin-bottom: 12px;
  transition: background-color 0.3s ease;
}

.picker-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.current-color-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  padding: 6px 12px;
  background: var(--bg-color);
  border-radius: 4px;
  border: 1px solid var(--border-color-light);
}

.color-label {
  color: var(--text-color-secondary);
}

.color-value {
  font-family: monospace;
  color: var(--text-color);
  font-weight: 500;
}
</style>
