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
  <div class="embedding-playground-container">
    <div class="main-wrapper">
      <div class="header-bar">
        <div class="app-title">
          <span class="text">Embedding 测试场</span>
        </div>

        <div class="nav-tabs">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            class="tab-item"
            :class="{ active: activeTab === tab.key }"
            type="button"
            @click="activeTab = tab.key"
          >
            <component :is="tab.icon" class="tab-icon" />
            <span>{{ tab.label }}</span>
          </button>
        </div>
      </div>

      <div class="content-container">
        <KeepAlive>
          <component :is="currentTabComponent" />
        </KeepAlive>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { BarChart3, GitCompare, Search, Swords, Wrench } from "lucide-vue-next";
import QuickCompare from "./components/QuickCompare.vue";
import SimilarityArena from "./components/SimilarityArena.vue";
import MultiModelArena from "./components/MultiModelArena.vue";
import RetrievalSimulator from "./components/RetrievalSimulator.vue";
import RawDebugger from "./components/RawDebugger.vue";

type TabKey = "quick" | "similarity" | "multi" | "retrieval" | "raw";

const activeTab = ref<TabKey>("quick");

const tabs = [
  { key: "quick", label: "极简 A vs B", icon: GitCompare },
  { key: "similarity", label: "1:N 语义排行", icon: BarChart3 },
  { key: "multi", label: "多模型竞技场", icon: Swords },
  { key: "retrieval", label: "检索模拟", icon: Search },
  { key: "raw", label: "基础调试", icon: Wrench },
] as const;

const currentTabComponent = computed(() => {
  switch (activeTab.value) {
    case "quick":
      return QuickCompare;
    case "similarity":
      return SimilarityArena;
    case "multi":
      return MultiModelArena;
    case "retrieval":
      return RetrievalSimulator;
    case "raw":
      return RawDebugger;
    default:
      return QuickCompare;
  }
});
</script>

<style scoped>
.embedding-playground-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
  padding: 6px;
  box-sizing: border-box;
}

.main-wrapper {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  background-color: var(--card-bg);
  border-radius: 12px;
  border: var(--border-width) solid var(--border-color);
  box-sizing: border-box;
  backdrop-filter: blur(var(--ui-blur));
}

.header-bar {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 0 16px;
  min-height: 56px;
  border-bottom: var(--border-width) solid var(--border-color);
  background-color: color-mix(in srgb, var(--card-bg) 92%, transparent);
  flex-shrink: 0;
}

.app-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 15px;
  color: var(--text-color);
  white-space: nowrap;
}

.nav-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow-x: auto;
  background-color: var(--bg-color-soft);
  padding: 3px;
  border-radius: 8px;
}

.tab-item {
  appearance: none;
  border: 1px solid transparent;
  background: transparent;
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  color: var(--text-color-secondary);
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  white-space: nowrap;
}

.tab-item:hover {
  color: var(--text-color);
  background-color: rgba(128, 128, 128, 0.08);
}

.tab-item.active {
  background-color: var(--bg-color);
  color: var(--primary-color);
  border-color: var(--primary-color);
  font-weight: 600;
}

.tab-icon {
  width: 14px;
  height: 14px;
}

.content-container {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
}
</style>
