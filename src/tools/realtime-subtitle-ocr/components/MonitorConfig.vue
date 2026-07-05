<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<template>
  <div class="monitor-config">
    <!-- 区域选择 -->
    <div class="monitor-config__section">
      <div class="monitor-config__section-title">区域选择</div>
      <div class="monitor-config__row">
        <el-button
          type="primary"
          :disabled="isRunning"
          @click="$emit('open-monitor-box')"
        >
          <SquareDashedIcon :size="14" /> 打开监控框
        </el-button>
        <el-button :disabled="!monitorRect" @click="$emit('focus-monitor-box')">
          <CrosshairIcon :size="14" /> 聚焦监控框
        </el-button>
      </div>
      <div v-if="monitorRect" class="monitor-config__rect">
        当前区域：{{ monitorRect.width }}×{{ monitorRect.height }} @ ({{
          monitorRect.x
        }}, {{ monitorRect.y }})
      </div>
      <div v-else class="monitor-config__rect monitor-config__rect--empty">
        未打开监控框
      </div>
    </div>

    <!-- 监控设置 -->
    <div class="monitor-config__section">
      <div class="monitor-config__section-title">监控设置</div>

      <div class="monitor-config__field">
        <label>采样频率（{{ (intervalMs / 1000).toFixed(1) }}s）</label>
        <el-slider
          :model-value="intervalMs"
          :min="500"
          :max="3000"
          :step="100"
          :disabled="false"
          @update:model-value="$emit('update:intervalMs', $event as number)"
        />
      </div>

      <div class="monitor-config__field">
        <label>去重灵敏度</label>
        <el-select
          :model-value="dedupSensitivity"
          @update:model-value="
            $emit('update:dedupSensitivity', $event as DedupSensitivity)
          "
        >
          <el-option label="高（微小变化即触发）" value="high" />
          <el-option label="中（默认）" value="medium" />
          <el-option label="低（仅较大变化触发）" value="low" />
        </el-select>
      </div>

      <div class="monitor-config__field">
        <label>OCR 引擎</label>
        <el-select
          :model-value="engineType"
          @update:model-value="onEngineTypeChange"
        >
          <el-option label="Windows Native OCR" value="native" />
          <el-option label="Tesseract.js" value="tesseract" />
          <el-option label="VLM 多模态大模型" value="vlm" />
          <el-option label="云端 OCR" value="cloud" />
        </el-select>
      </div>

      <div v-if="engineType === 'cloud'" class="monitor-config__field">
        <label>云端 OCR 配置</label>
        <el-select
          :model-value="activeProfileId"
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
        <div v-if="!enabledProfiles.length" class="monitor-config__hint">
          请先在 Smart OCR 中配置并启用云端 OCR 配置
        </div>
      </div>
    </div>

    <!-- 控制按钮 -->
    <div class="monitor-config__section">
      <el-button
        size="large"
        :type="isRunning ? 'danger' : 'success'"
        class="monitor-config__run-btn"
        :disabled="!monitorRect && !isRunning"
        @click="$emit('toggle-monitor')"
      >
        <component :is="isRunning ? SquareIcon : PlayIcon" :size="18" />
        {{ isRunning ? "停止监控" : "开始监控" }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ElButton, ElSelect, ElOption, ElSlider } from "element-plus";
import {
  SquareDashedMousePointer as SquareDashedIcon,
  Crosshair,
  Play,
  Square,
} from "lucide-vue-next";
import { useOcrProfiles } from "@/tools/smart-ocr/platform";
import type { OcrEngineConfig } from "@/tools/smart-ocr/types";
import type { DedupSensitivity, MonitorRect } from "../types";

const props = defineProps<{
  monitorRect: MonitorRect | null;
  isRunning: boolean;
  intervalMs: number;
  dedupSensitivity: DedupSensitivity;
  engineConfig: OcrEngineConfig;
}>();

const emit = defineEmits<{
  (e: "open-monitor-box"): void;
  (e: "focus-monitor-box"): void;
  (e: "toggle-monitor"): void;
  (e: "update:intervalMs", v: number): void;
  (e: "update:dedupSensitivity", v: DedupSensitivity): void;
  (e: "update:engineConfig", v: OcrEngineConfig): void;
}>();

const CrosshairIcon = Crosshair;
const PlayIcon = Play;
const SquareIcon = Square;

const { enabledProfiles } = useOcrProfiles();

const engineType = computed(() => props.engineConfig.type);
const activeProfileId = computed(() =>
  props.engineConfig.type === "cloud" ? props.engineConfig.activeProfileId : ""
);

function onEngineTypeChange(type: string) {
  // 切换引擎时构造默认配置
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
  emit("update:engineConfig", next);
}

function onProfileChange(id: string) {
  if (props.engineConfig.type !== "cloud") return;
  emit("update:engineConfig", {
    ...props.engineConfig,
    activeProfileId: id,
  });
}
</script>

<style scoped>
.monitor-config {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 12px;
  height: 100%;
  overflow-y: auto;
}

.monitor-config__section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
}

.monitor-config__section-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.monitor-config__row {
  display: flex;
  gap: 8px;
}

.monitor-config__rect {
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.monitor-config__rect--empty {
  color: var(--el-text-color-secondary);
}

.monitor-config__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.monitor-config__field > label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.monitor-config__hint {
  font-size: 11px;
  color: var(--el-color-warning);
}

.monitor-config__run-btn {
  width: 100%;
  font-size: 16px;
  font-weight: 600;
}
</style>

