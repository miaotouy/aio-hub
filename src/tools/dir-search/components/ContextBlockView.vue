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
  <div class="context-block-view">
    <template v-for="(block, blockIdx) in blocks" :key="blockIdx">
      <!-- 块间分隔线 -->
      <div v-if="blockIdx > 0" class="context-block-view__separator">
        <span class="context-block-view__separator-dots">···</span>
      </div>
      <!-- 块内行 -->
      <div
        v-for="line in block.lines"
        :key="`${blockIdx}-${line.lineNumber}`"
        class="context-block-view__line"
        :class="{
          'context-block-view__line--match': line.matchInfo !== null,
          'context-block-view__line--context': line.matchInfo === null,
        }"
        @click="line.matchInfo && $emit('selectMatch', line.lineNumber)"
        @contextmenu="
          line.matchInfo && $emit('contextmenu', $event, line.lineNumber)
        "
      >
        <span class="context-block-view__line-number">{{
          line.lineNumber
        }}</span>
        <el-tooltip
          :content="line.content"
          :show-after="500"
          placement="top"
          popper-class="result-item-tooltip"
          :fallback-placements="['bottom', 'top']"
        >
          <span class="context-block-view__line-content">
            <template v-if="line.matchInfo">
              <span>{{
                line.content.slice(0, line.matchInfo.matchStart)
              }}</span>
              <span class="context-block-view__highlight">{{
                line.content.slice(
                  line.matchInfo.matchStart,
                  line.matchInfo.matchEnd
                )
              }}</span>
              <span>{{ line.content.slice(line.matchInfo.matchEnd) }}</span>
            </template>
            <template v-else>{{ line.content }}</template>
          </span>
        </el-tooltip>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { ContextBlock } from "../types";

defineProps<{
  blocks: ContextBlock[];
}>();

defineEmits<{
  selectMatch: [lineNumber: number];
  contextmenu: [event: MouseEvent, lineNumber: number];
}>();
</script>

<style scoped>
.context-block-view {
  font-family: monospace;
  font-size: 12px;
  line-height: 1.5;
}

.context-block-view__separator {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1px 0;
  color: var(--el-text-color-disabled);
  font-size: 10px;
  user-select: none;
}

.context-block-view__separator-dots {
  letter-spacing: 2px;
}

.context-block-view__line {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 1px 8px 1px 24px;
  border-radius: 2px;
  transition: background-color 0.1s;
}

.context-block-view__line--match {
  cursor: pointer;
}

.context-block-view__line--match:hover {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.06)
  );
}

.context-block-view__line--context {
  opacity: 0.6;
}

.context-block-view__line-number {
  color: var(--el-text-color-secondary);
  font-size: 11px;
  min-width: 32px;
  text-align: right;
  flex-shrink: 0;
  user-select: none;
}

.context-block-view__line-content {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-text-color-regular);
}

.context-block-view__highlight {
  color: var(--el-color-primary);
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.15)
  );
  border-radius: 2px;
  padding: 0 1px;
}
</style>
