<template>
  <div class="playground-view">
    <div class="lab-header">
      <div class="header-controls">
        <div class="control-group">
          <span class="label">目标知识库</span>
          <el-select
            v-model="selectedKbIds"
            multiple
            collapse-tags
            collapse-tags-tooltip
            placeholder="选择知识库"
            style="width: 240px"
          >
            <el-option
              v-for="base in kbStore.bases"
              :key="base.id"
              :label="base.name"
              :value="base.id"
            />
          </el-select>
        </div>

        <div class="control-group">
          <span class="label">全局查询</span>
          <el-input
            v-model="globalQuery"
            placeholder="同步到所有槽位..."
            clearable
            style="width: 300px"
            @keyup.enter="syncAndSearchAll"
          >
            <template #append>
              <el-button @click="syncAndSearchAll">全量检索</el-button>
            </template>
          </el-input>
        </div>

        <div class="spacer"></div>

        <el-button type="primary" plain @click="addSlot" :disabled="slots.length >= 4">
          <Plus :size="16" style="margin-right: 4px" />
          添加对比槽位
        </el-button>
      </div>
    </div>

    <div class="lab-content">
      <div class="slots-container" :class="`cols-${slots.length}`">
        <SearchSlot
          v-for="slot in slots"
          :key="slot.id"
          :ref="(el) => (slotRefs[slot.id] = el)"
          :selected-kb-ids="selectedKbIds"
          :can-remove="slots.length > 1"
          :shared-result-ids="sharedResultIds"
          :query-text="globalQuery"
          :initial-engine-id="slot.engineId"
          :initial-config="slot.config"
          :initial-results="slot.results"
          @remove="removeSlot(slot.id)"
          @results-updated="(results: SearchResult[]) => updateSlotResults(slot.id, results)"
          @select="handleSelect"
          @update:engine-id="(val) => (slot.engineId = val)"
          @update:config="(val) => (slot.config = val)"
        />
      </div>
    </div>

    <VectorCoverageDialog ref="coverageDialog" />
    <SearchResultDetailDialog ref="resultDetailDialog" />

    <div v-if="slots.length > 1" class="lab-footer">
      <div class="stats-bar">
        <div class="stat-item">
          <span class="label">对比槽位:</span>
          <span class="value">{{ slots.length }}</span>
        </div>
        <div class="stat-item">
          <span class="label">共同命中:</span>
          <span class="value">{{ sharedResultIds.size }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from "vue";
import { Plus } from "lucide-vue-next";
import { invoke } from "@tauri-apps/api/core";
import { useKnowledgeBaseStore } from "../stores/knowledgeBaseStore";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useKbVectorSync } from "../composables/useKbVectorSync";
import { getPureModelId, parseModelCombo } from "@/utils/modelIdUtils";
import SearchSlot from "../components/SearchSlot.vue";
import VectorCoverageDialog, { BatchCoverageItem } from "../components/VectorCoverageDialog.vue";
import SearchResultDetailDialog from "../components/SearchResultDetailDialog.vue";
import { SearchResult } from "../types/search";
import { customMessage } from "@/utils/customMessage";

const kbStore = useKnowledgeBaseStore();
const { enabledProfiles } = useLlmProfiles();
const vectorSync = useKbVectorSync();

interface SlotData {
  id: string;
  results: SearchResult[];
  engineId?: string;
  config?: {
    embeddingModel: string;
    [key: string]: any;
  };
}

const selectedKbIds = ref<string[]>([]);
const globalQuery = ref("");
const slots = reactive<SlotData[]>([]);
const slotRefs = ref<Record<string, any>>({});
const coverageDialog = ref<any>(null);
const resultDetailDialog = ref<any>(null);

onMounted(async () => {
  if (kbStore.engines.length === 0) {
    await kbStore.loadEngines();
  }

  // 尝试从持久化配置中恢复
  const saved = kbStore.config.playground;
  if (saved && saved.slots.length > 0) {
    selectedKbIds.value = [...saved.selectedKbIds];
    globalQuery.value = saved.globalQuery;
    slots.push(
      ...saved.slots.map((s) => ({
        id: s.id,
        results: s.results ? [...s.results] : [],
        engineId: s.engineId,
        config: { ...s.config },
      }))
    );
  } else {
    // 默认初始化
    // 默认选中当前激活的库
    if (kbStore.activeBaseId) {
      selectedKbIds.value = [kbStore.activeBaseId];
    } else if (kbStore.bases.length > 0) {
      selectedKbIds.value = [kbStore.bases[0].id];
    }
    slots.push({ id: crypto.randomUUID(), results: [] });
  }
});

// 深度监听并保存
watch(
  [selectedKbIds, globalQuery, slots],
  () => {
    // 提取需要持久化的槽位配置
    const slotConfigs = slots.map((s) => {
      return {
        id: s.id,
        engineId: s.engineId ?? "keyword",
        config: s.config
          ? { ...s.config }
          : {
              embeddingModel: kbStore.config.defaultEmbeddingModel || "",
              ...kbStore.config.vectorIndex,
            },
        results: [...s.results],
      };
    });

    kbStore.config.playground = {
      selectedKbIds: [...selectedKbIds.value],
      globalQuery: globalQuery.value,
      slots: slotConfigs,
    };
    kbStore.saveWorkspace();
  },
  { deep: true }
);

function addSlot() {
  if (slots.length >= 4) return;
  slots.push({ id: crypto.randomUUID(), results: [] });
}

function removeSlot(id: string) {
  const index = slots.findIndex((s) => s.id === id);
  if (index !== -1) {
    slots.splice(index, 1);
    delete slotRefs.value[id];
  }
}

