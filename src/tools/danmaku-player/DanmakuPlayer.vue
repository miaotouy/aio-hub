<template>
  <div class="danmaku-player-container">
    <!-- 顶栏：模式切换与文件路径选择器 -->
    <div class="file-toolbar">
      <div class="mode-tabs" role="tablist" aria-label="播放器模式">
        <button
          class="mode-tab"
          :class="{ active: activeMode === 'builtin' }"
          type="button"
          role="tab"
          :aria-selected="activeMode === 'builtin'"
          @click="activeMode = 'builtin'"
        >
          <Film :size="14" />
          内置播放器
        </button>
        <button
          class="mode-tab"
          :class="{ active: activeMode === 'external' }"
          type="button"
          role="tab"
          :aria-selected="activeMode === 'external'"
          @click="activeMode = 'external'"
        >
          <Monitor :size="14" />
          外部播放器
        </button>
      </div>

      <div class="file-input-group">
        <!-- 视频文件选择：仅内置播放器模式需要 -->
        <DropZone
          v-if="activeMode === 'builtin'"
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
            <div
              class="path-selector"
              :class="{ 'path-selector--dragging': dragging }"
            >
              <div class="path-selector__icon">
                <Film :size="16" />
              </div>
              <span class="path-selector__label">视频</span>
              <span
                class="path-selector__path"
                :class="{ 'path-selector__path--empty': !videoName }"
              >
                {{ videoName || "拖入或点击选择视频文件" }}
              </span>
              <button
                v-if="videoUrl"
                class="path-selector__clear"
                title="清除视频"
                @click.stop="resetVideo"
              >
                <X :size="14" />
              </button>
            </div>
          </template>
        </DropZone>

        <!-- 弹幕文件选择：两种模式共用 -->
        <DropZone
          variant="input"
          :accept="danmakuAcceptExtensions"
          :clickable="true"
          :click-zone="true"
          :multiple="false"
          hide-content
          @drop="handleDanmakuDrop"
          class="path-drop-zone"
        >
          <template #default="{ dragging }">
            <div
              class="path-selector"
              :class="{ 'path-selector--dragging': dragging }"
            >
              <div class="path-selector__icon path-selector__icon--ass">
                <MessageSquareText :size="16" />
              </div>
              <span class="path-selector__label">弹幕</span>
              <span
                class="path-selector__path"
                :class="{ 'path-selector__path--empty': !danmakuFileName }"
              >
                {{ danmakuFileName || "拖入或点击选择弹幕文件" }}
              </span>
              <span v-if="danmakus.length > 0" class="path-selector__badge">
                {{ danmakus.length }} 条
              </span>
              <button
                v-if="danmakuFileName"
                class="path-selector__clear"
                title="清除弹幕"
                @click.stop="resetDanmaku"
              >
                <X :size="14" />
              </button>
            </div>
          </template>
        </DropZone>

        <!-- 外挂字幕文件选择：仅内置播放器模式需要 -->
        <DropZone
          v-if="activeMode === 'builtin'"
          variant="input"
          :accept="subtitleAcceptExtensions"
          :clickable="true"
          :click-zone="true"
          :multiple="false"
          hide-content
          @drop="handleSubtitleDrop"
          class="path-drop-zone"
        >
          <template #default="{ dragging }">
            <div
              class="path-selector"
              :class="{ 'path-selector--dragging': dragging }"
            >
              <div class="path-selector__icon path-selector__icon--subtitle">
                <Captions :size="16" />
              </div>
              <span class="path-selector__label">字幕</span>
              <span
                class="path-selector__path"
                :class="{ 'path-selector__path--empty': !subtitleTrack }"
              >
                {{ subtitleTrack?.fileName || "拖入或点击选择外挂字幕文件" }}
              </span>
              <span v-if="subtitleTrack" class="path-selector__badge">
                {{ subtitleTrack.cues.length }} 条
              </span>
              <button
                v-if="subtitleTrack"
                class="path-selector__clear"
                title="清除字幕"
                @click.stop="resetSubtitle"
              >
                <X :size="14" />
              </button>
            </div>
          </template>
        </DropZone>
      </div>
    </div>

    <!-- 播放器区域 -->
    <div
      class="player-area"
      :class="{ 'player-area--builtin': activeMode === 'builtin' }"
    >
      <template v-if="activeMode === 'builtin'">
        <template v-if="videoUrl">
          <DanmakuVideoPlayer
            :src="videoUrl"
            :title="videoName"
            :danmakus="danmakus"
            :script-info="scriptInfo"
            :config="config"
            :subtitle-track="subtitleTrack"
            :autoplay="false"
          />
        </template>
        <template v-else>
          <div class="player-placeholder">
            <Tv :size="64" class="placeholder-icon" />
            <p class="placeholder-text">拖入视频文件到上方开始播放</p>
            <p class="placeholder-hint">支持 ASS 弹幕与常见外挂字幕</p>
          </div>
        </template>
      </template>
      <ExternalPlayerPanel
        v-else
        :danmakus="danmakus"
        :script-info="scriptInfo"
        :config="config"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import {
  Captions,
  Film,
  MessageSquareText,
  Monitor,
  X,
  Tv,
} from "lucide-vue-next";
import DropZone from "@/components/common/DropZone.vue";
import DanmakuVideoPlayer from "./components/DanmakuVideoPlayer.vue";
import ExternalPlayerPanel from "./components/ExternalPlayerPanel.vue";
import { parseDanmaku } from "./core/danmakuParser";
import { parseSubtitle } from "./core/subtitleParser";
import { useDanmakuConfig } from "./composables/useDanmakuConfig";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@/utils/logger";
import { smartDecode } from "@/utils/encoding";
import { convertFileSrc } from "@tauri-apps/api/core";
import { readFile } from "@tauri-apps/plugin-fs";
import type { ParsedDanmaku, AssScriptInfo, SubtitleTrack } from "./types";

