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

<template>
  <div class="format-toolbar">
    <div class="toolbar-left">
      <!-- 模式切换 -->
      <el-radio-group v-model="mode" size="default" class="mode-selector">
        <el-radio-button value="single">单文件转换</el-radio-button>
        <el-radio-button value="batch">批量转换</el-radio-button>
      </el-radio-group>

      <div class="divider"></div>

      <!-- 单文件格式选择 -->
      <template v-if="mode === 'single'">
        <div class="format-select-group">
          <span class="label">源格式:</span>
          <el-select v-model="singleFrom" size="default" style="width: 110px">
            <el-option label="JSON" value="json" />
            <el-option label="YAML" value="yaml" />
            <el-option label="TOML" value="toml" />
            <el-option label="INI" value="ini" />
            <el-option label="XML" value="xml" />
            <el-option label="Properties/.env" value="env" />
          </el-select>

          <ArrowRight :size="16" class="arrow-icon" />

          <span class="label">目标格式:</span>
          <el-select v-model="singleTo" size="default" style="width: 110px">
            <el-option
              label="JSON"
              value="json"
              :disabled="singleFrom === 'json'"
            />
            <el-option
              label="YAML"
              value="yaml"
              :disabled="singleFrom === 'yaml'"
            />
            <el-option
              label="TOML"
              value="toml"
              :disabled="singleFrom === 'toml'"
            />
            <el-option
              label="INI"
              value="ini"
              :disabled="singleFrom === 'ini'"
            />
            <el-option
              label="XML"
              value="xml"
              :disabled="singleFrom === 'xml'"
            />
            <el-option
              label="Properties/.env"
              value="env"
              :disabled="singleFrom === 'env'"
            />
          </el-select>
        </div>
      </template>

      <!-- 批量格式选择 -->
      <template v-else>
        <div class="format-select-group">
          <span class="label">目标格式:</span>
          <el-select v-model="batchTo" size="default" style="width: 110px">
            <el-option label="JSON" value="json" />
            <el-option label="YAML" value="yaml" />
            <el-option label="TOML" value="toml" />
            <el-option label="INI" value="ini" />
            <el-option label="XML" value="xml" />
            <el-option label="Properties/.env" value="env" />
          </el-select>
        </div>
      </template>

      <!-- 高级选项配置 -->
      <el-popover placement="bottom" :width="320" trigger="click">
        <template #reference>
          <el-button size="default" :icon="Settings" class="options-btn"
            >高级选项</el-button
          >
        </template>
        <div class="advanced-options">
          <h4 class="options-title">格式化选项</h4>

          <div class="option-item">
            <span class="option-label">JSON 缩进:</span>
            <el-input-number
              v-model="currentOptions.jsonIndent"
              :min="1"
              :max="8"
              size="small"
              style="width: 100px"
            />
          </div>

          <div class="option-item">
            <span class="option-label">YAML 缩进:</span>
            <el-input-number
              v-model="currentOptions.yamlIndent"
              :min="2"
              :max="8"
              :step="2"
              size="small"
              style="width: 100px"
            />
          </div>

          <div class="option-item">
            <span class="option-label">INI 展平分隔符:</span>
            <el-input
              v-model="currentOptions.iniDelimiter"
              size="small"
              style="width: 100px"
              placeholder="."
            />
          </div>

          <div class="option-item">
            <span class="option-label">XML 根节点名:</span>
            <el-input
              v-model="currentOptions.xmlRootName"
              size="small"
              style="width: 100px"
              placeholder="root"
            />
          </div>

          <div class="option-item">
            <span class="option-label">XML 格式化输出:</span>
            <el-switch v-model="currentOptions.xmlFormat" size="small" />
          </div>
        </div>
      </el-popover>
    </div>

    <div class="toolbar-right">
      <!-- 批量模式下的输出配置 -->
      <template v-if="mode === 'batch'">
        <div class="batch-config">
          <span class="label">扫描深度:</span>
          <el-select v-model="scanMaxDepth" size="default" style="width: 100px">
            <el-option label="仅当前层" :value="1" />
            <el-option label="递归全部" :value="0" />
            <el-option label="深度 2" :value="2" />
            <el-option label="深度 3" :value="3" />
          </el-select>

          <el-checkbox
            v-model="scanShowHidden"
            label="包含隐藏文件"
            size="default"
          />

          <div class="divider"></div>

          <span class="label">输出方式:</span>
          <el-radio-group v-model="outputMode" size="default">
            <el-radio-button value="preview">仅预览</el-radio-button>
            <el-radio-button value="inplace">原地生成</el-radio-button>
            <el-radio-button value="directory">指定目录</el-radio-button>
          </el-radio-group>

          <template v-if="outputMode === 'directory'">
            <el-input
              :model-value="outputDirectory"
              placeholder="选择输出目录..."
              size="default"
              readonly
              style="width: 180px"
              @click="selectOutputDirectory"
            >
              <template #append>
                <el-button :icon="FolderOpen" @click="selectOutputDirectory" />
              </template>
            </el-input>
          </template>

          <el-button
            type="primary"
            size="default"
            :loading="isConverting"
            :icon="Play"
            @click="emit('convert')"
          >
            开始转换
          </el-button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ArrowRight, Settings, FolderOpen, Play } from "lucide-vue-next";
