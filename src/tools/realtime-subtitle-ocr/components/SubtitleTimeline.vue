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
  <div class="subtitle-timeline">
    <div class="subtitle-timeline__header">
      <span class="subtitle-timeline__title">
        字幕时间轴
        <span class="subtitle-timeline__count">({{ subtitles.length }})</span>
      </span>
      <div class="subtitle-timeline__actions">
        <el-button size="small" :disabled="!subtitles.length" @click="copyAll">
          <CopyIcon :size="14" /> 复制全部
        </el-button>
        <el-button
          size="small"
          type="primary"
          :disabled="!subtitles.length"
          @click="onExportSrt"
        >
          <DownloadIcon :size="14" /> 导出 SRT
        </el-button>
        <el-button
          size="small"
          type="warning"
          :disabled="!subtitles.length"
          @click="$emit('clear-all')"
        >
          <TrashIcon :size="14" /> 一键清空
        </el-button>
      </div>
    </div>

    <div class="subtitle-timeline__table-wrapper" ref="listRef">
      <table class="subtitle-table" v-if="subtitles.length">
        <thead>
          <tr>
            <th class="col-index">#</th>
            <th class="col-time">开始</th>
            <th class="col-time">结束</th>
            <th class="col-duration">持续</th>
            <th class="col-text">字幕文本</th>
            <th class="col-ops">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(sub, index) in subtitles"
            :key="sub.id"
            class="subtitle-row"
            @click="selectRow(sub.id)"
          >
            <td class="col-index">{{ index + 1 }}</td>
            <td class="col-time">{{ formatTime(sub.startMs) }}</td>
            <td class="col-time">{{ formatTime(sub.endMs) }}</td>
            <td class="col-duration">
              {{ formatDuration(sub.endMs - sub.startMs) }}
            </td>
            <td class="col-text">
              <div class="text-cell" title="点击编辑">
                {{ sub.text || "(空)" }}
              </div>
            </td>
            <td class="col-ops">
              <div class="ops-cell">
                <button
                  class="icon-btn"
                  title="删除"
                  @click.stop="remove(sub.id)"
                >
                  <TrashIcon :size="13" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="subtitle-timeline__empty">
        暂无字幕，开始监控后将在此显示
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import { ElButton } from "element-plus";
import {
  Copy as CopyIcon,
  Download as DownloadIcon,
  Trash2 as TrashIcon,
} from "lucide-vue-next";
import { formatSrtTime } from "../utils/algorithms";
import type { SubtitleEntry } from "../types";

const props = defineProps<{
  subtitles: SubtitleEntry[];
}>();
const emit = defineEmits<{
  (e: "remove", id: string): void;
  (e: "update-text", id: string, text: string): void;
  (e: "export-srt"): void;
  (e: "copy-all"): void;
  (e: "select", id: string): void;
  (e: "clear-all"): void;
}>();
const listRef = ref<HTMLDivElement | null>(null);

// 监听字幕长度变化，自动滚动到底部
watch(
  () => props.subtitles.length,
  (newLen, oldLen) => {
    if (newLen > oldLen) {
      nextTick(() => {
        const el = listRef.value;
        if (!el) return;
        // 判断是否接近底部（允许 50px 的偏差）
        const isAtBottom =
          el.scrollHeight - el.scrollTop - el.clientHeight < 50;
        // 如果是第一条字幕，或者用户本来就在底部，就自动滚动
        if (oldLen === 0 || isAtBottom) {
          el.scrollTo({
            top: el.scrollHeight,
            behavior: "smooth",
          });
        }
      });
    }
  }
);

function formatTime(ms: number): string {
  return formatSrtTime(ms);
}

function formatDuration(ms: number): string {
  const seconds = (ms / 1000).toFixed(2);
  return `${seconds}s`;
}

function selectRow(id: string) {
  emit("select", id);
}

function remove(id: string) {
  emit("remove", id);
}

function copyAll() {
  emit("copy-all");
}

function onExportSrt() {
  emit("export-srt");
}
</script>

<style scoped>
.subtitle-timeline {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.subtitle-timeline__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: var(--border-width) solid var(--border-color);
  flex-shrink: 0;
}

.subtitle-timeline__title {
  font-weight: 600;
  font-size: 14px;
}

.subtitle-timeline__count {
  color: var(--el-text-color-secondary);
  font-weight: 400;
  margin-left: 4px;
}

.subtitle-timeline__actions {
  display: flex;
  gap: 8px;
}

.subtitle-timeline__table-wrapper {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
}

.subtitle-timeline__empty {
  color: var(--el-text-color-secondary);
  text-align: center;
  padding: 48px 0;
  font-size: 13px;
}

.subtitle-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 13px;
}

.subtitle-table th,
.subtitle-table td {
  padding: 10px 12px;
  border-bottom: var(--border-width) solid var(--border-color);
}

.subtitle-table th {
  background: var(--sidebar-bg);
  color: var(--el-text-color-secondary);
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 1;
}

.subtitle-row {
  cursor: pointer;
  transition: background-color 0.15s;
}

.subtitle-row:hover {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.08)
  );
}

.col-index {
  width: 40px;
  text-align: center;
  color: var(--el-text-color-secondary);
}

.col-time {
  width: 110px;
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  color: var(--el-text-color-regular);
}

.col-duration {
  width: 70px;
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  color: var(--el-text-color-secondary);
}

.col-text {
  color: var(--el-text-color-primary);
  font-weight: 500;
}

.text-cell {
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.5;
}

.col-ops {
  width: 60px;
  text-align: center;
}

.ops-cell {
  display: flex;
  justify-content: center;
  gap: 4px;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: var(--el-fill-color);
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition:
    background-color 0.15s,
    color 0.15s;
}

.icon-btn:hover {
  background: var(--el-color-danger);
  color: #fff;
}
</style>
