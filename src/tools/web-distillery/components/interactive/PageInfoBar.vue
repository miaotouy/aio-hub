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
import { Globe, Copy, FileText } from "lucide-vue-next";
import { useWebDistilleryStore } from "../../stores/store";
import { customMessage } from "@/utils/customMessage";

const store = useWebDistilleryStore();

const hasPageInfo = computed(() => !!store.currentPageUrl);

const displayUrl = computed(() => {
  if (!store.currentPageUrl) return "";
  try {
    const u = new URL(store.currentPageUrl);
    return u.origin + u.pathname + u.search + u.hash;
  } catch {
    return store.currentPageUrl;
  }
});

const copyUrl = async () => {
  if (!store.currentPageUrl) return;
  try {
    await navigator.clipboard.writeText(store.currentPageUrl);
    customMessage.success("已复制 URL");
  } catch {
    customMessage.error("复制失败");
  }
};
</script>

<template>
  <div v-if="hasPageInfo" class="page-info-bar">
    <div class="page-title" v-if="store.currentPageTitle">
      <el-icon :size="12"><FileText /></el-icon>
      <span class="title-text">{{ store.currentPageTitle }}</span>
    </div>
    <div class="page-url">
      <el-icon :size="12"><Globe /></el-icon>
      <span class="url-text">{{ displayUrl }}</span>
      <el-tooltip content="复制 URL" placement="top" :show-after="500">
        <el-icon class="copy-btn" @click="copyUrl"><Copy /></el-icon>
      </el-tooltip>
    </div>
  </div>
</template>

<style scoped>
.page-info-bar {
  height: 28px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 16px;
  background-color: var(--sidebar-bg);
  border-bottom: var(--border-width) solid var(--border-color);
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
  overflow: hidden;
}

.page-title {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  max-width: 30%;
}

.title-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  color: var(--el-text-color-regular);
}

.page-url {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.url-text {
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.copy-btn {
  cursor: pointer;
  flex-shrink: 0;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.copy-btn:hover {
  opacity: 1;
  color: var(--el-color-primary);
}
</style>
