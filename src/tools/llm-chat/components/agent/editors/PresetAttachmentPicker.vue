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
  <div class="editor-row attachments-row">
    <span class="field-label">附件</span>
    <div class="attachments-area">
      <div v-if="modelValue?.length" class="attachment-list">
        <div
          v-for="(ref, idx) in modelValue"
          :key="ref.assetId"
          class="attachment-item"
          :class="{
            'has-thumbnail': getAssetFileType(ref.assetId) === 'image',
          }"
        >
          <!-- 图片类型：显示缩略图 -->
          <template v-if="getAssetFileType(ref.assetId) === 'image'">
            <div
              class="attachment-thumbnail"
              @click="handlePreviewImage(ref.assetId)"
              :title="'点击预览: ' + getAssetDisplayName(ref.assetId)"
            >
              <img
                :src="getAssetResolvedUrl(ref.assetId)"
                :alt="getAssetDisplayName(ref.assetId)"
                class="thumbnail-img"
                loading="lazy"
              />
              <div class="thumbnail-overlay">
                <Eye :size="14" />
              </div>
            </div>
          </template>
          <!-- 非图片类型：显示文件图标 -->
          <template v-else>
            <FileIcon
              :fileName="getAssetFilename(ref.assetId)"
              :fileType="getAssetFileType(ref.assetId)"
              :size="16"
              class="attachment-file-icon"
            />
          </template>
          <span class="attachment-name" :title="getAssetTooltip(ref.assetId)">
            {{ getAssetDisplayName(ref.assetId) }}
          </span>
          <span
            v-if="
              getAssetFilename(ref.assetId) !== getAssetDisplayName(ref.assetId)
            "
            class="attachment-filename-hint"
            :title="getAssetFilename(ref.assetId)"
          >
            {{ getAssetFilename(ref.assetId) }}
          </span>
          <!-- 视频/音频预览按钮 -->
          <el-button
            v-if="getAssetFileType(ref.assetId) === 'video'"
            link
            size="small"
            type="primary"
            @click="handlePreviewVideo(ref.assetId)"
            title="预览视频"
          >
            <el-icon><Play :size="14" /></el-icon>
          </el-button>
          <el-button
            v-if="getAssetFileType(ref.assetId) === 'audio'"
            link
            size="small"
            type="primary"
            @click="handlePreviewAudio(ref.assetId)"
            :title="playingAudioId === ref.assetId ? '停止播放' : '试听'"
          >
            <el-icon>
              <Square v-if="playingAudioId === ref.assetId" :size="14" />
              <Play v-else :size="14" />
            </el-icon>
          </el-button>
          <el-button
            link
            size="small"
            type="danger"
            @click="removeAttachment(idx)"
            title="移除"
          >
            <el-icon><Close /></el-icon>
          </el-button>
        </div>
      </div>
      <el-popover
        v-model:visible="assetSelectorVisible"
        placement="bottom-start"
        :width="360"
        trigger="click"
      >
        <template #reference>
          <el-button size="small" plain>
            <el-icon style="margin-right: 4px"
              ><Paperclip :size="14"
            /></el-icon>
            从 Agent 资产选择
          </el-button>
        </template>
        <div class="asset-selector-popover">
          <el-input
            v-model="assetSearchQuery"
            placeholder="搜索资产..."
            size="small"
            clearable
            style="margin-bottom: 8px"
          />
          <div class="asset-selector-list">
            <div
              v-for="asset in filteredAssets"
              :key="asset.id"
              class="asset-selector-item"
              :class="{ 'is-selected': isAssetSelected(asset.id) }"
              @click="toggleAsset(asset)"
            >
              <FileIcon
                :fileName="asset.filename"
                :fileType="mapAgentAssetFileType(asset.type)"
                :size="20"
                class="asset-type-file-icon"
              />
              <div class="asset-info">
                <span class="asset-handle">{{ asset.id }}</span>
                <span class="asset-filename">{{ asset.filename }}</span>
              </div>
              <el-icon v-if="isAssetSelected(asset.id)" class="asset-check">
                <Check />
              </el-icon>
            </div>
            <div v-if="filteredAssets.length === 0" class="asset-empty">
              无匹配资产
            </div>
          </div>
        </div>
      </el-popover>
      <span v-if="modelValue?.length" class="attachment-count">
        {{ modelValue.length }} 个附件
      </span>
    </div>
  </div>

  <!-- 视频预览器 -->
  <VideoViewer
    v-model:visible="videoPreviewVisible"
    :src="videoPreviewSrc"
    :title="videoPreviewTitle"
  />
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from "vue";
import type { PresetAttachmentRef } from "../../../types";
import type { AgentAsset } from "../../../types/agent";
import { Close, Check } from "@element-plus/icons-vue";
import { Eye, Play, Square, Paperclip } from "lucide-vue-next";
import FileIcon from "@/components/common/FileIcon.vue";
import VideoViewer from "@/components/common/VideoViewer.vue";
import { convertAgentAssetToUrl } from "../../../utils/agentAssetUtils";
import { useImageViewer } from "@/composables/useImageViewer";

