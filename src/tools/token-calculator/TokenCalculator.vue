<template>
  <div class="token-calculator-container">
    <div class="main-wrapper">
      <WorkspaceTabs v-model="activeTab" :tabs="tabs">
        <template #default="{ activeTab: current }">
          <!-- 使用 keep-alive 避免切 Tab 时计算 Tab 状态丢失 -->
          <keep-alive>
            <CalculatorTab v-if="current === 'calculator'" :state="state" />
            <TokenizerLibraryTab v-else-if="current === 'library'" />
            <TokenizerRuleTab v-else-if="current === 'rules'" />
            <TokenizerCalibrationTab v-else-if="current === 'calibration'" />
          </keep-alive>
        </template>
      </WorkspaceTabs>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import {
  Histogram,
  Collection,
  Connection,
  SetUp,
} from "@element-plus/icons-vue";
import { useTokenCalculator } from "@/tools/token-calculator/composables/useTokenCalculatorState";
import WorkspaceTabs, {
  type WorkspaceTabDef,
} from "./components/workspace/WorkspaceTabs.vue";
import CalculatorTab from "./components/workspace/CalculatorTab.vue";
import TokenizerLibraryTab from "./components/workspace/TokenizerLibraryTab.vue";
import TokenizerRuleTab from "./components/workspace/TokenizerRuleTab.vue";
import TokenizerCalibrationTab from "./components/workspace/TokenizerCalibrationTab.vue";
import { useTokenizerRegistryStore } from "./stores/tokenizerRegistryStore";
import type { TokenizerProfile } from "./types/tokenizer-profile";

const activeTab = ref<string>("calculator");
const state = useTokenCalculator();
const registryStore = useTokenizerRegistryStore();

/**
 * Profile 是否携带有效校准（任意一个字段非默认值即视为已校准）
 */
function hasCalibration(profile: TokenizerProfile): boolean {
  const c = profile.calibration;
  if (!c) return false;
  return (
    (c.multiplier !== undefined && c.multiplier !== 1) ||
    (c.fixedOverhead !== undefined && c.fixedOverhead !== 0) ||
    (c.perMessageOverhead !== undefined && c.perMessageOverhead !== 0) ||
    (c.perToolOverhead !== undefined && c.perToolOverhead !== 0) ||
    (c.reserveRatio !== undefined && c.reserveRatio !== 0)
  );
}

const calibratedCount = computed(() => {
  if (!registryStore.isLoaded) return 0;
  return registryStore.allProfiles.filter((p) => hasCalibration(p)).length;
});

const tabs = computed<WorkspaceTabDef[]>(() => [
  {
    id: "calculator",
    label: "计算",
    icon: Histogram,
    tooltip: "Token 计算",
  },
  {
    id: "library",
    label: "分词器库",
    icon: Collection,
    tooltip: "已安装与可用的分词器",
    badge: registryStore.isLoaded
      ? registryStore.allProfiles.length
      : undefined,
  },
  {
    id: "rules",
    label: "匹配规则",
    icon: Connection,
    tooltip: "模型 ID 与分词器的映射规则",
    badge:
      registryStore.isLoaded && registryStore.userRules.length > 0
        ? registryStore.userRules.length
        : undefined,
  },
  {
    id: "calibration",
    label: "校准",
    icon: SetUp,
    tooltip: "保守估算的校准参数",
    badge: calibratedCount.value > 0 ? calibratedCount.value : undefined,
  },
]);

onMounted(async () => {
  await state.initializeDefaultModel();
});
</script>

<style scoped>
.token-calculator-container {
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
  min-height: 0;
}

@media (max-width: 768px) {
  .token-calculator-container {
    padding: 8px;
  }
  .main-wrapper {
    border-radius: 8px;
  }
}
</style>
