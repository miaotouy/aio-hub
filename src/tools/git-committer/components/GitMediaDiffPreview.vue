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
  <section
    class="git-media-diff-preview"
    :class="{ compact, 'has-media': hasMedia }"
  >
    <template v-if="hasMedia">
      <div class="preview-grid">
        <article
          v-for="item in mediaSides"
          :key="item.key"
          class="preview-side"
        >
          <header class="preview-side-header">
            <span>{{ item.label }}</span>
            <span class="preview-size">{{
              formatFileSize(item.side.byteSize)
            }}</span>
          </header>

          <div v-if="item.url" class="preview-content">
            <button
              v-if="item.side.previewKind === 'image'"
              class="image-preview-button"
              :title="`查看 ${item.label}`"
              @click="showImage(item.url)"
            >
              <img
                :src="item.url"
                :alt="`${item.label}：${item.side.path}`"
                @error="setMediaError(item.key, '图片载入失败')"
              />
            </button>
            <AudioPlayer
              v-else-if="item.side.previewKind === 'audio'"
              :src="item.url"
              :title="item.side.path"
              layout="compact"
              :show-waveform="false"
            />
            <VideoPlayer
              v-else-if="item.side.previewKind === 'video'"
              :src="item.url"
              :title="item.side.path"
              :global-hotkey="false"
            />
          </div>

          <div v-else class="preview-unavailable">
            <span v-if="loading">正在加载预览…</span>
            <template v-else>
              <span>{{ item.error || unavailableMessage(item.side) }}</span>
              <el-button
                v-if="item.side.localPath"
                size="small"
                text
                @click="openWithSystem(item.side.localPath)"
              >
                使用系统应用打开
              </el-button>
            </template>
          </div>
        </article>
      </div>
    </template>

    <div v-else class="binary-fallback">
      <FileWarning :size="compact ? 20 : 40" class="text-placeholder" />
      <div class="binary-copy">
        <strong v-if="!compact">暂不支持预览此文件</strong>
        <span>{{ fallbackDescription }}</span>
      </div>
      <el-button
        v-if="openableLocalPath"
        size="small"
        text
        @click="openWithSystem(openableLocalPath)"
      >
        使用系统应用打开
      </el-button>
    </div>

    <div v-if="$slots.actions" class="preview-actions">
      <slot name="actions" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { FileWarning } from "lucide-vue-next";
import { ElButton } from "element-plus";
import AudioPlayer from "@/components/common/AudioPlayer.vue";
import VideoPlayer from "@/components/common/VideoPlayer.vue";
import { useImageViewer } from "@/composables/useImageViewer";
import { customMessage } from "@/utils/customMessage";
import type { DiffTab, GitDiffSide } from "../types";

interface PreviewSide {
  key: "original" | "modified";
  label: string;
  side: GitDiffSide;
  url: string;
  error: string;
}

const props = withDefaults(
  defineProps<{
    repoPath: string;
    diff: DiffTab;
    compact?: boolean;
  }>(),
  { compact: false }
);

const { show: showImage } = useImageViewer();
const loading = ref(false);
const originalUrl = ref("");
const modifiedUrl = ref("");
const originalError = ref("");
const modifiedError = ref("");
let requestVersion = 0;
const ownedBlobUrls = new Set<string>();

const isMedia = (side?: GitDiffSide) =>
  !!side && ["image", "audio", "video"].includes(side.previewKind);

const hasMedia = computed(
  () => isMedia(props.diff.originalSide) || isMedia(props.diff.modifiedSide)
);

const originalLabel = computed(() => {
  if (props.diff.commitHash) return "父提交版本";
  return props.diff.isStaged ? "HEAD 版本" : "暂存版本";
});

const modifiedLabel = computed(() => {
  if (props.diff.commitHash) return "本次提交版本";
  return props.diff.isStaged ? "暂存版本" : "工作区版本";
});

const mediaSides = computed<PreviewSide[]>(() => {
  const candidates: Array<{
    key: PreviewSide["key"];
    label: string;
    side?: GitDiffSide;
    url: string;
    error: string;
  }> = [
    {
      key: "original",
      label: originalLabel.value,
      side: props.diff.originalSide,
      url: originalUrl.value,
      error: originalError.value,
    },
    {
      key: "modified",
      label: modifiedLabel.value,
      side: props.diff.modifiedSide,
      url: modifiedUrl.value,
      error: modifiedError.value,
    },
  ];
  return candidates.filter(
    (candidate): candidate is PreviewSide =>
      !!candidate.side && candidate.side.exists && isMedia(candidate.side)
  );
});

