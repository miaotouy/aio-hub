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
  <section class="frame-preview">
    <div class="frame-preview__header">
      <span class="frame-preview__title">区域截图 · 滤镜预览</span>
      <div class="frame-preview__actions">
        <el-button
          size="small"
          data-testid="rsocr-preview-capture"
          :loading="capturing"
          :disabled="disabled"
          @click="$emit('capture')"
        >
          <Camera :size="14" class="btn-icon" /> 截图预览
        </el-button>
        <el-button
          size="small"
          type="primary"
          data-testid="rsocr-preview-recognize"
          :loading="recognizing"
          :disabled="disabled || !originalUrl"
          @click="$emit('recognize')"
        >
          <ScanText :size="14" class="btn-icon" /> 试识别
        </el-button>
      </div>
    </div>

    <div v-if="originalUrl" class="frame-preview__body">
      <figure class="frame-preview__pane">
        <figcaption>原图</figcaption>
        <img :src="originalUrl" alt="区域原图" @click="view(originalUrl)" />
      </figure>
      <figure class="frame-preview__pane">
        <figcaption>处理后</figcaption>
        <img
          v-if="filteredUrl"
          :src="filteredUrl"
          alt="区域滤镜结果"
          @click="view(filteredUrl)"
        />
        <div v-else class="frame-preview__passthrough">未启用滤镜</div>
      </figure>
    </div>
    <div v-else class="frame-preview__empty">
      {{ hint || "点击「截图预览」抓取当前识别区域，实时查看滤镜效果" }}
    </div>

    <div v-if="recognizedText !== null" class="frame-preview__result">
      <span class="frame-preview__result-label">识别结果</span>
      <span class="frame-preview__result-text">{{
        recognizedText || "(空)"
      }}</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ElButton } from "element-plus";
import { Camera, ScanText } from "lucide-vue-next";
import { useImageViewer } from "@/composables/useImageViewer";

defineProps<{
  originalUrl: string;
  filteredUrl: string;
  recognizedText: string | null;
  capturing?: boolean;
  recognizing?: boolean;
  disabled?: boolean;
  hint?: string;
}>();

defineEmits<{
  capture: [];
  recognize: [];
}>();

const imageViewer = useImageViewer();
function view(url: string) {
  imageViewer.show(url);
}
</script>

<style scoped>
.frame-preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
}
.frame-preview__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.frame-preview__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.frame-preview__actions {
  display: flex;
  gap: 6px;
}
.btn-icon {
  margin-right: 4px;
}
.frame-preview__body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.frame-preview__pane {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.frame-preview__pane figcaption {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.frame-preview__pane img {
  width: 100%;
  max-height: 120px;
  object-fit: contain;
  background: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  cursor: zoom-in;
}
.frame-preview__passthrough {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 80px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  background: var(--input-bg);
  border: var(--border-width) dashed var(--border-color);
  border-radius: 4px;
}
.frame-preview__empty {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
  padding: 8px 0;
}
.frame-preview__result {
  display: flex;
  gap: 8px;
  align-items: baseline;
  padding-top: 6px;
  border-top: 1px dashed var(--border-color);
  font-size: 12px;
}
.frame-preview__result-label {
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.frame-preview__result-text {
  color: var(--el-text-color-primary);
  word-break: break-all;
  white-space: pre-wrap;
}
</style>
