<script setup lang="ts">
import { computed } from "vue";
import { useSettingsStore } from "@/stores/settings";
import { Snackbar, Dialog } from "@varlet/ui";
import { useI18n } from "@/i18n";
import { useDebugPanel } from "@/composables/useDebugPanel";
import ThemeColorSettings from "@/components/settings/ThemeColorSettings.vue";
import {
  Palette,
  Languages,
  Zap,
  Info,
  ChevronRight,
  Moon,
  Sun,
  Monitor,
  RefreshCw,
  ArrowUpToLine,
  Keyboard,
  Type,
  Globe,
  Bug,
} from "lucide-vue-next";
const settingsStore = useSettingsStore();
const { t, locale } = useI18n();

// 主题选项
const themeOptions = computed(() => [
  { label: t("settings.跟随系统"), value: "auto", icon: Monitor },
  { label: t("settings.浅色模式"), value: "light", icon: Sun },
  { label: t("settings.深色模式"), value: "dark", icon: Moon },
]);

// 语言选项
const languageOptions = [
  { label: "简体中文", value: "zh-CN" },
  { label: "English", value: "en-US" },
];

// 代理模式选项
const proxyOptions = computed(() => [
  { label: t("common.已禁用"), value: "none" },
  { label: t("settings.跟随系统"), value: "system" },
  { label: t("settings.自定义"), value: "custom" },
]);

const currentThemeIcon = computed(() => {
  const mode = settingsStore.settings.appearance.theme;
  return themeOptions.value.find((opt) => opt.value === mode)?.icon || Monitor;
});

const handleThemeChange = async (value: any) => {
  await settingsStore.updateAppearance({ theme: value });
  Snackbar.success(
    t("settings.已切换至", { theme: themeOptions.value.find((opt) => opt.value === value)?.label })
  );
};

const handleLanguageChange = async (value: any) => {
  await settingsStore.updateSettings({ language: value });
  locale.value = value;
  Snackbar.success(
    t("settings.语言已切换至", { lang: languageOptions.find((opt) => opt.value === value)?.label })
  );
};

const handleHapticChange = async (value: any) => {
  await settingsStore.updateAppearance({ hapticFeedback: value });
};

const handleSafeTopChange = async (value: any) => {
  await settingsStore.updateAppearance({ safeTopDistance: Number(value) || 0 });
};

const handleKeyboardAvoidanceChange = async (value: any) => {
  await settingsStore.updateAppearance({ keyboardAvoidanceDistance: Number(value) || 0 });
};

const handleFontSizeScaleChange = async (value: any) => {
  await settingsStore.updateAppearance({ fontSizeScale: value });
};

const handleProxyModeChange = async (value: any) => {
  await settingsStore.updateSettings({
    network: { ...settingsStore.settings.network, proxyMode: value },
  });
};

const handleProxyUrlChange = async (value: any) => {
  await settingsStore.updateSettings({
    network: { ...settingsStore.settings.network, proxyUrl: value },
  });
};

const { toggleDebugPanel } = useDebugPanel();

const handleDebugChange = async (value: any) => {
  await settingsStore.updateSettings({ debugMode: value });
  toggleDebugPanel(value);
  if (value) {
    Snackbar.success(t("settings.调试面板已加载"));
  } else {
    Snackbar.info(t("settings.调试面板已卸载"));
  }
};

const showVersionInfo = () => {
  Snackbar.info("AIO Hub Mobile v0.1.0");
};

const handleRefresh = async () => {
  const action = await Dialog({
    title: t("settings.确认刷新"),
    message: t("settings.刷新提示"),
    confirmButtonText: t("common.确定"),
    cancelButtonText: t("common.取消"),
  });

  if (action === "confirm") {
    // 通过添加随机参数强制绕过部分 WebView 的缓存优化
    const url = new URL(window.location.href);
    url.searchParams.set("t", Date.now().toString());
    window.location.href = url.toString();
  }
};
</script>