const openableLocalPath = computed(
  () =>
    props.diff.modifiedSide?.localPath ||
    props.diff.originalSide?.localPath ||
    ""
);

const fallbackDescription = computed(() => {
  const side = props.diff.modifiedSide?.exists
    ? props.diff.modifiedSide
    : props.diff.originalSide;
  if (!side?.exists) return "该文件版本已不存在";
  return `${side.mimeType || "二进制文件"} · ${formatFileSize(side.byteSize)}`;
});

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB"];
  let value = size / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function unavailableMessage(side: GitDiffSide): string {
  if (!side.snapshotAvailable) {
    return `该版本为 ${formatFileSize(side.byteSize)}，超过 64 MB 的应用内快照预览上限`;
  }
  return "预览暂时无法载入";
}

function setMediaError(key: PreviewSide["key"], message: string) {
  if (key === "original") originalError.value = message;
  else modifiedError.value = message;
}

function revokeOwnedUrls() {
  for (const url of ownedBlobUrls) URL.revokeObjectURL(url);
  ownedBlobUrls.clear();
}

async function loadSide(
  side: GitDiffSide | undefined,
  key: PreviewSide["key"],
  version: number
): Promise<string> {
  if (!side?.exists || !isMedia(side)) return "";
  if (side.localPath) return convertFileSrc(side.localPath);
  if (!side.snapshotAvailable) return "";

  const buffer = await invoke<ArrayBuffer>("git_read_file_preview_binary", {
    path: props.repoPath,
    filePath: props.diff.path,
    isStaged: props.diff.isStaged,
    commitHash: props.diff.commitHash,
    side: key,
  });
  if (version !== requestVersion) return "";

  const url = URL.createObjectURL(new Blob([buffer], { type: side.mimeType }));
  ownedBlobUrls.add(url);
  return url;
}

async function loadPreview() {
  const version = ++requestVersion;
  revokeOwnedUrls();
  originalUrl.value = "";
  modifiedUrl.value = "";
  originalError.value = "";
  modifiedError.value = "";
  if (!hasMedia.value) {
    loading.value = false;
    return;
  }

  loading.value = true;
  const [original, modified] = await Promise.allSettled([
    loadSide(props.diff.originalSide, "original", version),
    loadSide(props.diff.modifiedSide, "modified", version),
  ]);
  if (version !== requestVersion) return;

  if (original.status === "fulfilled") originalUrl.value = original.value;
  else originalError.value = "读取该版本失败";
  if (modified.status === "fulfilled") modifiedUrl.value = modified.value;
  else modifiedError.value = "读取该版本失败";
  loading.value = false;
}

async function openWithSystem(path: string) {
  try {
    await openPath(path);
  } catch {
    customMessage.error("无法使用系统应用打开文件");
  }
}

watch(
  () => [props.repoPath, props.diff] as const,
  () => void loadPreview(),
  { immediate: true }
);

onBeforeUnmount(() => {
  requestVersion++;
  revokeOwnedUrls();
});
</script>

<style scoped>
.git-media-diff-preview {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  min-height: 0;
  color: var(--el-text-color-regular);
}

.git-media-diff-preview.compact {
  padding: 12px 16px;
}

.preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
  min-width: 0;
}

.preview-side {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background-color: var(--el-fill-color-lighter);
}

.preview-side-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border-bottom: var(--border-width) solid var(--border-color);
  color: var(--el-text-color-primary);
  font-size: 12px;
  font-weight: 500;
}

.preview-size {
  flex: 0 0 auto;
  color: var(--el-text-color-secondary);
  font-size: 11px;
  font-weight: 400;
}

.preview-content {
  display: flex;
  min-height: 180px;
  max-height: 420px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background-color: var(--card-bg);
}

.image-preview-button {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 180px;
  padding: 0;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  cursor: zoom-in;
}

.image-preview-button img {
  display: block;
  max-width: 100%;
  max-height: 420px;
  object-fit: contain;
}

.preview-content :deep(.audio-player),
.preview-content :deep(.video-player-host) {
  width: 100%;
}

.preview-content :deep(.audio-player) {
  min-height: 160px;
}

.preview-unavailable {
  display: flex;
  min-height: 132px;
  padding: 16px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  text-align: center;
}

.binary-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 96px;
  color: var(--el-text-color-secondary);
  text-align: left;
}

.binary-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 12px;
}

.binary-copy strong {
  color: var(--el-text-color-primary);
  font-size: 14px;
}

.preview-actions {
  display: flex;
  justify-content: center;
  gap: 8px;
}

@media (max-width: 680px) {
  .preview-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