interface Props {
  /** 已选附件列表 (v-model) */
  modelValue?: PresetAttachmentRef[];
  /** Agent 可用资产列表 */
  availableAssets: AgentAsset[];
  /** Agent ID，用于解析资产 URL */
  agentId?: string;
}

interface Emits {
  (e: "update:modelValue", value: PresetAttachmentRef[]): void;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: () => [],
});
const emit = defineEmits<Emits>();

const imageViewer = useImageViewer();

// ============================================================================
// 资产选择器
// ============================================================================

const assetSelectorVisible = ref(false);
const assetSearchQuery = ref("");

/** 按搜索词过滤的资产 */
const filteredAssets = computed(() => {
  const q = assetSearchQuery.value.toLowerCase();
  if (!q) return props.availableAssets;
  return props.availableAssets.filter(
    (a) =>
      a.id.toLowerCase().includes(q) ||
      a.filename.toLowerCase().includes(q) ||
      a.description?.toLowerCase().includes(q)
  );
});

/** 将 AgentAsset.type 映射为 FileIcon 可识别的 fileType */
function mapAgentAssetFileType(
  type: string
): "image" | "video" | "audio" | "document" {
  switch (type) {
    case "image":
      return "image";
    case "audio":
      return "audio";
    case "video":
      return "video";
    default:
      return "document";
  }
}

function getAssetFilename(assetId: string): string {
  const asset = props.availableAssets.find((a) => a.id === assetId);
  return asset?.filename || assetId;
}

function getAssetFileType(
  assetId: string
): "image" | "video" | "audio" | "document" {
  const asset = props.availableAssets.find((a) => a.id === assetId);
  return asset ? mapAgentAssetFileType(asset.type) : "document";
}

/** 附件标签主显示名：优先 description，其次 handle (id) */
function getAssetDisplayName(assetId: string): string {
  const asset = props.availableAssets.find((a) => a.id === assetId);
  if (!asset) return assetId;
  return asset.description || asset.id;
}

/** 附件 tooltip：显示完整信息 */
function getAssetTooltip(assetId: string): string {
  const asset = props.availableAssets.find((a) => a.id === assetId);
  if (!asset) return assetId;
  const parts = [`Handle: ${asset.id}`, `文件: ${asset.filename}`];
  if (asset.description) parts.push(`描述: ${asset.description}`);
  if (asset.mimeType) parts.push(`类型: ${asset.mimeType}`);
  return parts.join("\n");
}

function isAssetSelected(assetId: string): boolean {
  return !!props.modelValue?.some((r) => r.assetId === assetId);
}

function toggleAsset(asset: AgentAsset) {
  const current = props.modelValue ? [...props.modelValue] : [];
  const idx = current.findIndex((r) => r.assetId === asset.id);
  if (idx >= 0) {
    current.splice(idx, 1);
  } else {
    current.push({ assetId: asset.id });
  }
  emit("update:modelValue", current);
}

function removeAttachment(index: number) {
  const current = props.modelValue ? [...props.modelValue] : [];
  current.splice(index, 1);
  emit("update:modelValue", current);
}

/** 重置搜索状态（供父组件在对话框打开时调用） */
function resetSearch() {
  assetSearchQuery.value = "";
}

// ============================================================================
// 附件预览
// ============================================================================

/** 获取资产的实际可访问 URL */
function getAssetResolvedUrl(assetId: string): string {
  const asset = props.availableAssets.find((a) => a.id === assetId);
  if (!asset) return "";
  if (!props.agentId) return "";
  return convertAgentAssetToUrl(props.agentId, asset.path) || "";
}

