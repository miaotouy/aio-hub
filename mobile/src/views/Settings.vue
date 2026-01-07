<script setup lang="ts">
import { computed } from "vue";
import { useSettingsStore } from "@/stores/settings";
import { Snackbar } from "@varlet/ui";
import {
  Palette,
  Languages,
  Zap,
  Bug,
  Info,
  ChevronRight,
  Moon,
  Sun,
  Monitor,
} from "lucide-vue-next";

const settingsStore = useSettingsStore();

// 主题选项
const themeOptions = [
  { label: "跟随系统", value: "auto", icon: Monitor },
  { label: "浅色模式", value: "light", icon: Sun },
  { label: "深色模式", value: "dark", icon: Moon },
];

// 语言选项
const languageOptions = [
  { label: "简体中文", value: "zh-CN" },
  { label: "English", value: "en-US" },
];

const currentThemeIcon = computed(() => {
  const mode = settingsStore.settings.appearance.theme;
  return themeOptions.find((opt) => opt.value === mode)?.icon || Monitor;
});

const handleThemeChange = async (value: any) => {
  await settingsStore.updateAppearance({ theme: value });
  Snackbar.success(`已切换至 ${themeOptions.find((opt) => opt.value === value)?.label}`);
};

const handleLanguageChange = async (value: any) => {
  await settingsStore.updateSettings({ language: value });
  Snackbar.success(`语言已切换至 ${languageOptions.find((opt) => opt.value === value)?.label}`);
};

const handleHapticChange = async (value: any) => {
  await settingsStore.updateAppearance({ hapticFeedback: value });
};

const handleDebugChange = async (value: any) => {
  await settingsStore.updateSettings({ debugMode: value });
  if (value) {
    const eruda = await import("eruda");
    eruda.default.init();
    Snackbar.success("调试面板已加载");
  } else {
    const eruda = await import("eruda");
    eruda.default.destroy();
    Snackbar.info("调试面板已卸载");
  }
};

const showVersionInfo = () => {
  Snackbar.info("AIO Hub Mobile v0.1.0");
};
</script>

<template>
  <div class="settings-container safe-area-top">
    <div class="header">
      <h1 class="title">设置</h1>
    </div>

    <div class="settings-content">
      <!-- 外观设置 -->
      <var-paper :elevation="1" class="settings-group">
        <div class="group-title">外观</div>
        
        <var-cell ripple>
          <template #icon>
            <div class="group-icon">
              <Palette :size="20" />
            </div>
          </template>
          <div class="cell-content">
            <div class="cell-label">主题模式</div>
            <div class="cell-desc">设置应用的视觉风格</div>
          </div>
          <template #extra>
            <var-select
              v-model="settingsStore.settings.appearance.theme"
              variant="standard"
              :hint="false"
              :line="false"
              @change="handleThemeChange"
            >
              <var-option
                v-for="opt in themeOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
              <template #selected>
                <div class="selected-value">
                  <component :is="currentThemeIcon" :size="16" class="mr-1" />
                  {{ themeOptions.find(o => o.value === settingsStore.settings.appearance.theme)?.label }}
                </div>
              </template>
            </var-select>
          </template>
        </var-cell>

        <var-cell ripple>
          <template #icon>
            <div class="group-icon">
              <Zap :size="20" />
            </div>
          </template>
          <div class="cell-content">
            <div class="cell-label">触感反馈</div>
            <div class="cell-desc">交互时触发轻微震动</div>
          </div>
          <template #extra>
            <var-switch
              v-model="settingsStore.settings.appearance.hapticFeedback"
              @change="handleHapticChange"
            />
          </template>
        </var-cell>
      </var-paper>

      <!-- 通用设置 -->
      <var-paper :elevation="1" class="settings-group">
        <div class="group-title">通用</div>

        <var-cell ripple>
          <template #icon>
            <div class="group-icon">
              <Languages :size="20" />
            </div>
          </template>
          <div class="cell-content">
            <div class="cell-label">语言（占位符）</div>
          </div>
          <template #extra>
            <var-select
              v-model="settingsStore.settings.language"
              variant="standard"
              :hint="false"
              :line="false"
              @change="handleLanguageChange"
            >
              <var-option
                v-for="opt in languageOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </var-select>
          </template>
        </var-cell>

        <var-cell ripple>
          <template #icon>
            <div class="group-icon">
              <Bug :size="20" />
            </div>
          </template>
          <div class="cell-content">
            <div class="cell-label">调试模式</div>
            <div class="cell-desc">显示开发者相关的调试信息</div>
          </div>
          <template #extra>
            <var-switch
              v-model="settingsStore.settings.debugMode"
              @change="handleDebugChange"
            />
          </template>
        </var-cell>
      </var-paper>

      <!-- 关于 -->
      <var-paper :elevation="1" class="settings-group">
        <div class="group-title">关于</div>

        <var-cell ripple @click="showVersionInfo">
          <template #icon>
            <div class="group-icon">
              <Info :size="20" />
            </div>
          </template>
          <div class="cell-content">
            <div class="cell-label">版本信息</div>
            <div class="cell-desc">当前版本 0.1.0</div>
          </div>
          <template #extra>
            <ChevronRight :size="20" class="text-hint" />
          </template>
        </var-cell>
      </var-paper>

      <div class="footer-hint">
        Made with ❤️ by AIO Team
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-container {
  min-height: 100%;
  background-color: var(--bg-color);
  padding-bottom: 32px;
}

.header {
  padding: 24px 20px;
}

.title {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-color);
  margin: 0;
}

.settings-content {
  padding: 0 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.settings-group {
  border-radius: 16px;
  overflow: hidden;
  background-color: var(--card-bg);
}

.group-title {
  padding: 16px 16px 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--primary-color);
  text-transform: uppercase;
  letter-spacing: 0.5px;
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

.selected-value {
  display: flex;
  align-items: center;
  font-size: 14px;
  color: var(--primary-color);
}

.mr-1 {
  margin-right: 4px;
}

.text-hint {
  color: var(--text-color);
  opacity: 0.3;
}

.footer-hint {
  margin-top: 24px;
  text-align: center;
  font-size: 12px;
  color: var(--text-color);
  opacity: 0.4;
}

/* 覆盖 Varlet UI 默认边距 */
:deep(.var-cell) {
  --cell-padding: 12px 16px;
  --cell-min-height: 64px;
}

:deep(.var-select) {
  width: auto;
  min-width: 140px;
}
</style>