<template>
  <div class="app-view app-view--safe-top settings-container">
    <div class="header">
      <h1 class="title">{{ t("settings.标题") }}</h1>
    </div>

    <div class="settings-content">
      <!-- 1. 显示与外观 -->
      <var-paper :elevation="1" class="settings-group">
        <div class="group-title">{{ t("settings.外观") }}</div>

        <!-- 主题模式 -->
        <var-cell ripple>
          <template #icon>
            <div class="group-icon">
              <Palette :size="20" />
            </div>
          </template>
          <div class="cell-content">
            <div class="cell-label">{{ t("settings.主题模式") }}</div>
            <div class="cell-desc">{{ t("settings.主题模式描述") }}</div>
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
                  {{
                    themeOptions.find((o) => o.value === settingsStore.settings.appearance.theme)
                      ?.label
                  }}
                </div>
              </template>
            </var-select>
          </template>
        </var-cell>

        <!-- 主题色板 -->
        <ThemeColorSettings />

        <!-- 字体缩放 -->
        <var-cell :hint="false">
          <template #icon>
            <div class="group-icon">
              <Type :size="20" />
            </div>
          </template>
          <div class="cell-content w-full">
            <div class="flex justify-between items-center mb-2">
              <div class="cell-label">{{ t("settings.字体大小") }}</div>
              <div class="text-primary font-bold">
                {{ settingsStore.settings.appearance.fontSizeScale.toFixed(1) }}
              </div>
            </div>
            <div class="px-2 pb-2">
              <var-slider
                v-model="settingsStore.settings.appearance.fontSizeScale"
                :min="0.8"
                :max="1.5"
                :step="0.1"
                track-height="4"
                thumb-size="18"
                @change="handleFontSizeScaleChange"
              />
            </div>
          </div>
        </var-cell>
      </var-paper>

      <!-- 2. 交互与偏好 -->
      <var-paper :elevation="1" class="settings-group">
        <div class="group-title">{{ t("settings.交互") }}</div>

        <!-- 触感反馈 -->
        <var-cell ripple disabled>
          <template #icon>
            <div class="group-icon">
              <Zap :size="20" />
            </div>
          </template>
          <div class="cell-content">
            <div class="cell-label">{{ t("settings.触感反馈") }}</div>
            <div class="cell-desc">{{ t("settings.触感反馈描述") }} (暂未实现)</div>
          </div>
          <template #extra>
            <var-switch
              v-model="settingsStore.settings.appearance.hapticFeedback"
              disabled
              @change="handleHapticChange"
            />
          </template>
        </var-cell>

        <!-- 顶部避让 -->
        <var-cell ripple>
          <template #icon>
            <div class="group-icon">
              <ArrowUpToLine :size="20" />
            </div>
          </template>
          <div class="cell-content">
            <div class="cell-label">{{ t("settings.顶部避让距离") }}</div>
            <div class="cell-desc">{{ t("settings.顶部避让距离描述") }}</div>
          </div>
          <template #extra>
            <var-input
              :model-value="String(settingsStore.settings.appearance.safeTopDistance)"
              @update:model-value="(v) => handleSafeTopChange(v)"
              type="number"
              variant="standard"
              :hint="false"
              :line="false"
              placeholder="0"
              class="distance-input"
            />
          </template>
        </var-cell>

        <!-- 键盘避让 -->
        <var-cell ripple>
          <template #icon>
            <div class="group-icon">
              <Keyboard :size="20" />
            </div>
          </template>
          <div class="cell-content">
            <div class="cell-label">{{ t("settings.键盘避让距离") }}</div>
            <div class="cell-desc">{{ t("settings.键盘避让距离描述") }}</div>
          </div>
          <template #extra>
            <var-input
              :model-value="String(settingsStore.settings.appearance.keyboardAvoidanceDistance)"
              @update:model-value="(v) => handleKeyboardAvoidanceChange(v)"
              type="number"
              variant="standard"
              :hint="false"
              :line="false"
              placeholder="0"
              class="distance-input"
            />
          </template>
        </var-cell>
      </var-paper>

      <!-- 3. 系统与网络 -->
      <var-paper :elevation="1" class="settings-group">
        <div class="group-title">{{ t("settings.系统") }}</div>

        <!-- 语言 -->
        <var-cell ripple>
          <template #icon>
            <div class="group-icon">
              <Languages :size="20" />
            </div>
          </template>
          <div class="cell-content">
            <div class="cell-label">{{ t("settings.语言") }}</div>
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

        <!-- 网络/代理 -->
        <var-cell ripple disabled>
          <template #icon>
            <div class="group-icon">
              <Globe :size="20" />
            </div>
          </template>
          <div class="cell-content">
            <div class="cell-label">{{ t("settings.网络") }} (暂未实现)</div>
          </div>
          <template #extra>
            <var-select
              v-model="settingsStore.settings.network.proxyMode"
              variant="standard"
              :hint="false"
              :line="false"
              disabled
              @change="handleProxyModeChange"
            >
              <var-option
                v-for="opt in proxyOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </var-select>
          </template>
        </var-cell>

        <var-cell v-if="settingsStore.settings.network.proxyMode === 'custom'">
          <template #icon><div class="group-icon" /></template>
          <var-input
            v-model="settingsStore.settings.network.proxyUrl"
            :placeholder="t('settings.代理地址')"
            variant="standard"
            @change="handleProxyUrlChange"
          />
        </var-cell>

        <!-- 调试模式 -->
        <var-cell ripple>
          <template #icon>
            <div class="group-icon">
              <Bug :size="20" />
            </div>
          </template>
          <div class="cell-content">
            <div class="cell-label">{{ t("settings.调试模式") }}</div>
            <div class="cell-desc">{{ t("settings.调试模式描述") }}</div>
          </div>
          <template #extra>
            <var-switch v-model="settingsStore.settings.debugMode" @change="handleDebugChange" />
          </template>
        </var-cell>
      </var-paper>

      <!-- 关于 -->
      <var-paper :elevation="1" class="settings-group">
        <div class="group-title">{{ t("settings.关于") }}</div>

        <var-cell ripple @click="showVersionInfo">
          <template #icon>
            <div class="group-icon">
              <Info :size="20" />
            </div>
          </template>
          <div class="cell-content">
            <div class="cell-label">{{ t("settings.版本信息") }}</div>
            <div class="cell-desc">{{ t("settings.当前版本", { version: "0.1.0" }) }}</div>
          </div>
          <template #extra>
            <ChevronRight :size="20" class="text-hint" />
          </template>
        </var-cell>

        <var-cell ripple @click="handleRefresh">
          <template #icon>
            <div class="group-icon">
              <RefreshCw :size="20" />
            </div>
          </template>
          <div class="cell-content">
            <div class="cell-label">{{ t("settings.强制刷新") }}</div>
            <div class="cell-desc">{{ t("settings.强制刷新描述") }}</div>
          </div>
          <template #extra>
            <ChevronRight :size="20" class="text-hint" />
          </template>
        </var-cell>
      </var-paper>

      <div class="footer-hint">Made with ❤️ by AIO Team</div>
    </div>
  </div>
</template>

<style scoped>
.settings-container {
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

.w-full {
  width: 100%;
}

.flex {
  display: flex;
}

.justify-between {
  justify-content: space-between;
}

.items-center {
  align-items: center;
}

.mb-2 {
  margin-bottom: 8px;
}

.px-2 {
  padding-left: 8px;
  padding-right: 8px;
}

.pb-2 {
  padding-bottom: 8px;
}

.text-primary {
  color: var(--primary-color);
}

.font-bold {
  font-weight: 700;
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

.distance-input {
  width: 80px;
  --input-placeholder-size: 14px;
}

:deep(.distance-input .var-input__input) {
  text-align: right;
  color: var(--primary-color);
  font-weight: 600;
}
</style>
