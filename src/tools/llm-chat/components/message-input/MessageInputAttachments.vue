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

<script setup lang="ts">
import { Trash2, Wand2, FileAudio, Square, ChevronDown } from "lucide-vue-next";
import { ElMessageBox } from "element-plus";
import AttachmentCard from "../AttachmentCard.vue";
import type { Asset } from "@/types/asset-management";

interface Props {
  attachments: Asset[];
  count: number;
  maxCount: number;
  textCount: number;
  getWillUseTranscription: (asset: Asset) => boolean;
}

defineProps<Props>();

const emit = defineEmits<{
  (e: "remove", asset: Asset): void;
  (e: "clear"): void;
  (e: "transcribe-all"): void;
  (e: "smart-transcribe-all"): void;
  (e: "force-transcribe-all"): void;
  (e: "stop-all"): void;
}>();

const handleClear = async () => {
  try {
    await ElMessageBox.confirm("确定要清空所有附件吗？", "提示", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
      lockScroll: false,
    });
    emit("clear");
  } catch {
    // 用户取消
  }
};
</script>

<template>
  <div v-show="count + textCount > 0" class="attachments-area">
    <div class="attachments-list">
      <AttachmentCard
        v-for="asset in attachments"
        :key="asset.id"
        :asset="asset"
        :all-assets="attachments"
        :removable="true"
        size="small"
        :will-use-transcription="getWillUseTranscription(asset)"
        @remove="emit('remove', asset)"
      />
      <slot />
    </div>
    <!-- 附件数量浮动显示 -->
    <div class="attachments-info-container">
      <el-dropdown
        trigger="click"
        placement="top-end"
        class="attachments-dropdown"
      >
        <button
          type="button"
          class="attachments-info clickable"
          :title="`批量附件操作 · 文件 ${count} / ${maxCount}，文本 ${textCount}`"
        >
          <span class="attachment-count"
            >{{ count + textCount
            }}<span class="attachment-count-label"> 个附件</span></span
          >
          <ChevronDown :size="12" aria-hidden="true" />
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-if="count" @click="emit('transcribe-all')">
              <template #icon><FileAudio :size="14" /></template>
              一键转写未转写
            </el-dropdown-item>
            <el-dropdown-item
              v-if="count"
              @click="emit('smart-transcribe-all')"
            >
              <template #icon><Wand2 :size="14" /></template>
              智能转写未转写
            </el-dropdown-item>
            <el-dropdown-item
              v-if="count"
              @click="emit('force-transcribe-all')"
            >
              <template #icon><FileAudio :size="14" /></template>
              强制重新转写所有
            </el-dropdown-item>
            <el-dropdown-item v-if="count" @click="emit('stop-all')">
              <template #icon><Square :size="14" /></template>
              停止所有任务
            </el-dropdown-item>
            <el-dropdown-item
              :divided="count > 0"
              @click="handleClear"
              class="danger-item"
            >
              <template #icon><Trash2 :size="14" /></template>
              清空所有附件
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<style scoped>
.attachments-area {
  position: relative;
  container-type: inline-size;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px;
  border-radius: 12px;
  background: var(--input-bg, var(--container-bg));
  border: var(--border-width) solid var(--border-color);
  margin-bottom: 4px;
  max-height: 200px;
  overflow-y: auto;
}

/* 优化滚动条 */
.attachments-area::-webkit-scrollbar {
  width: 4px;
}

.attachments-area::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 2px;
}

.attachments-list {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px;
}

.attachments-info-container {
  position: sticky;
  top: 0;
  flex-shrink: 0;
  align-self: flex-start;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px 2px 8px;
  background: var(--container-bg);
  backdrop-filter: blur(var(--ui-blur));
  border-radius: 12px;
  z-index: 1;
}

.attachments-info {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--text-secondary);
  height: 18px;
  padding: 0;
  border: 0;
  background: transparent;
  font-family: inherit;
}

.attachments-info.clickable {
  cursor: pointer;
  transition: opacity 0.2s;
}

.attachments-info:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
  border-radius: 4px;
}

.attachments-info.clickable:hover {
  opacity: 0.8;
}

.attachment-count {
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.danger-item {
  color: var(--el-color-danger);
}
@container (max-width: 280px) {
  .attachment-count-label {
    display: none;
  }
  .attachments-info-container {
    padding-inline: 4px;
  }
}
</style>
