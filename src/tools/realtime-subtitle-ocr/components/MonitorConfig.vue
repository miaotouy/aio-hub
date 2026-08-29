<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<script setup lang="ts">
import { computed } from "vue";
import {
  ElSlider,
  ElSelect,
  ElOption,
  ElPopover,
  ElButton,
  ElSwitch,
  ElCollapse,
  ElCollapseItem,
} from "element-plus";
import { Settings as SettingsIcon } from "lucide-vue-next";
import { useScreenMonitor } from "../composables/useScreenMonitor";
import { useOcrProfiles, useOcrExtensions } from "@/tools/smart-ocr/platform";
import type { OcrEngineConfig } from "@/tools/smart-ocr/types";
import type {
  DedupSensitivity,
  ImageFilterConfig,
  ImageFilterPreset,
} from "../types";

const {
  config,
  setIntervalMs,
  setDedupSensitivity,
  setEngineConfig,
  setImageFilterPreset,
  setImageFilterConfig,
} = useScreenMonitor();

const { enabledProfiles } = useOcrProfiles();
const { ocrExtensions, getOcrExtensionById } = useOcrExtensions();

const engineType = computed(() => {
  const cfg = config.value.engineConfig;
  if (cfg.type === "plugin") {
    const ext = ocrExtensions.value.find(
      (e) =>
        e.pluginId === cfg.pluginId && e.contributionId === cfg.contributionId
    );
    return ext ? `plugin:${ext.id}` : "plugin";
  }
  return cfg.type;
});

const activeProfileId = computed(() =>
  config.value.engineConfig.type === "cloud"
    ? config.value.engineConfig.activeProfileId
    : ""
);

const currentPluginOcrExtension = computed(() => {
  const cfg = config.value.engineConfig;
  if (cfg.type !== "plugin") return null;
  return (
    ocrExtensions.value.find(
      (e) =>
        e.pluginId === cfg.pluginId && e.contributionId === cfg.contributionId
    ) ?? null
  );
});

const pluginModelProfileOptions = computed(
  () => currentPluginOcrExtension.value?.modelProfiles ?? []
);

const pluginModelProfile = computed({
  get: () => {
    const cfg = config.value.engineConfig;
    const extension = currentPluginOcrExtension.value;
    if (cfg.type !== "plugin" || !extension) return "";
    return (
      cfg.modelProfile ??
      extension.defaultModelProfile ??
      extension.modelProfiles[0]?.id ??
      ""
    );
  },
  set: (value) => {
    const cfg = config.value.engineConfig;
    if (cfg.type !== "plugin") return;
    setEngineConfig({
      ...cfg,
      modelProfile: value,
    });
  },
});

const pluginLanguageOptions = computed(
  () => currentPluginOcrExtension.value?.languages ?? []
);

const pluginLanguage = computed({
  get: () => {
    const cfg = config.value.engineConfig;
    const extension = currentPluginOcrExtension.value;
    if (cfg.type !== "plugin" || !extension) return "";
    return (
      cfg.language ??
      extension.defaultLanguage ??
      extension.languages[0]?.id ??
      ""
    );
  },
  set: (value) => {
    const cfg = config.value.engineConfig;
    if (cfg.type !== "plugin") return;
    setEngineConfig({
      ...cfg,
      language: value,
    });
  },
});

function onEngineTypeChange(val: string) {
  let next: OcrEngineConfig;
  if (val.startsWith("plugin:")) {
    const extId = val.substring(7);
    const ext = getOcrExtensionById(extId);
    if (ext) {
      next = {
        type: "plugin",
        pluginId: ext.pluginId,
        contributionId: ext.contributionId,
        modelProfile: ext.defaultModelProfile ?? ext.modelProfiles[0]?.id,
        language: ext.defaultLanguage ?? ext.languages[0]?.id,
      };
    } else {
      return;
    }
  } else {
    switch (val) {
      case "native":
        next = { type: "native", name: "native" };
        break;
      case "tesseract":
        next = {
          type: "tesseract",
          name: "tesseract",
          language: "chi_sim+eng",
        };
        break;
      case "vlm":
        next = {
          type: "vlm",
          name: "vlm",
          profileId: "",
          modelId: "",
          prompt: "请识别图片中的文字，仅输出识别结果。",
        };
        break;
      case "cloud":
        next = {
          type: "cloud",
          name: "cloud",
          activeProfileId: enabledProfiles.value[0]?.id ?? "",
        };
        break;
      default:
        return;
    }
  }
  setEngineConfig(next);
}

function onProfileChange(id: string) {
  if (config.value.engineConfig.type !== "cloud") return;
  setEngineConfig({
    ...config.value.engineConfig,
    activeProfileId: id,
  });
}

function onImageFilterPresetChange(preset: ImageFilterPreset) {
  if (preset === "custom") return;
  setImageFilterPreset(preset);
}

