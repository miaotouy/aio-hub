<script setup lang="ts">
import { computed, ref } from "vue";
import {
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Scissors,
  Sparkles,
  Trash2,
} from "lucide-vue-next";
import { useMiniMaxCoverWorkflow } from "../composables/useMiniMaxCoverWorkflow";

const {
  params,
  isTwoStepCoverMode,
  isPreprocessing,
  preprocessError,
  preprocessResult,
  isExpired,
  canPreprocess,
  parsedStructure,
  rawStructureText,
  remainingText,
  startPreprocess,
  resetLyricsToPreprocess,
  clearLyrics,
  insertLyricTag,
} = useMiniMaxCoverWorkflow();

const collapsed = ref(false);
const activeSegment = ref<number | null>(null);
const lyricTags = ["[Verse]", "[Chorus]", "[Bridge]", "[Outro]", "[Inst]"];

const statusType = computed(() => {
  if (isPreprocessing.value) return "warning";
  if (preprocessError.value) return "danger";
  if (preprocessResult.value && !isExpired.value) return "success";
  if (isExpired.value && preprocessResult.value) return "danger";
  return "info";
});

const statusText = computed(() => {
  if (isPreprocessing.value) return "正在提取音频特征与歌词";
  if (preprocessError.value) return preprocessError.value;
  if (preprocessResult.value && isExpired.value) return "预处理结果已过期";
  if (preprocessResult.value) return "预处理完成";
  return "等待预处理参考音频";
});

