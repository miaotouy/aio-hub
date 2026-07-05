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
} from "element-plus";
import { Settings as SettingsIcon } from "lucide-vue-next";
import { useScreenMonitor } from "../composables/useScreenMonitor";
import { useOcrProfiles } from "@/tools/smart-ocr/platform";
import type { OcrEngineConfig } from "@/tools/smart-ocr/types";
import type { DedupSensitivity } from "../types";

const { config, setIntervalMs, setDedupSensitivity, setEngineConfig } =
  useScreenMonitor();

const { enabledProfiles } = useOcrProfiles();

const engineType = computed(() => config.value.engineConfig.type);
const activeProfileId = computed(() =>
  config.value.engineConfig.type === "cloud"
    ? config.value.engineConfig.activeProfileId
    : ""
);

function onEngineTypeChange(type: string) {
  let next: OcrEngineConfig;
  switch (type) {
    case "native":
      next = { type: "native", name: "native" };
      break;
    case "tesseract":
      next = { type: "tesseract", name: "tesseract", language: "chi_sim+eng" };
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
  setEngineConfig(next);
}

function onProfileChange(id: string) {
  if (config.value.engineConfig.type !== "cloud") return;
  setEngineConfig({
    ...config.value.engineConfig,
    activeProfileId: id,
  });
}
</script>

<template>
  <div class="monitor-config">
    <!-- 采样频率 -->
    <div class="toolbar-item">
      <span class="toolbar-label">采样频率:</span>
      <el-slider
        :model-value="config.intervalMs"
        :min="500"
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

    <!-- OCR 引擎 -->
    <div class="toolbar-item">
      <span class="toolbar-label">OCR 引擎:</span>
      <el-select
        :model-value="engineType"
        size="small"
        style="width: 150px"
        @update:model-value="onEngineTypeChange"
      >
        <el-option label="Windows Native OCR" value="native" />
        <el-option label="Tesseract.js" value="tesseract" />
        <el-option label="VLM 多模态大模型" value="vlm" />
        <el-option label="云端 OCR" value="cloud" />
      </el-select>

      <!-- 引擎额外配置气泡 -->
      <el-popover
        v-if="engineType === 'cloud' || engineType === 'tesseract'"
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
        </div>
      </el-popover>
    </div>
  </div>
</template>

<style scoped>
.monitor-config {
  display: flex;
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
</style>