function updateImageFilter<K extends keyof ImageFilterConfig>(
  key: K,
  value: ImageFilterConfig[K]
) {
  setImageFilterConfig({
    ...config.value.imageFilter,
    [key]: value,
  });
}
</script>

<template>
  <div class="monitor-config">
    <!-- OCR 引擎 -->
    <div class="toolbar-item">
      <span class="toolbar-label">OCR 引擎:</span>
      <el-select
        :model-value="engineType"
        size="small"
        style="width: 180px"
        @update:model-value="onEngineTypeChange"
      >
        <el-option label="Windows Native OCR" value="native" />
        <el-option label="Tesseract.js" value="tesseract" />
        <el-option label="VLM 多模态大模型" value="vlm" />
        <el-option label="云端 OCR" value="cloud" />
        <!-- 动态渲染插件引擎 -->
        <el-option
          v-for="ext in ocrExtensions"
          :key="ext.id"
          :label="ext.name"
          :value="`plugin:${ext.id}`"
          :disabled="!ext.enabled || ext.broken"
        />
      </el-select>
      <!-- 引擎额外配置气泡 -->
      <el-popover
        v-if="
          engineType === 'cloud' ||
          engineType === 'tesseract' ||
          config.engineConfig.type === 'plugin'
        "
        placement="bottom"
        title="引擎额外配置"
        :width="240"
        trigger="click"
      >
        <template #reference>
          <el-button size="small" circle style="margin-left: 4px">
            <SettingsIcon :size="14" />
          </el-button>
        </template>
        <div class="engine-popover-content">
          <div v-if="engineType === 'cloud'" class="popover-field">
            <label>云端 OCR 配置</label>
            <el-select
              :model-value="activeProfileId"
              size="small"
              placeholder="选择已启用的云端 OCR 配置"
              @update:model-value="onProfileChange"
            >
              <el-option
                v-for="p in enabledProfiles"
                :key="p.id"
                :label="p.name"
                :value="p.id"
              />
            </el-select>
            <div v-if="!enabledProfiles.length" class="popover-hint">
              请先在 Smart OCR 中配置并启用云端 OCR 配置
            </div>
          </div>
          <div v-if="engineType === 'tesseract'" class="popover-field">
            <label>识别语言</label>
            <el-select
              :model-value="
                config.engineConfig.type === 'tesseract'
                  ? config.engineConfig.language
                  : 'chi_sim+eng'
              "
              size="small"
              @update:model-value="
                setEngineConfig({
                  ...config.engineConfig,
                  type: 'tesseract',
                  name: 'tesseract',
                  language: $event as string,
                })
              "
            >
              <el-option label="简体中文 + 英文" value="chi_sim+eng" />
              <el-option label="繁体中文 + 英文" value="chi_tra+eng" />
              <el-option label="纯英文" value="eng" />
              <el-option label="纯日文" value="jpn" />
            </el-select>
          </div>
          <div
            v-if="config.engineConfig.type === 'plugin'"
            class="popover-field"
          >
            <template v-if="currentPluginOcrExtension">
              <!-- 模型配置 -->
              <div
                v-if="pluginModelProfileOptions.length > 0"
                class="popover-sub-field"
              >
                <label
                  style="
                    font-size: 11px;
                    color: var(--el-text-color-secondary);
                    font-weight: 500;
                    display: block;
                    margin-bottom: 4px;
                  "
                  >模型配置</label
                >
                <el-select
                  v-model="pluginModelProfile"
                  size="small"
                  placeholder="选择模型配置"
                >
                  <el-option
                    v-for="opt in pluginModelProfileOptions"
                    :key="opt.id"
                    :label="opt.name"
                    :value="opt.id"
                  />
                </el-select>
              </div>
              <!-- 识别语言 -->
              <div
                v-if="pluginLanguageOptions.length > 0"
                class="popover-sub-field"
                style="margin-top: 8px"
              >
                <label
                  style="
                    font-size: 11px;
                    color: var(--el-text-color-secondary);
                    font-weight: 500;
                    display: block;
                    margin-bottom: 4px;
                  "
                  >识别语言</label
                >
                <el-select
                  v-model="pluginLanguage"
                  size="small"
                  placeholder="选择识别语言"
                >
                  <el-option
                    v-for="opt in pluginLanguageOptions"
                    :key="opt.id"
                    :label="opt.name"
                    :value="opt.id"
                  />
                </el-select>
              </div>
            </template>
            <div v-else class="popover-hint">
              当前插件不可用，请检查插件状态
            </div>
          </div>
        </div>
      </el-popover>

      <!-- OCR 图像滤镜 -->
      <div class="toolbar-item">
        <span class="toolbar-label">图像滤镜:</span>
        <el-select
          :model-value="config.imageFilter.preset"
          size="small"
          style="width: 118px"
          @update:model-value="
            onImageFilterPresetChange($event as ImageFilterPreset)
          "
        >
          <el-option label="原图" value="original" />
          <el-option label="灰度增强" value="grayscale-enhanced" />
          <el-option label="高对比黑白" value="high-contrast-binary" />
          <el-option label="反色黑白" value="inverted-binary" />
          <el-option label="自定义" value="custom" disabled />
        </el-select>
        <el-popover
          placement="bottom-end"
          title="OCR 图像滤镜"
          :width="300"
          trigger="click"
        >
          <template #reference>
            <el-button size="small" circle aria-label="配置 OCR 图像滤镜">
              <SettingsIcon :size="14" />
            </el-button>
          </template>
          <div class="filter-popover-content">
            <p class="filter-popover-hint">
              滤镜后的图像会同时用于预览、时间轴截图和 OCR 识别。
            </p>
            <el-collapse>
              <el-collapse-item title="高级参数" name="advanced-filter">
                <div class="filter-field filter-field--inline">
                  <label>灰度</label>
                  <el-switch
                    :model-value="config.imageFilter.grayscale"
                    @update:model-value="
                      updateImageFilter('grayscale', $event as boolean)
                    "
                  />
                </div>
                <div class="filter-field">
                  <label>亮度 {{ config.imageFilter.brightness }}</label>
                  <el-slider
                    :model-value="config.imageFilter.brightness"
                    :min="-100"
                    :max="100"
                    @update:model-value="
                      updateImageFilter('brightness', $event as number)
                    "
                  />
                </div>
                <div class="filter-field">
                  <label>对比度 {{ config.imageFilter.contrast }}</label>
                  <el-slider
                    :model-value="config.imageFilter.contrast"
                    :min="-100"
                    :max="100"
                    @update:model-value="
                      updateImageFilter('contrast', $event as number)
                    "
                  />
                </div>
                <div class="filter-field">
                  <label>饱和度 {{ config.imageFilter.saturation }}</label>
                  <el-slider
                    :model-value="config.imageFilter.saturation"
                    :min="-100"
                    :max="100"
                    @update:model-value="
                      updateImageFilter('saturation', $event as number)
                    "
                  />
                </div>
                <div class="filter-field">
                  <label>色相 {{ config.imageFilter.hue }}°</label>
                  <el-slider
                    :model-value="config.imageFilter.hue"
                    :min="-180"
                    :max="180"
                    @update:model-value="
                      updateImageFilter('hue', $event as number)
                    "
                  />
                </div>
                <div class="filter-field filter-field--inline">
                  <label>反色</label>
                  <el-switch
                    :model-value="config.imageFilter.invert"
                    @update:model-value="
                      updateImageFilter('invert', $event as boolean)
                    "
                  />
                </div>
                <div class="filter-field filter-field--inline">
                  <label>二值化</label>
                  <el-switch
                    :model-value="config.imageFilter.binarize"
                    @update:model-value="
                      updateImageFilter('binarize', $event as boolean)
                    "
                  />
                </div>
                <div class="filter-field">
                  <label>二值阈值 {{ config.imageFilter.threshold }}</label>
                  <el-slider
                    :model-value="config.imageFilter.threshold"
                    :min="0"
                    :max="255"
                    :disabled="!config.imageFilter.binarize"
                    @update:model-value="
                      updateImageFilter('threshold', $event as number)
                    "
                  />
                </div>
              </el-collapse-item>
            </el-collapse>
          </div>
        </el-popover>
      </div>

      <!-- 采样频率 -->
      <div class="toolbar-item">
        <span class="toolbar-label">采样频率:</span>
        <el-slider
          :model-value="config.intervalMs"
          :min="200"
          :max="3000"
          :step="100"
          style="width: 100px"
          @update:model-value="setIntervalMs($event as number)"
        />
        <span class="toolbar-value"
          >{{ (config.intervalMs / 1000).toFixed(1) }}s</span
        >
      </div>

      <!-- 去重灵敏度 -->
      <div class="toolbar-item">
        <span class="toolbar-label">去重灵敏度:</span>
        <el-select
          :model-value="config.dedupSensitivity"
          size="small"
          style="width: 100px"
          @update:model-value="setDedupSensitivity($event as DedupSensitivity)"
        >
          <el-option label="高" value="high" />
          <el-option label="中" value="medium" />
          <el-option label="低" value="low" />
        </el-select>
      </div>
    </div>
  </div>
</template>

<style scoped>
.monitor-config {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  align-items: center;
}

.toolbar-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.toolbar-label {
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.toolbar-value {
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  color: var(--el-text-color-primary);
  min-width: 28px;
}

.engine-popover-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 0;
}

.popover-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.popover-field > label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-weight: 500;
}

.popover-hint {
  font-size: 11px;
  color: var(--el-color-warning);
  line-height: 1.4;
}

.filter-popover-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filter-popover-hint {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 11px;
  line-height: 1.45;
}

.filter-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 0;
}

.filter-field > label {
  color: var(--el-text-color-secondary);
  font-size: 11px;
}

.filter-field--inline {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}
</style>
