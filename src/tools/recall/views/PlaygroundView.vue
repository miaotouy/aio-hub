<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
-->

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { Play, Rows3 } from "lucide-vue-next";
import { createModuleLogger } from "@/utils/logger";
import { customMessage } from "@/utils/customMessage";
import SearchSlot from "../components/SearchSlot.vue";
import RecallResultDetailDialog from "../components/RecallResultDetailDialog.vue";
import type { RetrievalPipelineRunSnapshot } from "../composables/useRetrievalPipelineRun";
import { LEGACY_RETRIEVAL_PRESET_MAP } from "../core/retrievalPipelineMigration";
import { listRetrievalPresets } from "../services/retrievalPipeline";
import { useRecallCollectionStore } from "../stores/recallCollectionStore";
import type { RecallPresetId, RecallPresetSummary } from "../types/pipeline";
import type { RecallResult } from "../types/search";

interface SlotData {
  id: string;
  presetId: RecallPresetId;
  limit: number;
  results: RecallResult[];
}

interface BatchReplayRow {
  query: string;
  runs: Array<{
    presetId: RecallPresetId;
    outcome: string;
    resultCount: number;
  }>;
}

const logger = createModuleLogger("recall/playground");
const recallStore = useRecallCollectionStore();
const presetSummaries = ref<RecallPresetSummary[]>([]);
const selectedRecallIds = ref<string[]>([]);
const globalQuery = ref("");
const replayQueries = ref("");
const runningAll = ref(false);
const runningBatch = ref(false);
const slots = reactive<SlotData[]>([]);
const slotRefs = ref<
  Record<string, { search: (query: string) => Promise<any> }>
>({});
const batchRows = ref<BatchReplayRow[]>([]);
const resultDetailDialog = ref<InstanceType<
  typeof RecallResultDetailDialog
> | null>(null);

const sharedResultIds = computed(() => {
  if (slots.length < 2) return new Set<string>();
  const counts = new Map<string, number>();
  for (const slot of slots) {
    for (const id of new Set(slot.results.map((result) => result.entry.id))) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count === slots.length)
      .map(([id]) => id)
  );
});

function defaultSlots(): SlotData[] {
  return [
    {
      id: crypto.randomUUID(),
      presetId: "algorithmic",
      limit: 6,
      results: [],
    },
    {
      id: crypto.randomUUID(),
      presetId: "comprehensive",
      limit: 6,
      results: [],
    },
  ];
}

function restoreSlots(saved: unknown): SlotData[] {
  if (!Array.isArray(saved)) return defaultSlots();
  const restored = saved.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const record = value as Record<string, unknown>;
    const presetId =
      record.presetId === "algorithmic" || record.presetId === "comprehensive"
        ? record.presetId
        : typeof record.engineId === "string"
          ? LEGACY_RETRIEVAL_PRESET_MAP[record.engineId]
          : undefined;
    if (!presetId) return [];
    const legacyConfig =
      record.config && typeof record.config === "object"
        ? (record.config as Record<string, unknown>)
        : undefined;
    const rawLimit = record.limit ?? legacyConfig?.limit;
    return [
      {
        id: typeof record.id === "string" ? record.id : crypto.randomUUID(),
        presetId,
        limit:
          typeof rawLimit === "number" && Number.isFinite(rawLimit)
            ? Math.min(100, Math.max(1, Math.trunc(rawLimit)))
            : 6,
        results: [],
      } satisfies SlotData,
    ];
  });
  if (!restored.length) return defaultSlots();
  if (restored.length === 1) {
    restored.push({
      id: crypto.randomUUID(),
      presetId:
        restored[0].presetId === "algorithmic"
          ? "comprehensive"
          : "algorithmic",
      limit: restored[0].limit,
      results: [],
    });
  }
  return restored.slice(0, 2);
}

async function runQuery(query: string) {
  if (!query.trim()) return [];
  if (!selectedRecallIds.value.length) {
    customMessage.warning("请先选择思绪集");
    return [];
  }
  return Promise.all(
    slots.map((slot) => slotRefs.value[slot.id]?.search(query) ?? null)
  );
}

async function runAll() {
  runningAll.value = true;
  try {
    await runQuery(globalQuery.value);
  } finally {
    runningAll.value = false;
  }
}

async function replayBatch() {
  const queries = replayQueries.value
    .split(/\r?\n/)
    .map((query) => query.trim())
    .filter(Boolean);
  if (!queries.length) return;
  runningBatch.value = true;
  batchRows.value = [];
  try {
    for (const query of queries) {
      const snapshots = await runQuery(query);
      batchRows.value.push({
        query,
        runs: slots.map((slot, index) => ({
          presetId: slot.presetId,
          outcome: snapshots[index]?.outcome ?? "failed",
          resultCount: snapshots[index]?.results?.length ?? 0,
        })),
      });
    }
  } finally {
    runningBatch.value = false;
  }
}

function updateSlotConfig(
  slot: SlotData,
  value: { presetId: RecallPresetId; limit: number }
) {
  slot.presetId = value.presetId;
  slot.limit = value.limit;
  slot.results = [];
}

function handleSelect(
  result: RecallResult,
  context: RetrievalPipelineRunSnapshot | null
) {
  resultDetailDialog.value?.show(result, context);
}

