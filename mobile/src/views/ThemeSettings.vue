<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { Snackbar } from "@varlet/ui";
import {
  ChevronLeft,
  Check,
  Image,
  Monitor,
  Moon,
  Palette,
  RotateCcw,
  Sun,
  Type,
  Zap,
} from "lucide-vue-next";
import { useI18n } from "@/i18n";
import { useAppearanceSettingsDraft } from "@/composables/useAppearanceSettingsDraft";
import ThemeColorSettings from "@/components/settings/ThemeColorSettings.vue";
import type {
  AppearanceSettings,
  AppearanceWallpaperPreset,
  ThemeMode,
} from "@/types/settings";

const router = useRouter();
const { t } = useI18n();
const { appearanceDraft, updateAppearanceDraft, resetAppearanceDraft } =
  useAppearanceSettingsDraft();

const themeOptions = computed(() => [
  { label: t("settings.跟随系统"), value: "auto" as ThemeMode, icon: Monitor },
  { label: t("settings.浅色模式"), value: "light" as ThemeMode, icon: Sun },
  { label: t("settings.深色模式"), value: "dark" as ThemeMode, icon: Moon },
]);

const wallpaperPresets = computed(() => [
  {
    label: t("settings.壁纸预设.极光"),
    value: "aurora" as AppearanceWallpaperPreset,
    className: "wallpaper-preview--aurora",
  },
  {
    label: t("settings.壁纸预设.晨光"),
    value: "morning" as AppearanceWallpaperPreset,
    className: "wallpaper-preview--morning",
  },
  {
    label: t("settings.壁纸预设.峡谷"),
    value: "canyon" as AppearanceWallpaperPreset,
    className: "wallpaper-preview--canyon",
  },
  {
    label: t("settings.壁纸预设.墨色"),
    value: "ink" as AppearanceWallpaperPreset,
    className: "wallpaper-preview--ink",
  },
]);

const currentThemeIcon = computed(() => {
  return (
    themeOptions.value.find((opt) => opt.value === appearanceDraft.value.theme)
      ?.icon || Monitor
  );
});

const currentThemeLabel = computed(() => {
  return (
    themeOptions.value.find((opt) => opt.value === appearanceDraft.value.theme)
      ?.label || t("settings.跟随系统")
  );
});

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

const handleBack = () => {
  router.back();
};

const handleReset = async () => {
  await resetAppearanceDraft();
  Snackbar.success(t("common.重置成功"));
};

const handleThemeChange = async (value: any) => {
  await updateAppearanceDraft({ theme: value });
  Snackbar.success(t("settings.已切换至", { theme: currentThemeLabel.value }));
};

const handleThemeColorChange = async (color: string) => {
  await updateAppearanceDraft({ themeColor: color });
};

const updateWallpaper = async (
  updates: Partial<AppearanceSettings["wallpaper"]>
) => {
  await updateAppearanceDraft({
    wallpaper: {
      ...appearanceDraft.value.wallpaper,
      ...updates,
    },
  });
};

const handleWallpaperEnabledChange = async (value: any) => {
  await updateWallpaper({ enabled: Boolean(value) });
};

const handleWallpaperPresetChange = async (
  preset: AppearanceWallpaperPreset
) => {
  await updateWallpaper({ preset, enabled: true });
};

const handleWallpaperDimChange = async (value: any) => {
  await updateWallpaper({ dimOpacity: value });
};

const handleWallpaperBlurChange = async (value: any) => {
  await updateWallpaper({ blurIntensity: value });
};

const handleFontSizeScaleChange = async (value: any) => {
  await updateAppearanceDraft({ fontSizeScale: value });
};

const handleUiEffectsChange = async (value: any) => {
  await updateAppearanceDraft({ enableUiEffects: value });
};

const handleUiBlurChange = async (value: any) => {
  await updateAppearanceDraft({ enableUiBlur: value });
};

const handleUiBlurIntensityChange = async (value: any) => {
  await updateAppearanceDraft({ uiBlurIntensity: value });
};

const handleUiBaseOpacityChange = async (value: any) => {
  await updateAppearanceDraft({ uiBaseOpacity: value });
};

const handleBorderOpacityChange = async (value: any) => {
  await updateAppearanceDraft({ borderOpacity: value });
};

const handleBorderWidthChange = async (value: any) => {
  await updateAppearanceDraft({ borderWidth: value });
};

const handleRadiusScaleChange = async (value: any) => {
  await updateAppearanceDraft({ radiusScale: value });
};
</script>

