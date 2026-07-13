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
  <div class="request-panel">
    <!-- Segment Control: 结构化 / 原始 -->
    <div class="segment-control">
      <button
        @click="mode = 'structured'"
        class="segment-btn"
        :class="{ active: mode === 'structured' }"
      >
        <Sparkles :size="13" />
        <span>结构化</span>
      </button>
      <button
        @click="mode = 'raw'"
        class="segment-btn"
        :class="{ active: mode === 'raw' }"
      >
        <Braces :size="13" />
        <span>原始</span>
      </button>
    </div>

    <!-- 内容区 -->
    <div class="panel-content">
      <RequestStructuredView v-if="mode === 'structured'" :record="record" />
      <RequestRawView v-else :record="record" :mask-api-keys="maskApiKeys" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { Braces, Sparkles } from "lucide-vue-next";
import RequestStructuredView from "./views/RequestStructuredView.vue";
import RequestRawView from "./views/RequestRawView.vue";
import type { CombinedRecord } from "../../types";

const props = defineProps<{
  record: CombinedRecord;
  maskApiKeys?: boolean;
}>();

type Mode = "structured" | "raw";
const mode = ref<Mode>("structured");

// 切换记录时保留当前模式
watch(
  () => props.record.id,
  () => {
    // 保留模式，不重置
  }
);
</script>

<style scoped>
.request-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
}

/* === Segment Control === */
.segment-control {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  flex-shrink: 0;
  align-self: flex-start;
}

.segment-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  background: transparent;
  color: var(--text-color);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.segment-btn:hover {
  background: var(--container-bg);
}

.segment-btn.active {
  background: var(--primary-color);
  color: #ffffff;
}

.panel-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
