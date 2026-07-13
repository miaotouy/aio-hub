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
import { View } from "@element-plus/icons-vue";
import { useSymlinkMoverLogic } from "../composables/useSymlinkMover";
import type { OperationLog } from "../types";

interface Props {
  log: OperationLog;
  tickerKey: number;
}

defineProps<Props>();

const emit = defineEmits<{
  "open-log": [];
}>();

const logic = useSymlinkMoverLogic();
</script>

<template>
  <div class="log-ticker">
    <div class="log-ticker-content">
      <div class="log-ticker-message" :key="tickerKey">
        {{ logic.formatLogTicker(log) }}
      </div>
    </div>
    <el-button
      :icon="View"
      text
      size="small"
      @click="emit('open-log')"
      class="log-ticker-btn"
    >
      详情
    </el-button>
  </div>
</template>

<style scoped>
.log-ticker {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: linear-gradient(
    135deg,
    var(--container-bg) 0%,
    color-mix(in srgb, var(--el-color-primary) 5%, transparent) 100%
  );
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
  margin-bottom: 12px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.log-ticker-content {
  flex: 1;
  overflow: hidden;
  height: 20px;
  position: relative;
}

.log-ticker-message {
  font-size: 12px;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  animation: slideInUp 0.5s ease-out;
}

@keyframes slideInUp {
  from {
    transform: translateY(100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.log-ticker-btn {
  flex-shrink: 0;
  padding: 4px 8px;
}
</style>
