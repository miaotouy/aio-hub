<template>
  <div class="embedding-playground-container">
    <div class="main-wrapper">
      <!-- 顶部 Header 区 -->
      <div class="header-bar">
        <div class="header-left">
          <div class="app-title">
            <span class="text">Embedding 测试</span>
          </div>

          <div class="nav-tabs">
            <div
              class="tab-item"
              :class="{ active: activeTab === 'similarity' }"
              @click="activeTab = 'similarity'"
            >
              <el-icon class="tab-icon"><Scale /></el-icon>
              相似度对比
            </div>
            <div
              class="tab-item"
              :class="{ active: activeTab === 'retrieval' }"
              @click="activeTab = 'retrieval'"
            >
              <el-icon class="tab-icon"><Search /></el-icon>
              检索模拟
            </div>
            <div
              class="tab-item"
              :class="{ active: activeTab === 'raw' }"
              @click="activeTab = 'raw'"
            >
              <el-icon class="tab-icon"><Wrench /></el-icon>
              基础调试
            </div>
          </div>
        </div>

        <div class="header-right">
          <div class="model-selector-wrapper">
            <LlmModelSelector
              v-model="selectedModelCombo"
              :capabilities="{ embedding: true }"
              placeholder="选择 Embedding 模型"
            />
          </div>
        </div>
      </div>

      <!-- 内容区域 -->
      <div class="content-container">
        <KeepAlive>
          <component :is="currentTabComponent" />
        </KeepAlive>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useEmbeddingPlaygroundStore } from "./store";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { Scale, Search, Wrench } from "lucide-vue-next";
import { parseModelCombo } from "@/utils/modelIdUtils";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import RawDebugger from "./components/RawDebugger.vue";
import SimilarityArena from "./components/SimilarityArena.vue";
import RetrievalSimulator from "./components/RetrievalSimulator.vue";

const store = useEmbeddingPlaygroundStore();
const { enabledProfiles } = useLlmProfiles();
const activeTab = ref("similarity");

const currentTabComponent = computed(() => {
  switch (activeTab.value) {
    case "similarity":
      return SimilarityArena;
    case "retrieval":
      return RetrievalSimulator;
    case "raw":
      return RawDebugger;
    default:
      return SimilarityArena;
  }
});

// 处理 LlmModelSelector 的 combo 绑定 (profileId:modelId)
const selectedModelCombo = computed({
  get: () => {
    if (store.selectedProfile && store.selectedModelId) {
      return `${store.selectedProfile.id}:${store.selectedModelId}`;
    }
    return "";
  },
  set: (val: string) => {
    if (!val) {
      store.selectedProfile = null;
      store.selectedModelId = "";
      return;
    }
    const [profileId, modelId] = parseModelCombo(val);
    const profile = enabledProfiles.value.find((p) => p.id === profileId);
    if (profile) {
      store.selectedProfile = profile;
      store.selectedModelId = modelId;
    }
  },
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
  border: 1px solid var(--border-color);
  box-sizing: border-box;
  backdrop-filter: blur(var(--ui-blur));
}

.header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 56px;
  border-bottom: 1px solid var(--border-color);
  background-color: rgba(255, 255, 255, 0.02);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-shrink: 0;
}

.header-right {
  flex: 1;
  display: flex;
  justify-content: flex-end;
  min-width: 0;
}

.model-selector-wrapper {
  width: 100%;
  max-width: 400px;
  display: flex;
  justify-content: flex-end;
}

.app-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 15px;
  color: var(--text-color);
  opacity: 0.9;
}

.nav-tabs {
  display: flex;
  background-color: var(--bg-color-soft);
  padding: 3px;
  border-radius: 8px;
}

.tab-item {
  padding: 4px 14px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  color: var(--text-color-secondary);
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}

.tab-item:hover {
  color: var(--text-color);
  background-color: rgba(128, 128, 128, 0.08);
}

.tab-item.active {
  background-color: var(--bg-color);
  color: var(--primary-color);
  border: 1px solid var(--primary-color);
  font-weight: 600;
}

.tab-icon {
  font-size: 14px;
}

.content-container {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
}
</style>
