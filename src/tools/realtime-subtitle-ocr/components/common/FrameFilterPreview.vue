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
      <button
        type="button"
        class="frame-preview__toggle"
        data-testid="rsocr-preview-toggle"
        :title="collapsed ? '展开区域预览' : '折叠区域预览'"
        :aria-expanded="!collapsed"
        @click="toggleCollapsed"
      >
        <ChevronDown v-if="!collapsed" :size="14" />
        <ChevronRight v-else :size="14" />
        <span class="frame-preview__title">区域截图 · 滤镜预览</span>
      </button>
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

    <div v-show="!collapsed" class="frame-preview__content">
      <div
        v-if="originalUrl"
        class="frame-preview__body"
        :class="{ 'frame-preview__body--stacked': shouldStackComparison }"
      >
        <figure class="frame-preview__pane">
          <figcaption>原图</figcaption>
          <img
            :src="originalUrl"
            alt="区域原图"
            @load="updateImageAspect"
            @click="view(originalUrl)"
          />
        </figure>
        <figure class="frame-preview__pane">
          <figcaption>处理后</figcaption>
          <img
            v-if="filteredUrl"
            :src="filteredUrl"
            alt="区域滤镜结果"
            @load="updateImageAspect"
            @click="view(filteredUrl)"
          />
          <div v-else class="frame-preview__passthrough">未启用滤镜</div>
        </figure>
      </div>
      <div v-else class="frame-preview__empty">
        {{ hint || "点击「截图预览」抓取当前识别区域，实时查看滤镜效果" }}
      </div>

      <div v-if="recognizedText !== null" class="frame-preview__result">
        <div class="frame-preview__result-main">
          <span class="frame-preview__result-label">识别结果</span>
          <span class="frame-preview__result-text">{{
            recognizedText || "(空)"
          }}</span>
        </div>
        <div
          v-if="showApplyActions && hasUsableText"
          class="frame-preview__result-actions"
        >
          <el-button
            size="small"
            data-testid="rsocr-preview-apply"
            :disabled="!canApply"
            @click="$emit('apply-text', recognizedText as string)"
          >
            填入当前字幕
          </el-button>
          <el-button
            size="small"
            type="primary"
            data-testid="rsocr-preview-insert"
            @click="$emit('insert-text', recognizedText as string)"
          >
            在播放头新增
          </el-button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useLocalStorage } from "@vueuse/core";
import { ElButton } from "element-plus";
import { Camera, ChevronDown, ChevronRight, ScanText } from "lucide-vue-next";
import { useImageViewer } from "@/composables/useImageViewer";

/** 区域预览是否折叠；常驻持久化，避免每次进入都占满高度。 */
const collapsed = useLocalStorage("rsocr:region-preview-collapsed", false);

function toggleCollapsed() {
  collapsed.value = !collapsed.value;
}

const props = defineProps<{
  originalUrl: string;
  filteredUrl: string;
  recognizedText: string | null;
  capturing?: boolean;
  recognizing?: boolean;
  disabled?: boolean;
  hint?: string;
  /** 是否显示“填入当前字幕 / 新增字幕”操作 */
  showApplyActions?: boolean;
  /** 当前是否存在可填入的字幕 */
  canApply?: boolean;
}>();

defineEmits<{
  capture: [];
  recognize: [];
  "apply-text": [text: string];
  "insert-text": [text: string];
}>();

const hasUsableText = computed(() => {
  const text = props.recognizedText?.trim() ?? "";
  return text.length > 0 && text !== "[识别失败]";
});

// 超宽截图（例如字幕条）横向并排后每张图都会被压得过窄，自动改为上下排列。
const imageAspectRatio = ref<number | null>(null);
const shouldStackComparison = computed(
  () => (imageAspectRatio.value ?? 0) >= 3
);

function updateImageAspect(event: Event) {
  const image = event.currentTarget as HTMLImageElement;
  if (image.naturalWidth > 0 && image.naturalHeight > 0) {
    imageAspectRatio.value = image.naturalWidth / image.naturalHeight;
  }
}

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
.frame-preview__toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: 2px 4px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
}
.frame-preview__toggle:hover {
  background: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
}
.frame-preview__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.frame-preview__content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
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
.frame-preview__body--stacked {
  grid-template-columns: 1fr;
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
.frame-preview__body--stacked .frame-preview__pane img {
  max-height: 160px;
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
  flex-direction: column;
  gap: 6px;
  padding-top: 6px;
  border-top: 1px dashed var(--border-color);
  font-size: 12px;
}
.frame-preview__result-main {
  display: flex;
  gap: 8px;
  align-items: baseline;
}
.frame-preview__result-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
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