function updateSlotResults(id: string, results: SearchResult[]) {
  const slot = slots.find((s) => s.id === id);
  if (slot) {
    slot.results = results;
  }
}

async function syncAndSearchAll() {
  if (!globalQuery.value.trim()) return;
  if (selectedKbIds.value.length === 0) {
    customMessage.warning("请先选择知识库");
    return;
  }

  // 1. 汇总所有槽位的覆盖率检查需求
  const checkTasks: { modelId: string; slotId: string }[] = [];
  const activeSlots = Object.entries(slotRefs.value)
    .filter(([_, el]) => el && el.isVectorEngine && el.config.embeddingModel)
    .map(([id, el]) => ({ id, el }));
  for (const { id, el } of activeSlots) {
    const modelId = getPureModelId(el.config.embeddingModel);
    checkTasks.push({ modelId, slotId: id });
  }

  // 2. 批量检查
  if (checkTasks.length > 0) {
    const batchItems: BatchCoverageItem[] = [];

    // 按模型分组检查，避免重复请求后端
    const modelToSlots = new Map<string, string[]>();
    checkTasks.forEach((t) => {
      const slots = modelToSlots.get(t.modelId) || [];
      slots.push(t.slotId);
      modelToSlots.set(t.modelId, slots);
    });

    for (const [modelId] of modelToSlots) {
      const coverage = await invoke<any>("kb_check_vector_coverage", {
        kbIds: selectedKbIds.value,
        modelId: modelId,
      });

      if (coverage.missingEntries > 0) {
        batchItems.push({
          modelName: modelId,
          kbNames: selectedKbIds.value.map(
            (id) => kbStore.bases.find((b) => b.id === id)?.name || id
          ),
          missingEntries: coverage.missingEntries,
          missingMap: coverage.missingMap,
        });
      }
    }

    // 3. 统一弹窗
    if (batchItems.length > 0) {
      const action = await coverageDialog.value.show(batchItems);
      if (action === "cancel") return;

      if (action === "fill") {
        // 依次执行补全
        for (const item of batchItems) {
          // 找到对应的 Profile
          const slotWithThisModel = activeSlots.find((s) =>
            s.el.config.embeddingModel.endsWith(item.modelName)
          );
          if (slotWithThisModel) {
            const [profileId] = parseModelCombo(slotWithThisModel.el.config.embeddingModel);
            const profile = enabledProfiles.value.find((p) => p.id === profileId);
            if (profile) {
              // 收集需要补全的条目 ID
              const entryIds: string[] = [];
              for (const ids of Object.values(item.missingMap)) {
                entryIds.push(...(ids as string[]));
              }

              // 使用 vectorSync 的 updateVectors 方法
              if (entryIds.length > 0) {
                await vectorSync.updateVectors(selectedKbIds.value, entryIds, {
                  customComboId: slotWithThisModel.el.config.embeddingModel,
                });
              }
            }
          }
        }
      }
    }
  }

  // 4. 触发搜索
  Object.values(slotRefs.value).forEach((slot: any) => {
    if (slot) {
      slot.search(globalQuery.value, { skipCoverageCheck: true });
    }
  });
}

// 计算共同命中的结果 ID
const sharedResultIds = computed(() => {
  if (slots.length < 2) return new Set<string>();

  // 统计每个 ID 在多少个槽位中出现
  const counts = new Map<string, number>();
  slots.forEach((slot) => {
    const seenInThisSlot = new Set(slot.results.map((r) => r.caiu.id));
    seenInThisSlot.forEach((id) => {
      counts.set(id, (counts.get(id) || 0) + 1);
    });
  });

  // 只有在所有非空槽位中都出现的才算共同命中
  const activeSlotsCount = slots.filter((s) => s.results.length > 0).length;
  if (activeSlotsCount < 2) return new Set<string>();

  const shared = new Set<string>();
  counts.forEach((count, id) => {
    if (count === activeSlotsCount) {
      shared.add(id);
    }
  });
  return shared;
});

function handleSelect(result: SearchResult) {
  resultDetailDialog.value?.show(result);
}
</script>

<style scoped>
.playground-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 16px;
  background-color: var(--main-bg);
  box-sizing: border-box;
}

.lab-header {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
}

.header-main .title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 20px;
  font-weight: bold;
  color: var(--el-text-color-primary);
}

.header-main .subtitle {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 10px 16px;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-sizing: border-box;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.control-group .label {
  font-size: 12px;
  font-weight: bold;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
  white-space: nowrap;
}

.spacer {
  flex: 1;
}

.lab-content {
  flex: 1;
  min-height: 0;
}

.slots-container {
  display: grid;
  height: 100%;
  gap: 16px;
  box-sizing: border-box;
}

.slots-container.cols-1 {
  grid-template-columns: 1fr;
}
.slots-container.cols-2 {
  grid-template-columns: 1fr 1fr;
}
.slots-container.cols-3 {
  grid-template-columns: 1fr 1fr 1fr;
}
.slots-container.cols-4 {
  grid-template-columns: 1fr 1fr 1fr 1fr;
}

.lab-footer {
  flex-shrink: 0;
  padding: 8px 16px;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.stats-bar {
  display: flex;
  gap: 20px;
}

.stat-item {
  display: flex;
  gap: 8px;
  font-size: 12px;
}

.stat-item .label {
  color: var(--el-text-color-secondary);
}

.stat-item .value {
  font-weight: bold;
  color: var(--el-color-primary);
}
</style>