<template>
  <div class="theme-settings-view">
    <var-app-bar
      :title="t('settings.主题与壁纸')"
      title-position="center"
      fixed
      safe-area
      z-index="100"
    >
      <template #left>
        <var-button round text color="transparent" @click="handleBack">
          <ChevronLeft :size="24" />
        </var-button>
      </template>
      <template #right>
        <var-button round text color="transparent" @click="handleReset">
          <RotateCcw :size="20" />
        </var-button>
      </template>
    </var-app-bar>

    <div class="theme-settings-content">
      <div class="theme-preview">
        <div class="preview-wallpaper"></div>
        <div class="preview-surface">
          <div class="preview-line preview-line--wide"></div>
          <div class="preview-line"></div>
          <div class="preview-actions">
            <span></span>
            <span></span>
          </div>
        </div>
      </div>

      <var-paper :elevation="1" class="settings-group">
        <div class="group-title">{{ t("settings.主题模式") }}</div>

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
              v-model="appearanceDraft.theme"
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
                  <component :is="currentThemeIcon" :size="16" />
                  <span>{{ currentThemeLabel }}</span>
                </div>
              </template>
            </var-select>
          </template>
        </var-cell>
      </var-paper>

      <var-paper :elevation="1" class="settings-group">
        <div class="group-title">{{ t("settings.壁纸") }}</div>

        <var-cell :hint="false">
          <template #icon>
            <div class="group-icon">
              <Image :size="20" />
            </div>
          </template>
          <div class="cell-content">
            <div class="cell-label">{{ t("settings.启用壁纸") }}</div>
            <div class="cell-desc">{{ t("settings.启用壁纸描述") }}</div>
          </div>
          <template #extra>
            <var-switch
              v-model="appearanceDraft.wallpaper.enabled"
              @change="handleWallpaperEnabledChange"
            />
          </template>
        </var-cell>

        <div class="wallpaper-grid">
          <button
            v-for="preset in wallpaperPresets"
            :key="preset.value"
            type="button"
            class="wallpaper-option"
            :class="{ active: appearanceDraft.wallpaper.preset === preset.value }"
            @click="handleWallpaperPresetChange(preset.value)"
          >
            <span class="wallpaper-preview-thumb" :class="preset.className">
              <Check
                v-if="appearanceDraft.wallpaper.preset === preset.value"
                :size="16"
              />
            </span>
            <span class="wallpaper-option-label">{{ preset.label }}</span>
          </button>
        </div>

        <var-cell :hint="false">
          <template #icon><div class="group-icon" /></template>
          <div class="cell-content w-full">
            <div class="slider-heading">
              <div class="cell-label">{{ t("settings.壁纸遮罩") }}</div>
              <div class="value-label">
                {{ formatPercent(appearanceDraft.wallpaper.dimOpacity) }}
              </div>
            </div>
            <div class="slider-track">
              <var-slider
                v-model="appearanceDraft.wallpaper.dimOpacity"
                :min="0"
                :max="0.8"
                :step="0.01"
                :disabled="!appearanceDraft.wallpaper.enabled"
                track-height="4"
                thumb-size="18"
                @change="handleWallpaperDimChange"
              />
            </div>
          </div>
        </var-cell>

        <var-cell :hint="false">
          <template #icon><div class="group-icon" /></template>
          <div class="cell-content w-full">
            <div class="slider-heading">
              <div class="cell-label">{{ t("settings.壁纸模糊") }}</div>
              <div class="value-label">
                {{ appearanceDraft.wallpaper.blurIntensity }}px
              </div>
            </div>
            <div class="slider-track">
              <var-slider
                v-model="appearanceDraft.wallpaper.blurIntensity"
                :min="0"
                :max="24"
                :step="1"
                :disabled="!appearanceDraft.wallpaper.enabled"
                track-height="4"
                thumb-size="18"
                @change="handleWallpaperBlurChange"
              />
            </div>
          </div>
        </var-cell>
      </var-paper>

      <var-paper :elevation="1" class="settings-group">
        <div class="group-title">{{ t("settings.色彩") }}</div>
        <ThemeColorSettings
          :theme-color="appearanceDraft.themeColor"
          @change="handleThemeColorChange"
        />
      </var-paper>

      <var-paper :elevation="1" class="settings-group">
        <div class="group-title">{{ t("settings.字体与质感") }}</div>

        <var-cell :hint="false">
          <template #icon>
            <div class="group-icon">
              <Type :size="20" />
            </div>
          </template>
          <div class="cell-content w-full">
            <div class="slider-heading">
              <div class="cell-label">{{ t("settings.字体大小") }}</div>
              <div class="value-label">
                {{ appearanceDraft.fontSizeScale.toFixed(1) }}
              </div>
            </div>
            <div class="slider-track">
              <var-slider
                v-model="appearanceDraft.fontSizeScale"
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

        <var-cell :hint="false">
          <template #icon>
            <div class="group-icon">
              <Zap :size="20" />
            </div>
          </template>
          <div class="cell-content">
            <div class="cell-label">{{ t("settings.界面质感") }}</div>
            <div class="cell-desc">{{ t("settings.界面质感描述") }}</div>
          </div>
          <template #extra>
            <var-switch
              v-model="appearanceDraft.enableUiEffects"
              @change="handleUiEffectsChange"
            />
          </template>
        </var-cell>

        <var-cell :hint="false">
          <template #icon>
            <div class="group-icon">
              <Palette :size="20" />
            </div>
          </template>
          <div class="cell-content w-full">
            <div class="slider-heading">
              <div class="cell-label">{{ t("settings.基础透明度") }}</div>
              <div class="value-label">
                {{ formatPercent(appearanceDraft.uiBaseOpacity) }}
              </div>
            </div>
            <div class="slider-track">
              <var-slider
                v-model="appearanceDraft.uiBaseOpacity"
                :min="0.55"
                :max="1"
                :step="0.01"
                :disabled="!appearanceDraft.enableUiEffects"
                track-height="4"
                thumb-size="18"
                @change="handleUiBaseOpacityChange"
              />
            </div>
          </div>
        </var-cell>

        <var-cell :hint="false">
          <template #icon>
            <div class="group-icon">
              <Monitor :size="20" />
            </div>
          </template>
          <div class="cell-content">
            <div class="cell-label">{{ t("settings.背景模糊") }}</div>
            <div class="cell-desc">{{ t("settings.背景模糊描述") }}</div>
          </div>
          <template #extra>
            <var-switch
              v-model="appearanceDraft.enableUiBlur"
              :disabled="!appearanceDraft.enableUiEffects"
              @change="handleUiBlurChange"
            />
          </template>
        </var-cell>

        <var-cell :hint="false">
          <template #icon><div class="group-icon" /></template>
          <div class="cell-content w-full">
            <div class="slider-heading">
              <div class="cell-label">{{ t("settings.模糊强度") }}</div>
              <div class="value-label">
                {{ appearanceDraft.uiBlurIntensity }}px
              </div>
            </div>
            <div class="slider-track">
              <var-slider
                v-model="appearanceDraft.uiBlurIntensity"
                :min="0"
                :max="24"
                :step="1"
                :disabled="
                  !appearanceDraft.enableUiEffects ||
                  !appearanceDraft.enableUiBlur
                "
                track-height="4"
                thumb-size="18"
                @change="handleUiBlurIntensityChange"
              />
            </div>
          </div>
        </var-cell>

        <var-cell :hint="false">
          <template #icon>
            <div class="group-icon">
              <Palette :size="20" />
            </div>
          </template>
          <div class="cell-content w-full">
            <div class="slider-heading">
              <div class="cell-label">{{ t("settings.边框透明度") }}</div>
              <div class="value-label">
                {{ formatPercent(appearanceDraft.borderOpacity) }}
              </div>
            </div>
            <div class="slider-track">
              <var-slider
                v-model="appearanceDraft.borderOpacity"
                :min="0"
                :max="1"
                :step="0.01"
                track-height="4"
                thumb-size="18"
                @change="handleBorderOpacityChange"
              />
            </div>
          </div>
        </var-cell>

        <var-cell :hint="false">
          <template #icon><div class="group-icon" /></template>
          <div class="cell-content w-full">
            <div class="slider-heading">
              <div class="cell-label">{{ t("settings.边框宽度") }}</div>
              <div class="value-label">{{ appearanceDraft.borderWidth }}px</div>
            </div>
            <div class="slider-track">
              <var-slider
                v-model="appearanceDraft.borderWidth"
                :min="0"
                :max="3"
                :step="1"
                track-height="4"
                thumb-size="18"
                @change="handleBorderWidthChange"
              />
            </div>
          </div>
        </var-cell>

        <var-cell :hint="false">
          <template #icon><div class="group-icon" /></template>
          <div class="cell-content w-full">
            <div class="slider-heading">
              <div class="cell-label">{{ t("settings.圆角比例") }}</div>
              <div class="value-label">
                {{ appearanceDraft.radiusScale.toFixed(1) }}
              </div>
            </div>
            <div class="slider-track">
              <var-slider
                v-model="appearanceDraft.radiusScale"
                :min="0.6"
                :max="1.6"
                :step="0.1"
                track-height="4"
                thumb-size="18"
                @change="handleRadiusScaleChange"
              />
            </div>
          </div>
        </var-cell>
      </var-paper>

      <div class="bottom-placeholder"></div>
    </div>
  </div>