watch(
  [selectedRecallIds, globalQuery, slots],
  () => {
    recallStore.config.playground = {
      selectedRecallIds: [...selectedRecallIds.value],
      globalQuery: globalQuery.value,
      slots: slots.map((slot) => ({
        id: slot.id,
        presetId: slot.presetId,
        limit: slot.limit,
      })),
    };
    recallStore.saveWorkspaceDebounced();
  },
  { deep: true }
);

onMounted(async () => {
  try {
    presetSummaries.value = (await listRetrievalPresets()).filter(
      (summary) => summary.visibility === "product"
    );
  } catch (error) {
    logger.error("读取 Playground 预设失败", error);
  }

  const saved = recallStore.config.playground as unknown as
    Record<string, unknown> | undefined;
  selectedRecallIds.value = Array.isArray(saved?.selectedRecallIds)
    ? (saved.selectedRecallIds.filter(
        (id): id is string => typeof id === "string"
      ) as string[])
    : recallStore.activeBaseId
      ? [recallStore.activeBaseId]
      : recallStore.bases[0]
        ? [recallStore.bases[0].id]
        : [];
  globalQuery.value =
    typeof saved?.globalQuery === "string" ? saved.globalQuery : "";
  slots.push(...restoreSlots(saved?.slots));
});
</script>

<template>
  <main class="playground-view" data-testid="recall-playground">
    <header class="workbench-header">
      <div class="header-field collections-field">
        <span>目标思绪集</span>
        <el-select
          v-model="selectedRecallIds"
          multiple
          collapse-tags
          collapse-tags-tooltip
          data-testid="recall-search-collections"
        >
          <el-option
            v-for="base in recallStore.bases"
            :key="base.id"
            :label="base.name"
            :value="base.id"
          />
        </el-select>
      </div>
      <div class="header-field query-field">
        <span>查询</span>
        <el-input
          v-model="globalQuery"
          clearable
          data-testid="recall-search-query"
          @keyup.enter="runAll"
        />
      </div>
      <el-button
        type="primary"
        :icon="Play"
        :loading="runningAll"
        data-testid="recall-search-submit"
        @click="runAll"
      >
        运行双配置
      </el-button>
    </header>

    <section class="slots-grid">
      <SearchSlot
        v-for="slot in slots"
        :key="slot.id"
        :ref="(element: any) => (slotRefs[slot.id] = element)"
        :selected-recall-ids="selectedRecallIds"
        :can-remove="false"
        :shared-result-ids="sharedResultIds"
        :preset-summaries="presetSummaries"
        :query-text="globalQuery"
        :initial-preset-id="slot.presetId"
        :initial-limit="slot.limit"
        @results-updated="(results) => (slot.results = results)"
        @update:config="(value) => updateSlotConfig(slot, value)"
        @select="handleSelect"
      />
    </section>

    <section class="batch-panel">
      <header>
        <div>
          <Rows3 :size="16" />
          <strong>批量回放</strong>
        </div>
        <el-button :loading="runningBatch" @click="replayBatch">
          运行批次
        </el-button>
      </header>
      <el-input v-model="replayQueries" type="textarea" :rows="4" />
      <div v-if="batchRows.length" class="batch-results">
        <div v-for="row in batchRows" :key="row.query" class="batch-row">
          <span class="batch-query">{{ row.query }}</span>
          <span v-for="run in row.runs" :key="run.presetId">
            {{ run.presetId }} · {{ run.outcome }} · {{ run.resultCount }}
          </span>
        </div>
      </div>
    </section>

    <RecallResultDetailDialog ref="resultDetailDialog" />
  </main>
</template>

<style scoped>
.playground-view {
  display: grid;
  grid-template-rows: auto minmax(440px, 1fr) auto;
  gap: 12px;
  height: 100%;
  min-height: 0;
  padding: 12px;
  color: var(--el-text-color-primary);
}

.workbench-header,
.header-field,
.batch-panel header,
.batch-panel header div,
.batch-row {
  display: flex;
  align-items: center;
}

.workbench-header {
  gap: 14px;
  padding: 10px 12px;
  border-bottom: var(--border-width) solid var(--border-color);
}

.header-field {
  gap: 8px;
}

.header-field > span {
  flex: 0 0 auto;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.collections-field {
  width: min(34%, 360px);
}

.collections-field :deep(.el-select),
.query-field :deep(.el-input) {
  width: 100%;
}

.query-field {
  min-width: 240px;
  flex: 1;
}

.slots-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  min-height: 0;
  overflow: hidden;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
}

.batch-panel {
  padding: 12px;
  border-top: var(--border-width) solid var(--border-color);
}

.batch-panel header {
  justify-content: space-between;
  margin-bottom: 8px;
}

.batch-panel header div {
  gap: 7px;
}

.batch-results {
  max-height: 180px;
  margin-top: 10px;
  overflow: auto;
}

.batch-row {
  min-height: 32px;
  gap: 14px;
  border-bottom: var(--border-width) solid var(--border-color);
  font-size: 11px;
}

.batch-query {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 980px) {
  .playground-view {
    height: auto;
  }

  .workbench-header {
    align-items: stretch;
    flex-direction: column;
  }

  .collections-field,
  .query-field {
    width: 100%;
  }

  .slots-grid {
    grid-template-columns: 1fr;
  }
}
</style>