const logger = createModuleLogger("danmaku-player");

const danmakuAcceptExtensions = [".ass", ".json", ".xml"];
const subtitleAcceptExtensions = [
  ".srt",
  ".vtt",
  ".ass",
  ".ssa",
  ".lrc",
  ".sbv",
  ".sub",
  ".smi",
  ".sami",
  ".ttml",
  ".dfxp",
  ".xml",
  ".txt",
  ".idx",
  ".sup",
];
const graphicSubtitleExtensions = new Set(["idx", "sup"]);

const activeMode = ref<"builtin" | "external">("builtin");
const videoUrl = ref("");
const videoName = ref("");
const danmakuFileName = ref("");
const danmakus = ref<ParsedDanmaku[]>([]);
const scriptInfo = ref<AssScriptInfo>({ playResX: 1836, playResY: 1032 });
const subtitleTrack = ref<SubtitleTrack | null>(null);

const { config } = useDanmakuConfig();

function getFileNameFromPath(path: string, fallback: string): string {
  const nameMatch = path.match(/[/\\]([^/\\]+)$/);
  return nameMatch ? nameMatch[1] : fallback;
}

function getFileExtension(fileName: string): string {
  return fileName.toLowerCase().match(/\.([^.]+)$/)?.[1] ?? "";
}

async function loadTextFile(path: string): Promise<string> {
  const bytes = await readFile(path);
  return smartDecode(bytes);
}

async function handleVideoDrop(paths: string[]) {
  logger.info("handleVideoDrop", { count: paths.length });
  if (paths.length === 0) return;
  const path = paths[0];
  logger.info("选择视频文件", { path });

  // 提取文件名
  videoName.value = getFileNameFromPath(path, "video");

  videoUrl.value = convertFileSrc(path);
  logger.info("视频 URL 已生成", { url: videoUrl.value });
}