</template>

<style scoped>
.theme-settings-view {
  min-height: 100%;
  color: var(--text-color);
}

.theme-settings-content {
  padding: calc(var(--app-top-offset) + 14px) 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.theme-preview {
  position: relative;
  min-height: 150px;
  overflow: hidden;
  border: var(--border-width) solid var(--border-color);
  border-radius: var(--app-radius-xl);
  background-color: var(--container-bg);
}

.preview-wallpaper {
  position: absolute;
  inset: 0;
  background: var(--app-wallpaper-bg);
  filter: blur(var(--app-wallpaper-blur));
  transform: scale(1.03);
}

.preview-wallpaper::after {
  content: "";
  position: absolute;
  inset: 0;
  background-color: rgba(var(--bg-color-rgb), var(--app-wallpaper-dim));
}

.preview-surface {
  position: absolute;
  left: 18px;
  right: 18px;
  bottom: 18px;
  padding: 18px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: var(--app-radius-lg);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.preview-line {
  width: 46%;
  height: 10px;
  border-radius: 999px;
  background-color: color-mix(in srgb, var(--text-color), transparent 72%);
}

.preview-line--wide {
  width: 72%;
  background-color: color-mix(in srgb, var(--primary-color), transparent 36%);
}

.preview-actions {
  display: flex;
  gap: 8px;
}

.preview-actions span {
  width: 46px;
  height: 22px;
  border-radius: var(--app-radius-sm);
  background-color: color-mix(in srgb, var(--primary-color), transparent 84%);
  border: var(--border-width) solid
    color-mix(in srgb, var(--primary-color), transparent 58%);
}

.settings-group {
  overflow: hidden;
  background-color: var(--card-bg);
  border-radius: var(--app-radius-lg);
}

.group-title {
  padding: 16px 16px 8px;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--primary-color);
  text-transform: uppercase;
}

.group-icon {
  min-width: 20px;
  color: var(--primary-color);
  margin-right: 12px;
}

.cell-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cell-label {
  font-size: 1.05rem;
  color: var(--text-color);
}

.cell-desc {
  font-size: 0.85rem;
  color: var(--text-color);
  opacity: 0.6;
}

.selected-value {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 1rem;
  color: var(--primary-color);
}

.wallpaper-grid {
  padding: 8px 16px 12px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.wallpaper-option {
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
}

.wallpaper-preview-thumb {
  width: 100%;
  aspect-ratio: 1;
  border-radius: var(--app-radius-md);
  border: var(--border-width) solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  overflow: hidden;
}

.wallpaper-option.active .wallpaper-preview-thumb {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px
    color-mix(in srgb, var(--primary-color), transparent 72%);
}

.wallpaper-option-label {
  max-width: 100%;
  font-size: 0.78rem;
  color: var(--text-color);
  opacity: 0.78;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wallpaper-preview--aurora {
  background:
    radial-gradient(circle at 18% 20%, rgba(52, 211, 153, 0.88), transparent 32%),
    radial-gradient(circle at 78% 24%, rgba(96, 165, 250, 0.82), transparent 34%),
    radial-gradient(circle at 50% 88%, rgba(244, 114, 182, 0.64), transparent 38%),
    linear-gradient(145deg, #172033, #0f766e);
}

.wallpaper-preview--morning {
  background:
    radial-gradient(circle at 18% 18%, rgba(255, 214, 165, 0.94), transparent 32%),
    radial-gradient(circle at 82% 24%, rgba(125, 211, 252, 0.78), transparent 36%),
    linear-gradient(145deg, #fff7ed, #dbeafe);
}

.wallpaper-preview--canyon {
  background:
    radial-gradient(circle at 18% 20%, rgba(244, 114, 86, 0.72), transparent 34%),
    radial-gradient(circle at 76% 28%, rgba(251, 191, 36, 0.62), transparent 36%),
    linear-gradient(150deg, #3a1f1b, #d97706);
}

.wallpaper-preview--ink {
  background:
    radial-gradient(circle at 24% 20%, rgba(148, 163, 184, 0.36), transparent 34%),
    radial-gradient(circle at 72% 72%, rgba(45, 212, 191, 0.28), transparent 36%),
    linear-gradient(150deg, #0f172a, #111827);
}

.w-full {
  width: 100%;
}

.slider-heading {
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.value-label {
  flex-shrink: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--primary-color);
}

.slider-track {
  padding: 0 8px 8px;
}

.bottom-placeholder {
  height: 32px;
}

:deep(.var-cell) {
  --cell-padding: 12px 16px;
  --cell-min-height: 64px;
}

:deep(.var-select) {
  width: auto;
  min-width: 140px;
}

@media (max-width: 360px) {
  .wallpaper-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
