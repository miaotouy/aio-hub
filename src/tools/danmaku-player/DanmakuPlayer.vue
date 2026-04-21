<template>
  <div class="danmaku-player-container">
    <!-- 顶栏：文件路径选择器 -->
    <div class="file-toolbar">
      <div class="file-input-group">
        <!-- 视频文件选择 -->
        <DropZone
          variant="input"
          :accept="['video/*', '.mkv', '.mp4', '.webm', '.avi', '.mov']"
          :clickable="true"
          :click-zone="true"
          :multiple="false"
          hide-content
          @drop="handleVideoDrop"
          class="path-drop-zone"
        >
          <template #default="{ dragging }">
            <div class="path-selector" :class="{ 'path-selector--dragging': dragging }">
              <div class="path-selector__icon">
                <Film :size="16" />
              </div>
              <span class="path-selector__label">视频</span>
              <span class="path-selector__path" :class="{ 'path-selector__path--empty': !videoName }">
                {{ videoName || "拖入或点击选择视频文件" }}
              </span>
              <button v-if="videoUrl" class="path-selector__clear" title="清除视频" @click.stop="resetVideo">
                <X :size="14" />
              </button>
            </div>
          </template>
        </DropZone>

        <!-- ASS 弹幕文件选择 -->
        <DropZone
          variant="input"
          :accept="['.ass']"
          :clickable="true"
          :click-zone="true"
          :multiple="false"
          hide-content
          @drop="handleAssDrop"
          class="path-drop-zone"
        >
          <template #default="{ dragging }">
            <div class="path-selector" :class="{ 'path-selector--dragging': dragging }">
              <div class="path-selector__icon path-selector__icon--ass">
                <MessageSquareText :size="16" />
              </div>
              <span class="path-selector__label">弹幕</span>
              <span class="path-selector__path" :class="{ 'path-selector__path--empty': !assFileName }">
                {{ assFileName || "拖入或点击选择 ASS 弹幕文件" }}
              </span>
              <span v-if="danmakus.length > 0" class="path-selector__badge"> {{ danmakus.length }} 条 </span>
              <button v-if="assFileName" class="path-selector__clear" title="清除弹幕" @click.stop="resetAss">
                <X :size="14" />
              </button>
            </div>
          </template>
        </DropZone>
      </div>
    </div>

    <!-- 播放器区域 -->
    <div class="player-area">
      <template v-if="videoUrl">
        <DanmakuVideoPlayer
          :src="videoUrl"
          :title="videoName"
          :danmakus="danmakus"
          :script-info="scriptInfo"
          :config="config"
          :autoplay="false"
        />
      </template>
      <template v-else>
        <div class="player-placeholder">
          <Tv :size="64" class="placeholder-icon" />
          <p class="placeholder-text">拖入视频文件到上方开始播放</p>
          <p class="placeholder-hint">支持 ASS 格式弹幕 · 专为 Bilibili Evolved 优化</p>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Film, MessageSquareText, X, Tv } from "lucide-vue-next";
import DropZone from "@/components/common/DropZone.vue";
import DanmakuVideoPlayer from "./components/DanmakuVideoPlayer.vue";
import { parseAss } from "./core/assParser";
import { useDanmakuConfig } from "./composables/useDanmakuConfig";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@/utils/logger";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { ParsedDanmaku, AssScriptInfo } from "./types";

const logger = createModuleLogger("danmaku-player");

const videoUrl = ref("");
const videoName = ref("");
const assFileName = ref("");
const danmakus = ref<ParsedDanmaku[]>([]);
const scriptInfo = ref<AssScriptInfo>({ playResX: 1836, playResY: 1032 });

const { config } = useDanmakuConfig();

async function handleVideoDrop(paths: string[]) {
  logger.info("handleVideoDrop", { count: paths.length });
  if (paths.length === 0) return;
  const path = paths[0];
  logger.info("选择视频文件", { path });

  // 提取文件名
  const nameMatch = path.match(/[/\\]([^/\\]+)$/);
  videoName.value = nameMatch ? nameMatch[1] : "video";

  videoUrl.value = convertFileSrc(path);
  logger.info("视频 URL 已生成", { url: videoUrl.value });
}

async function handleAssDrop(paths: string[]) {
  logger.info("handleAssDrop", { count: paths.length });
  if (paths.length === 0) return;
  const path = paths[0];
  logger.info("选择弹幕文件", { path });

  const nameMatch = path.match(/[/\\]([^/\\]+)$/);
  assFileName.value = nameMatch ? nameMatch[1] : "danmaku.ass";

  try {
    const content = await invoke<string>("read_text_file_force", { path });
    logger.info("弹幕文件内容已读取", { length: content.length });
    const result = parseAss(content);
    danmakus.value = result.danmakus;
    scriptInfo.value = result.info;
    logger.info("弹幕解析成功", { count: result.danmakus.length, info: result.info });
    customMessage.success(`成功解析 ${result.danmakus.length} 条弹幕`);
  } catch (err) {
    logger.error("弹幕解析失败", err as Error);
    customMessage.error("弹幕解析失败，请检查文件格式");
  }
}

function resetVideo() {
  if (videoUrl.value) {
    URL.revokeObjectURL(videoUrl.value);
  }
  videoUrl.value = "";
  videoName.value = "";
}

function resetAss() {
  assFileName.value = "";
  danmakus.value = [];
  scriptInfo.value = { playResX: 1836, playResY: 1032 };
}
</script>

<style scoped>
.danmaku-player-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ============ 顶栏工具条 ============ */
.file-toolbar {
  flex-shrink: 0;
  padding: 10px 16px;
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border-bottom: var(--border-width) solid var(--border-color);
}

.file-input-group {
  display: flex;
  gap: 12px;
}

.path-drop-zone {
  flex: 1;
  min-width: 0;
}

/* ============ 路径选择器 ============ */
.path-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid var(--el-border-color);
  background: var(--input-bg);
  cursor: pointer;
  transition: all 0.2s;
  overflow: hidden;
}

.path-selector:hover {
  border-color: var(--el-color-primary);
}

.path-selector--dragging {
  border-color: var(--el-color-primary);
  background: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.1));
}

.path-selector__icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  color: var(--el-color-primary);
  background: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.1));
}

.path-selector__icon--ass {
  color: var(--el-color-success);
  background: rgba(var(--el-color-success-rgb), calc(var(--card-opacity) * 0.1));
}

.path-selector__label {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  user-select: none;
}

.path-selector__path {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  direction: rtl;
  text-align: left;
}

.path-selector__path--empty {
  color: var(--el-text-color-placeholder);
  direction: ltr;
}

.path-selector__badge {
  flex-shrink: 0;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
  color: var(--el-color-success);
  background: rgba(var(--el-color-success-rgb), calc(var(--card-opacity) * 0.1));
  font-weight: 500;
}

.path-selector__clear {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  color: var(--el-text-color-placeholder);
  cursor: pointer;
  border-radius: 50%;
  padding: 0;
  transition: all 0.2s;
}

.path-selector__clear:hover {
  color: var(--el-color-danger);
  background: rgba(var(--el-color-danger-rgb), 0.1);
}

/* ============ 播放器区域 ============ */
.player-area {
  flex: 1;
  min-height: 0;
  position: relative;
  background: #000;
}

/* ============ 空状态占位 ============ */
.player-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  user-select: none;
}

.placeholder-icon {
  color: rgba(255, 255, 255, 0.15);
}

.placeholder-text {
  margin: 0;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.4);
}

.placeholder-hint {
  margin: 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.2);
}
</style>