async function handleDanmakuDrop(paths: string[]) {
  logger.info("handleDanmakuDrop", { count: paths.length });
  if (paths.length === 0) return;
  const path = paths[0];
  logger.info("选择弹幕文件", { path });

  const fileName = getFileNameFromPath(path, "danmaku");
  danmakuFileName.value = fileName;

  try {
    const content = await loadTextFile(path);
    logger.info("弹幕文件内容已读取", { length: content.length });
    const result = parseDanmaku(content, fileName);
    danmakus.value = result.danmakus;
    scriptInfo.value = result.info;
    logger.info("弹幕解析成功", {
      fileName,
      format: result.format,
      count: result.danmakus.length,
      info: result.info,
    });
    customMessage.success(`成功解析 ${result.danmakus.length} 条弹幕`);
  } catch (err) {
    logger.error("弹幕解析失败", err as Error);
    const message = err instanceof Error ? err.message : "请检查文件格式";
    customMessage.error(`弹幕解析失败：${message}`);
  }
}

async function handleSubtitleDrop(paths: string[]) {
  logger.info("handleSubtitleDrop", { count: paths.length });
  if (paths.length === 0) return;
  const path = paths[0];
  const fileName = getFileNameFromPath(path, "subtitle");
  logger.info("选择字幕文件", { path, fileName });

  try {
    if (graphicSubtitleExtensions.has(getFileExtension(fileName))) {
      customMessage.warning("图形字幕暂不支持，请加载文本外挂字幕文件");
      return;
    }

    const content = await loadTextFile(path);
    logger.info("字幕文件内容已读取", {
      fileName,
      length: content.length,
    });
    const result = parseSubtitle(content, fileName);
    subtitleTrack.value = result.track;
    logger.info("字幕解析成功", {
      fileName,
      format: result.track.format,
      count: result.track.cues.length,
      warnings: result.warnings,
    });

    if (result.warnings.length > 0) {
      customMessage.warning(result.warnings[0]);
    }
    customMessage.success(`成功解析 ${result.track.cues.length} 条字幕`);
  } catch (err) {
    logger.error("字幕解析失败", err as Error);
    const message = err instanceof Error ? err.message : "请检查文件格式";
    customMessage.error(`字幕解析失败：${message}`);
  }
}

function resetVideo() {
  if (videoUrl.value) {
    URL.revokeObjectURL(videoUrl.value);
  }
  videoUrl.value = "";
  videoName.value = "";
}

function resetDanmaku() {
  danmakuFileName.value = "";
  danmakus.value = [];
  scriptInfo.value = { playResX: 1836, playResY: 1032 };
}

function resetSubtitle() {
  subtitleTrack.value = null;
}
</script>

<style scoped>
.danmaku-player-container {
  width: 100%;
  height: 100%;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ============ 顶栏工具条 ============ */
.file-toolbar {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 16px;
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border-bottom: var(--border-width) solid var(--border-color);
}

.mode-tabs {
  display: inline-flex;
  align-self: flex-start;
  gap: 4px;
  padding: 3px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--input-bg);
}

.mode-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 12px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition:
    color 0.2s,
    background-color 0.2s;
}

.mode-tab:hover {
  color: var(--el-color-primary);
  background: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.08)
  );
}

.mode-tab.active {
  color: var(--el-color-primary);
  background: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.14)
  );
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
  background: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.1)
  );
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
  background: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.1)
  );
}

.path-selector__icon--ass {
  color: var(--el-color-success);
  background: rgba(
    var(--el-color-success-rgb),
    calc(var(--card-opacity) * 0.1)
  );
}

.path-selector__icon--subtitle {
  color: var(--el-color-warning);
  background: rgba(
    var(--el-color-warning-rgb),
    calc(var(--card-opacity) * 0.12)
  );
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
  background: rgba(
    var(--el-color-success-rgb),
    calc(var(--card-opacity) * 0.1)
  );
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
  background: var(--container-bg);
}

.player-area--builtin {
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