const shortFeatureId = computed(() => {
  const id = preprocessResult.value?.coverFeatureId || "";
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}...${id.slice(-6)}`;
});

const structureSegments = computed(() => parsedStructure.value.segments);

const totalDuration = computed(() => {
  return (
    preprocessResult.value?.audioDuration ||
    parsedStructure.value.totalDuration ||
    0
  );
});

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds)) return "00:00";
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const s = (safe % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

const segmentColor = (label: string) => {
  const normalized = label.toLowerCase();
  if (normalized.includes("chorus")) return "#f56c6c";
  if (normalized.includes("verse")) return "#67c23a";
  if (normalized.includes("bridge")) return "#9b5de5";
  if (normalized.includes("intro")) return "#409eff";
  if (normalized.includes("outro")) return "#909399";
  if (normalized.includes("inst") || normalized.includes("solo"))
    return "#e6a23c";
  return "#c0c4cc";
};

const segmentStyle = (segment: {
  start: number;
  end: number;
  label: string;
}) => {
  const duration = totalDuration.value || segment.end;
  const width =
    duration > 0
      ? Math.max(3, ((segment.end - segment.start) / duration) * 100)
      : 100;
  return {
    width: `${width}%`,
    background: segmentColor(segment.label),
  };
};
</script>

<template>
  <Transition name="cover-panel">
    <div v-if="isTwoStepCoverMode" class="cover-workflow-panel">
      <div class="cover-panel-header">
        <button
          class="icon-button"
          type="button"
          @click="collapsed = !collapsed"
        >
          <el-icon
            ><ChevronDown v-if="collapsed" /><ChevronUp v-else
          /></el-icon>
        </button>

        <div class="status-area">
          <el-tag :type="statusType" size="small" effect="light">
            {{ statusText }}
          </el-tag>
          <span v-if="shortFeatureId" class="meta-text">{{
            shortFeatureId
          }}</span>
          <span v-if="preprocessResult?.audioDuration" class="meta-text">
            {{ formatTime(preprocessResult.audioDuration) }}
          </span>
          <span class="meta-text">{{ remainingText }}</span>
        </div>

        <div class="header-actions">
          <el-button
            size="small"
            type="primary"
            :loading="isPreprocessing"
            :disabled="!canPreprocess"
            @click="startPreprocess"
          >
            <el-icon><Sparkles /></el-icon>
            <span>{{ preprocessResult ? "重新预处理" : "预处理" }}</span>
          </el-button>
        </div>
      </div>

      <div v-show="!collapsed" class="cover-panel-body">
        <section class="lyrics-column">
          <div class="column-header">
            <span>歌词精修</span>
            <div class="column-actions">
              <el-tooltip content="重置为提取歌词" placement="top">
                <el-button
                  link
                  size="small"
                  :disabled="!preprocessResult?.formattedLyrics"
                  @click="resetLyricsToPreprocess"
                >
                  <el-icon><RotateCcw /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="清空歌词" placement="top">
                <el-button link size="small" @click="clearLyrics">
                  <el-icon><Trash2 /></el-icon>
                </el-button>
              </el-tooltip>
            </div>
          </div>

          <div class="tag-row">
            <el-button
              v-for="tag in lyricTags"
              :key="tag"
              size="small"
              plain
              @click="insertLyricTag(tag)"
            >
              {{ tag }}
            </el-button>
          </div>

          <el-input
            v-model="params.lyrics"
            type="textarea"
            :rows="10"
            resize="vertical"
            placeholder="[Verse]\n..."
          />
        </section>

        <section class="structure-column">
          <div class="column-header">
            <span>歌曲结构</span>
            <span v-if="totalDuration" class="meta-text">
              {{ formatTime(totalDuration) }}
            </span>
          </div>

          <div v-if="structureSegments.length > 0" class="structure-view">
            <div class="segment-bar">
              <el-tooltip
                v-for="(segment, index) in structureSegments"
                :key="`${segment.label}-${segment.start}-${index}`"
                :content="`${formatTime(segment.start)} - ${formatTime(segment.end)} ${segment.label}`"
                placement="top"
              >
                <button
                  type="button"
                  class="segment-block"
                  :class="{ active: activeSegment === index }"
                  :style="segmentStyle(segment)"
                  @mouseenter="activeSegment = index"
                  @focus="activeSegment = index"
                  @mouseleave="activeSegment = null"
                  @blur="activeSegment = null"
                ></button>
              </el-tooltip>
            </div>

            <div class="segment-list">
              <button
                v-for="(segment, index) in structureSegments"
                :key="`${segment.start}-${segment.end}-${segment.label}`"
                type="button"
                class="segment-row"
                :class="{ active: activeSegment === index }"
                @click="activeSegment = activeSegment === index ? null : index"
              >
                <span
                  class="segment-dot"
                  :style="{ background: segmentColor(segment.label) }"
                ></span>
                <span class="segment-label">{{ segment.label }}</span>
                <span class="segment-time">
                  {{ formatTime(segment.start) }} -
                  {{ formatTime(segment.end) }}
                </span>
              </button>
            </div>
          </div>

          <div v-else-if="rawStructureText" class="raw-structure">
            {{ rawStructureText }}
          </div>

          <div v-else class="empty-structure">
            <el-icon><Scissors /></el-icon>
            <span>暂无结构结果</span>
          </div>
        </section>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.cover-workflow-panel {
  margin: 0 24px 12px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background: var(--card-bg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.cover-panel-header {
  min-height: 44px;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--container-bg);
  border-bottom: var(--border-width) solid var(--border-color);
}

.icon-button {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
  background: transparent;
  cursor: pointer;
}

.icon-button:hover {
  color: var(--el-color-primary);
  background: var(--el-fill-color-light);
}

.status-area {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.meta-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.header-actions {
  flex-shrink: 0;
}

.cover-panel-body {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(260px, 0.8fr);
  gap: 16px;
  padding: 14px;
}

.lyrics-column,
.structure-column {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.column-header {
  min-height: 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.column-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.structure-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.segment-bar {
  width: 100%;
  height: 24px;
  display: flex;
  overflow: hidden;
  border-radius: 6px;
  background: var(--input-bg);
  border: 1px solid var(--border-color);
}

.segment-block {
  min-width: 10px;
  height: 100%;
  border: none;
  cursor: pointer;
  opacity: 0.82;
  transition:
    opacity 0.15s,
    transform 0.15s;
}

.segment-block.active,
.segment-block:hover {
  opacity: 1;
  transform: scaleY(1.12);
}

.segment-list {
  max-height: 220px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.segment-row {
  width: 100%;
  min-height: 30px;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  color: var(--el-text-color-regular);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.segment-row:hover,
.segment-row.active {
  background: var(--el-fill-color-light);
  border-color: var(--border-color);
}

.segment-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.segment-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-transform: capitalize;
}

.segment-time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.raw-structure,
.empty-structure {
  min-height: 120px;
  padding: 12px;
  border-radius: 8px;
  background: var(--input-bg);
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.empty-structure {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.cover-panel-enter-active,
.cover-panel-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.cover-panel-enter-from,
.cover-panel-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (max-width: 960px) {
  .cover-panel-body {
    grid-template-columns: 1fr;
  }

  .cover-workflow-panel {
    margin-inline: 12px;
  }
}
</style>