/** 获取所有图片附件的 URL 列表（用于 ImageViewer 列表浏览） */
const imageAttachmentUrls = computed(() => {
  if (!props.modelValue?.length) return [];
  return props.modelValue
    .filter((ref) => getAssetFileType(ref.assetId) === "image")
    .map((ref) => getAssetResolvedUrl(ref.assetId))
    .filter(Boolean);
});

/** 获取所有图片附件的 assetId 列表（与 URL 列表一一对应） */
const imageAttachmentIds = computed(() => {
  if (!props.modelValue?.length) return [];
  return props.modelValue
    .filter((ref) => getAssetFileType(ref.assetId) === "image")
    .map((ref) => ref.assetId);
});

/** 点击图片缩略图：打开 ImageViewer */
function handlePreviewImage(assetId: string) {
  const urls = imageAttachmentUrls.value;
  if (urls.length === 0) return;
  const idx = imageAttachmentIds.value.indexOf(assetId);
  imageViewer.show(urls, Math.max(0, idx));
}

// 视频预览状态
const videoPreviewVisible = ref(false);
const videoPreviewSrc = ref("");
const videoPreviewTitle = ref("");

/** 点击视频预览按钮 */
function handlePreviewVideo(assetId: string) {
  const url = getAssetResolvedUrl(assetId);
  if (!url) return;
  videoPreviewSrc.value = url;
  videoPreviewTitle.value = getAssetDisplayName(assetId);
  videoPreviewVisible.value = true;
}

// 音频预览状态
const playingAudioId = ref<string | null>(null);
let currentAudioEl: HTMLAudioElement | null = null;

/** 点击音频试听按钮 */
function handlePreviewAudio(assetId: string) {
  // 如果正在播放同一个，停止
  if (playingAudioId.value === assetId) {
    stopAudio();
    return;
  }
  // 停止之前的
  stopAudio();

  const url = getAssetResolvedUrl(assetId);
  if (!url) return;

  currentAudioEl = new Audio(url);
  currentAudioEl.volume = 0.5;
  currentAudioEl.addEventListener("ended", stopAudio);
  currentAudioEl.addEventListener("error", stopAudio);
  currentAudioEl.play();
  playingAudioId.value = assetId;
}

function stopAudio() {
  if (currentAudioEl) {
    currentAudioEl.pause();
    currentAudioEl.removeEventListener("ended", stopAudio);
    currentAudioEl.removeEventListener("error", stopAudio);
    currentAudioEl = null;
  }
  playingAudioId.value = null;
}

// 组件卸载时清理音频
onBeforeUnmount(() => {
  stopAudio();
});

defineExpose({ resetSearch });
</script>

<style scoped>
/* 附件区域 */
.editor-row {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.field-label {
  width: 60px;
  font-weight: 500;
  color: var(--el-text-color-regular);
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.attachments-row {
  align-items: flex-start;
}

.attachments-area {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.attachment-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.attachment-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  font-size: 13px;
}

.attachment-item.has-thumbnail {
  padding: 3px 8px 3px 3px;
}

.attachment-file-icon {
  flex-shrink: 0;
}

/* 缩略图预览 */
.attachment-thumbnail {
  position: relative;
  width: 32px;
  height: 32px;
  border-radius: 3px;
  overflow: hidden;
  cursor: pointer;
  flex-shrink: 0;
  background: var(--el-fill-color-lighter);
}

.attachment-thumbnail .thumbnail-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: filter 0.15s;
}

.attachment-thumbnail .thumbnail-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  color: white;
  opacity: 0;
  transition: opacity 0.15s;
}

.attachment-thumbnail:hover .thumbnail-img {
  filter: brightness(0.7);
}

.attachment-thumbnail:hover .thumbnail-overlay {
  opacity: 1;
}

.attachment-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-text-color-primary);
  font-weight: 500;
}

.attachment-filename-hint {
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.attachment-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* 资产选择器弹出层 */
.asset-selector-popover {
  display: flex;
  flex-direction: column;
}

.asset-selector-list {
  max-height: 280px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.asset-selector-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.asset-selector-item:hover {
  background-color: var(--el-fill-color-light);
}

.asset-selector-item.is-selected {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.1)
  );
}

.asset-type-file-icon {
  flex-shrink: 0;
}

.asset-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.asset-handle {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.asset-filename {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-check {
  color: var(--el-color-primary);
  flex-shrink: 0;
}

.asset-empty {
  padding: 16px;
  text-align: center;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