import type { ConfigFormat, ConvertOptions, ScanOptions } from "../types";

const mode = defineModel<"single" | "batch">("mode", { required: true });

const props = defineProps<{
  singleFrom: ConfigFormat;
  singleTo: ConfigFormat;
  batchTo: ConfigFormat;
  singleOptions: ConvertOptions;
  batchOptions: ConvertOptions;
  scanOptions: ScanOptions;
  outputMode: "preview" | "inplace" | "directory";
  outputDirectory: string;
  isConverting: boolean;
}>();

const emit = defineEmits<{
  (e: "update:singleFrom", value: ConfigFormat): void;
  (e: "update:singleTo", value: ConfigFormat): void;
  (e: "update:batchTo", value: ConfigFormat): void;
  (e: "update:outputMode", value: "preview" | "inplace" | "directory"): void;
  (e: "update:scanOptions", value: ScanOptions): void;
  (e: "selectDirectory"): void;
  (e: "convert"): void;
}>();

// 统一处理高级选项的双向绑定
const currentOptions = computed({
  get: () =>
    mode.value === "single" ? props.singleOptions : props.batchOptions,
  set: () => {
    // 实际上 computed 内部属性是响应式的，直接修改即可
  },
});

const singleFrom = computed({
  get: () => props.singleFrom,
  set: (val) => emit("update:singleFrom", val),
});

const singleTo = computed({
  get: () => props.singleTo,
  set: (val) => emit("update:singleTo", val),
});

const batchTo = computed({
  get: () => props.batchTo,
  set: (val) => emit("update:batchTo", val),
});

const outputMode = computed({
  get: () => props.outputMode,
  set: (val) => emit("update:outputMode", val),
});

const scanMaxDepth = computed({
  get: () => props.scanOptions.maxDepth,
  set: (val) =>
    emit("update:scanOptions", { ...props.scanOptions, maxDepth: val }),
});

const scanShowHidden = computed({
  get: () => props.scanOptions.showHidden,
  set: (val) =>
    emit("update:scanOptions", { ...props.scanOptions, showHidden: val }),
});

const selectOutputDirectory = () => {
  emit("selectDirectory");
};
</script>

<style scoped>
.format-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background-color: var(--card-bg);
  border-radius: 12px;
  border-bottom: 1px solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
  flex-shrink: 0;
  gap: 16px;
  flex-wrap: wrap;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.divider {
  width: 1px;
  height: 20px;
  background-color: var(--border-color);
  margin: 0 4px;
}

.format-select-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.label {
  font-size: 13px;
  color: var(--text-color-light);
  white-space: nowrap;
}

.arrow-icon {
  color: var(--text-color-light);
  margin: 0 4px;
}

.options-btn {
  display: flex;
  align-items: center;
  gap: 4px;
}

.advanced-options {
  padding: 4px;
}

.options-title {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
  border-bottom: 1px solid var(--border-color-light);
  padding-bottom: 8px;
}

.option-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.option-label {
  font-size: 12px;
  color: var(--text-color-light);
}

.batch-config {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

:deep(.el-input-group__append) {
  padding: 0 12px;
  background-color: var(--border-color-light);
  border-left: 1px solid var(--border-color);
}

:deep(.el-input-group__append button) {
  border: none;
  margin: 0;
  padding: 0;
  background: transparent;
}
</style>
