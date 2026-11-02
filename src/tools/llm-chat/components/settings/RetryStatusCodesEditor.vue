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
import { computed } from "vue";
import {
  parseRetryStatusCodes,
  DEFAULT_RETRY_STATUS_CODES,
} from "../../utils/retryStatusCodes";

const props = defineProps<{
  modelValue?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const text = computed({
  get: () => props.modelValue ?? "",
  set: (value: string) => emit("update:modelValue", value),
});

const parsed = computed(() => parseRetryStatusCodes(props.modelValue ?? ""));
const isEmpty = computed(() => (props.modelValue ?? "").trim().length === 0);

function restoreDefault() {
  text.value = DEFAULT_RETRY_STATUS_CODES;
}
</script>

<template>
  <div class="retry-status-editor">
    <el-input
      v-model="text"
      type="textarea"
      :autosize="{ minRows: 2, maxRows: 4 }"
      spellcheck="false"
      placeholder="100-199,300-399,401-407"
    />

    <div class="retry-status-editor__ranges">
      <template v-if="parsed.ranges.length > 0">
        <el-tag
          v-for="range in parsed.ranges"
          :key="`${range.start}-${range.end}`"
          size="small"
          effect="plain"
          type="info"
        >
          {{
            range.start === range.end
              ? range.start
              : `${range.start}-${range.end}`
          }}
        </el-tag>
      </template>
      <span v-else class="retry-status-editor__empty">
        {{ isEmpty ? "未配置，任何状态码都不会自动重试" : "暂无有效号段" }}
      </span>
    </div>

    <ul
      v-if="parsed.errors.length"
      class="retry-status-editor__issues is-error"
    >
      <li v-for="(err, idx) in parsed.errors" :key="`err-${idx}`">{{ err }}</li>
    </ul>
    <ul
      v-if="parsed.overlaps.length"
      class="retry-status-editor__issues is-warning"
    >
      <li v-for="(msg, idx) in parsed.overlaps" :key="`overlap-${idx}`">
        {{ msg }}
      </li>
    </ul>
    <ul
      v-if="parsed.excluded.length"
      class="retry-status-editor__issues is-warning"
    >
      <li v-for="(msg, idx) in parsed.excluded" :key="`excluded-${idx}`">
        {{ msg }}
      </li>
    </ul>

    <div class="retry-status-editor__actions">
      <span class="retry-status-editor__note">2xx、504、524 始终排除</span>
      <el-button link type="primary" size="small" @click="restoreDefault">
        恢复默认
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.retry-status-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.retry-status-editor__ranges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.retry-status-editor__empty {
  color: var(--text-color-secondary);
  font-size: 12px;
}

.retry-status-editor__issues {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.6;
}

.retry-status-editor__issues.is-error {
  color: var(--el-color-danger);
}

.retry-status-editor__issues.is-warning {
  color: var(--el-color-warning);
}

.retry-status-editor__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.retry-status-editor__note {
  color: var(--text-color-secondary);
  font-size: 12px;
}
</style>
