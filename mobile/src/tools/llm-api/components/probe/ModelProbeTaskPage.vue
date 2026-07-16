<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  toRef,
  watch,
  type Ref,
} from "vue";
import {
  ChevronLeft,
  RotateCcw,
  Search,
  Settings2,
  Square,
} from "lucide-vue-next";
import { resolveProbePlan, type ChannelProbeResult } from "@aiohub/llm-core";
import { customDialog } from "@/utils/feedback";
import { useI18n } from "@/i18n";
import { useModelProbe } from "../../composables/useModelProbe";
import type { LlmProfile } from "../../types";
import ModelProbeCostConfirm from "./ModelProbeCostConfirm.vue";
import ModelProbeDetailPage from "./ModelProbeDetailPage.vue";
import ModelProbeModelList from "./ModelProbeModelList.vue";
import ModelProbeOptionsSheet from "./ModelProbeOptionsSheet.vue";

const { tRaw } = useI18n();
const tr = (key: string, params?: Record<string, unknown>) =>
  tRaw("tools.llm-api.ModelProbe." + key, params);

const props = defineProps<{
  show: boolean;
  profile: LlmProfile;
  initialModelId?: string;
}>();

const emit = defineEmits<{
  (event: "update:show", value: boolean): void;
  (event: "fetch-models"): void;
  (
    event: "results-change",
    payload: { results: Record<string, ChannelProbeResult>; stale: boolean }
  ): void;
}>();

type Filter = "all" | "checkable" | "failed" | "success";

const profileRef = toRef(props, "profile") as Ref<LlmProfile | null>;
const probe = useModelProbe(profileRef);
const searchQuery = ref("");
const filter = ref<Filter>("all");
const showOptions = ref(false);
const showCostConfirm = ref(false);
const detailModelId = ref<string>();
const pendingRunIds = ref<string[]>([]);
const nowTick = ref(Date.now());
let elapsedTimer: ReturnType<typeof setInterval> | undefined;
let historyEntryActive = false;
let closingFromUi = false;

const hasResults = computed(() => Object.keys(probe.results).length > 0);
const selectedModels = computed(() =>
  props.profile.models.filter((model) =>
    probe.selectedIds.value.includes(model.id)
  )
);
const hasSelectedChat = computed(() =>
  selectedModels.value.some(
    (model) => resolveProbePlan(model).capability === "chat"
  )
);
const costlyPendingCount = computed(
  () =>
    props.profile.models.filter(
      (model) =>
        pendingRunIds.value.includes(model.id) &&
        resolveProbePlan(model).requiresExplicitConsent
    ).length
);
const filteredModels = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  return props.profile.models.filter((model) => {
    if (
      query &&
      !model.name.toLowerCase().includes(query) &&
      !model.id.toLowerCase().includes(query)
    ) {
      return false;
    }
    const plan = resolveProbePlan(model);
    if (filter.value === "checkable") return plan.supported;
    if (filter.value === "failed")
      return Boolean(
        probe.results[model.id] && !probe.results[model.id].success
      );
    if (filter.value === "success")
      return probe.results[model.id]?.success === true;
    return true;
  });
});
const selectableFilteredIds = computed(() =>
  filteredModels.value
    .filter((model) => resolveProbePlan(model).supported)
    .map((model) => model.id)
);
const allFilteredSelected = computed(
  () =>
    selectableFilteredIds.value.length > 0 &&
    selectableFilteredIds.value.every((id) =>
      probe.selectedIds.value.includes(id)
    )
);
const detailModel = computed(() =>
  props.profile.models.find((model) => model.id === detailModelId.value)
);
const detailResult = computed(() =>
  detailModelId.value ? probe.results[detailModelId.value] : undefined
);
const resultFilters = computed<Filter[]>(() =>
  hasResults.value && !probe.isRunning.value
    ? ["all", "failed", "success"]
    : ["all", "checkable"]
);
const failureDistribution = computed(() => {
  const counts = new Map<string, number>();
  probe.runOrder.value.forEach((id) => {
    const result = probe.results[id];
    if (!result || result.success || result.category === "cancelled") return;
    const category = result.category ?? "unknown";
    counts.set(category, (counts.get(category) ?? 0) + 1);
  });
  return Array.from(counts, ([category, count]) => ({ category, count }));
});

watch(
  () => props.show,
  (show) => {
    if (!show) return;
    probe.open(props.initialModelId);
    filter.value = "all";
    searchQuery.value = "";
    if (!historyEntryActive) {
      window.history.pushState({ modelProbe: true }, "");
      historyEntryActive = true;
    }
  },
  { immediate: true }
);

watch(
  () => ({ ...probe.results }),
  (results) => emit("results-change", { results, stale: probe.isStale.value }),
  { deep: true }
);

watch(
  () => probe.isStale.value,
  (stale) => emit("results-change", { results: { ...probe.results }, stale })
);

watch(
  () => probe.isRunning.value,
  (running, wasRunning) => {
    if (running) {
      nowTick.value = Date.now();
      elapsedTimer ??= setInterval(() => {
        nowTick.value = Date.now();
      }, 500);
    } else if (elapsedTimer) {
      clearInterval(elapsedTimer);
      elapsedTimer = undefined;
    }
    if (wasRunning && !running && probe.failedCount.value > 0)
      filter.value = "failed";
  }
);

function toggleModel(modelId: string) {
  const selected = new Set(probe.selectedIds.value);
  if (selected.has(modelId)) selected.delete(modelId);
  else selected.add(modelId);
  probe.selectedIds.value = props.profile.models
    .map((model) => model.id)
    .filter((id) => selected.has(id));
}

function toggleFilteredSelection() {
  const selected = new Set(probe.selectedIds.value);
  if (allFilteredSelected.value)
    selectableFilteredIds.value.forEach((id) => selected.delete(id));
  else selectableFilteredIds.value.forEach((id) => selected.add(id));
  probe.selectedIds.value = props.profile.models
    .map((model) => model.id)
    .filter((id) => selected.has(id));
}

function requestRun(ids = probe.selectedIds.value) {
  if (!ids.length) return;
  pendingRunIds.value = [...ids];
  const costlyCount = props.profile.models.filter(
    (model) =>
      ids.includes(model.id) && resolveProbePlan(model).requiresExplicitConsent
  ).length;
  if (costlyCount > 0) showCostConfirm.value = true;
  else void probe.run(ids);
}

function confirmCostlyRun() {
  showCostConfirm.value = false;
  void probe.run(pendingRunIds.value, { allowCostlyMedia: true });
}

function retryFailed() {
  requestRun(
    probe.runOrder.value.filter((id) => {
      const result = probe.results[id];
      return result && !result.success;
    })
  );
}

function retryModel(modelId: string) {
  detailModelId.value = undefined;
  requestRun([modelId]);
}

function resetTask() {
  if (probe.isRunning.value) return;
  probe.clearSession();
  probe.open(props.initialModelId);
  filter.value = "all";
  searchQuery.value = "";
}

function reselectModels() {
  filter.value = "all";
  searchQuery.value = "";
  detailModelId.value = undefined;
}

async function canLeave(): Promise<boolean> {
  if (!probe.isRunning.value) return true;
  const confirmed = await customDialog({
    title: tr("停止确认标题"),
    message: tr("停止确认说明"),
    confirmButtonText: tr("停止并退出"),
    cancelButtonText: tr("继续检查"),
  });
  if (confirmed) probe.stop();
  return confirmed;
}

async function closeFromHeader() {
  if (!(await canLeave())) return;
  if (historyEntryActive) {
    closingFromUi = true;
    window.history.back();
  } else {
    emit("update:show", false);
  }
}

async function onPopState() {
  if (!props.show) return;
  if (detailModelId.value) {
    detailModelId.value = undefined;
    window.history.pushState({ modelProbe: true }, "");
    return;
  }
  if (closingFromUi) {
    closingFromUi = false;
    historyEntryActive = false;
    emit("update:show", false);
    return;
  }
  if (await canLeave()) {
    historyEntryActive = false;
    emit("update:show", false);
  } else {
    window.history.pushState({ modelProbe: true }, "");
  }
}

function fetchModels() {
  emit("fetch-models");
  void closeFromHeader();
}

function filterLabel(value: Filter) {
  return tr(
    { all: "全部", checkable: "可检查", failed: "失败", success: "成功" }[value]
  );
}

onMounted(() => window.addEventListener("popstate", onPopState));
onBeforeUnmount(() => {
  window.removeEventListener("popstate", onPopState);
  if (elapsedTimer) clearInterval(elapsedTimer);
  probe.stop();
});
</script>

<template>
  <section v-show="show" class="probe-page" :aria-label="tr('模型检查')">
    <header class="probe-header">
      <button
        class="icon-button"
        :aria-label="tr('返回渠道编辑')"
        @click="closeFromHeader"
      >
        <ChevronLeft :size="24" />
      </button>
      <h1>{{ tr("模型检查") }}</h1>
      <button
        class="text-button"
        :disabled="probe.isRunning.value"
        @click="resetTask"
      >
        {{ tr("重置") }}
      </button>
    </header>

    <main class="probe-main">
      <template v-if="profile.models.length === 0">
        <div class="empty-state">
          <Search :size="32" />
          <h2>{{ tr("无模型标题") }}</h2>
          <p>{{ tr("无模型说明") }}</p>
          <button class="primary-button" @click="fetchModels">
            {{ tr("从 API 获取") }}
          </button>
        </div>
      </template>

      <template v-else>
        <section
          v-if="probe.isRunning.value"
          class="progress-summary"
          aria-live="polite"
        >
          <div class="progress-heading">
            <strong>{{
              tr("正在检查N/M", {
                completed: probe.completedCount.value,
                total: probe.runOrder.value.length,
              })
            }}</strong>
            <span>{{ probe.progress.value }}%</span>
          </div>
          <div class="progress-track" aria-hidden="true">
            <span
              :style="{ transform: `scaleX(${probe.progress.value / 100})` }"
            />
          </div>
          <div class="progress-counts">
            <span>{{ tr("成功N", { count: probe.successCount.value }) }}</span>
            <span>{{ tr("失败N", { count: probe.failedCount.value }) }}</span>
            <span>{{
              tr("运行中N", { count: probe.runningCount.value })
            }}</span>
            <span>{{ tr("等待N", { count: probe.waitingCount.value }) }}</span>
          </div>
        </section>

        <section
          v-else-if="hasResults"
          class="result-summary"
          aria-live="polite"
        >
          <strong>{{
            tr("已完成N个模型", { count: probe.runOrder.value.length })
          }}</strong>
          <span class="success">{{
            tr("成功N", { count: probe.successCount.value })
          }}</span>
          <span class="danger">{{
            tr("失败N", { count: probe.failedCount.value })
          }}</span>
          <span v-if="probe.stoppedCount.value">{{
            tr("停止N", { count: probe.stoppedCount.value })
          }}</span>
        </section>
        <div
          v-if="
            !probe.isRunning.value &&
            probe.successCount.value === 0 &&
            failureDistribution.length
          "
          class="failure-distribution"
        >
          <span v-for="item in failureDistribution" :key="item.category">
            {{ item.category }} {{ item.count }}
          </span>
        </div>

        <div v-if="probe.isStale.value" class="stale-banner">
          {{ tr("配置已变化提示") }}
        </div>

        <div class="search-box">
          <Search :size="18" />
          <input
            v-model="searchQuery"
            type="search"
            :placeholder="tr('搜索模型')"
            :aria-label="tr('搜索模型')"
          />
        </div>

        <div class="filter-row">
          <div class="filter-segments" :aria-label="tr('检查选项')">
            <button
              v-for="item in resultFilters"
              :key="item"
              :class="{ active: filter === item }"
              @click="filter = item"
            >
              {{ filterLabel(item) }}
            </button>
          </div>
          <button
            class="select-button"
            :disabled="
              probe.isRunning.value || selectableFilteredIds.length === 0
            "
            @click="toggleFilteredSelection"
          >
            {{ allFilteredSelected ? tr("取消全选") : tr("全选") }}
          </button>
        </div>

        <div class="selection-count">
          {{
            tr("已选N/M", {
              selected: probe.selectedIds.value.length,
              total: profile.models.length,
            })
          }}
        </div>

        <ModelProbeModelList
          :models="filteredModels"
          :selected-ids="probe.selectedIds.value"
          :results="probe.results"
          :statuses="probe.rowStatuses"
          :started-at="probe.rowStartedAt"
          :now="nowTick"
          :running="probe.isRunning.value"
          :stale="probe.isStale.value"
          @toggle="toggleModel"
          @detail="detailModelId = $event"
        />

        <div v-if="filteredModels.length === 0" class="filter-empty">
          {{ tr("无筛选结果") }}
        </div>
      </template>
    </main>

    <footer v-if="profile.models.length > 0" class="probe-footer">
      <div
        v-if="!probe.isRunning.value && probe.selectedIds.value.length === 0"
        class="footer-hint"
      >
        {{ tr("无选择提示") }}
      </div>
      <div
        class="footer-actions"
        :class="{ three: hasResults && !probe.isRunning.value }"
      >
        <button
          class="options-button"
          :disabled="probe.isRunning.value"
          :aria-label="tr('检查选项')"
          @click="showOptions = true"
        >
          <Settings2 :size="20" />
          <span>{{ tr("选项") }}</span>
        </button>
        <button
          v-if="hasResults && !probe.isRunning.value"
          class="reselect-button"
          @click="reselectModels"
        >
          {{ tr("重新选择") }}
        </button>
        <button
          v-if="probe.isRunning.value"
          class="stop-button"
          @click="probe.stop"
        >
          <Square :size="18" />{{ tr("停止检查") }}
        </button>
        <button
          v-else-if="probe.failedCount.value > 0"
          class="primary-button"
          @click="retryFailed"
        >
          <RotateCcw :size="18" />{{ tr("重试失败项") }}
        </button>
        <button
          v-else
          class="primary-button"
          :disabled="probe.selectedIds.value.length === 0"
          @click="requestRun()"
        >
          {{
            hasResults
              ? tr("再次检查")
              : tr("检查N个模型", { count: probe.selectedIds.value.length })
          }}
        </button>
      </div>
    </footer>

    <ModelProbeOptionsSheet
      v-model:show="showOptions"
      :concurrency="probe.options.concurrency"
      :stream-chat="probe.options.streamChat"
      :timeout-ms="probe.options.timeoutMs"
      :selected-count="probe.selectedIds.value.length"
      :has-chat="hasSelectedChat"
      @update:concurrency="probe.options.concurrency = $event"
      @update:stream-chat="probe.options.streamChat = $event"
      @update:timeout-ms="probe.options.timeoutMs = $event"
    />

    <ModelProbeCostConfirm
      :show="showCostConfirm"
      :count="costlyPendingCount"
      @cancel="showCostConfirm = false"
      @confirm="confirmCostlyRun"
    />

    <ModelProbeDetailPage
      :show="Boolean(detailModelId)"
      :model="detailModel"
      :result="detailResult"
      :stale="probe.isStale.value"
      @close="detailModelId = undefined"
      @retry="retryModel"
    />
  </section>
</template>

<style scoped>
.probe-page {
  position: absolute;
  inset: 0;
  z-index: 2000;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  color: var(--color-on-surface);
  background: var(--color-surface);
}

.probe-header {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) 52px;
  align-items: center;
  min-height: calc(56px + env(safe-area-inset-top));
  padding: env(safe-area-inset-top) 4px 0;
  border-bottom: 1px solid var(--border-color, var(--color-outline-variant));
  background: var(--container-bg, var(--color-surface));
}

.probe-header h1 {
  overflow: hidden;
  margin: 0;
  font-size: 1.06rem;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.icon-button,
.text-button,
.select-button {
  min-width: 44px;
  min-height: 44px;
  border: 0;
  color: var(--color-primary);
  background: transparent;
}

.icon-button {
  display: grid;
  place-items: center;
  color: var(--color-on-surface);
}

.text-button:disabled,
.select-button:disabled {
  opacity: 0.45;
}

.probe-main {
  overflow-y: auto;
  padding: 14px 0 28px;
  overscroll-behavior: contain;
}

.progress-summary,
.result-summary,
.failure-distribution,
.stale-banner,
.search-box,
.filter-row,
.selection-count {
  margin-inline: 16px;
}

.progress-summary {
  margin-bottom: 14px;
}

.progress-heading,
.result-summary,
.filter-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.progress-heading {
  font-size: 0.84rem;
}

.progress-track {
  height: 4px;
  overflow: hidden;
  margin-top: 9px;
  border-radius: 2px;
  background: var(--color-surface-container-high);
}

.progress-track span {
  display: block;
  width: 100%;
  height: 100%;
  transform-origin: left;
  background: var(--color-primary);
  transition: transform 180ms ease;
}

.progress-counts {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 12px;
  margin-top: 8px;
  color: var(--color-on-surface-variant);
  font-size: 0.72rem;
}

.result-summary {
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color, var(--color-outline-variant));
  font-size: 0.8rem;
}

.result-summary strong {
  margin-right: auto;
}

.failure-distribution {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin-top: -4px;
  margin-bottom: 12px;
  color: var(--danger-color);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 0.72rem;
}

.success {
  color: var(--success-color);
}
.danger {
  color: var(--danger-color);
}

.stale-banner {
  margin-bottom: 12px;
  padding: 9px 11px;
  border-left: 3px solid var(--warning-color);
  color: var(--color-on-surface);
  background: color-mix(in srgb, var(--warning-color) 12%, transparent);
  font-size: 0.78rem;
  line-height: 1.45;
}

.search-box {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--border-color, var(--color-outline-variant));
  border-radius: var(--app-radius-md);
  color: var(--color-on-surface-variant);
  background: var(--input-bg, var(--color-surface-container));
}

.search-box input {
  width: 100%;
  min-width: 0;
  height: 42px;
  padding: 0 8px;
  border: 0;
  outline: 0;
  color: var(--color-on-surface);
  background: transparent;
  font-size: 0.9rem;
}

.filter-row {
  margin-top: 10px;
}

.filter-segments {
  display: grid;
  grid-auto-columns: minmax(64px, 1fr);
  grid-auto-flow: column;
  overflow: hidden;
  min-width: 0;
  border: 1px solid var(--border-color, var(--color-outline-variant));
  border-radius: var(--app-radius-md);
}

.filter-segments button {
  min-height: 38px;
  padding: 0 10px;
  border: 0;
  border-right: 1px solid var(--border-color, var(--color-outline-variant));
  color: var(--color-on-surface-variant);
  background: transparent;
  white-space: nowrap;
}

.filter-segments button:last-child {
  border-right: 0;
}
.filter-segments button.active {
  color: var(--color-on-primary-container);
  background: var(--color-primary-container);
  font-weight: 700;
}

.select-button {
  flex: none;
  padding: 0 4px;
  white-space: nowrap;
}

.selection-count {
  padding: 9px 0;
  color: var(--color-on-surface-variant);
  font-size: 0.75rem;
}

.filter-empty,
.footer-hint {
  color: var(--color-on-surface-variant);
  font-size: 0.78rem;
  text-align: center;
}

.filter-empty {
  padding: 36px 16px;
}

.empty-state {
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: 64px 24px;
  text-align: center;
}

.empty-state h2 {
  margin: 6px 0 0;
  font-size: 1.05rem;
}
.empty-state p {
  max-width: 26rem;
  margin: 0 0 8px;
  color: var(--color-on-surface-variant);
  font-size: 0.86rem;
  line-height: 1.55;
}

.probe-footer {
  padding: 8px 12px calc(8px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--border-color, var(--color-outline-variant));
  background: var(--container-bg, var(--color-surface));
  backdrop-filter: blur(var(--ui-blur));
}

.footer-hint {
  padding: 0 0 7px;
}

.footer-actions {
  display: grid;
  grid-template-columns: minmax(70px, auto) minmax(0, 1fr);
  gap: 9px;
}

.footer-actions button,
.empty-state .primary-button {
  min-height: 46px;
  border-radius: var(--app-radius-md);
  font-weight: 700;
}

.options-button,
.reselect-button,
.stop-button,
.primary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
}

.options-button {
  padding: 0 12px;
  border: 1px solid var(--border-color, var(--color-outline));
  color: var(--color-on-surface);
  background: transparent;
}

.reselect-button {
  padding: 0 8px;
  border: 1px solid var(--border-color, var(--color-outline));
  color: var(--color-on-surface);
  background: transparent;
  white-space: nowrap;
}

.footer-actions.three {
  grid-template-columns: 48px 82px minmax(0, 1fr);
}

.footer-actions.three .options-button span {
  display: none;
}

.stop-button {
  border: 1px solid var(--danger-color);
  color: var(--danger-color);
  background: transparent;
}

.primary-button {
  padding: 0 16px;
  border: 1px solid var(--color-primary);
  color: var(--color-on-primary);
  background: var(--color-primary);
}

.primary-button:disabled {
  border-color: var(--color-outline-variant);
  color: var(--color-on-surface-variant);
  background: var(--color-surface-container-high);
}

@media (max-width: 340px) {
  .filter-segments {
    grid-auto-columns: minmax(56px, 1fr);
  }
  .filter-segments button {
    padding-inline: 6px;
  }
  .options-button span {
    display: none;
  }
  .footer-actions {
    grid-template-columns: 48px minmax(0, 1fr);
  }
}

@media (prefers-reduced-motion: reduce) {
  .progress-track span {
    transition: none;
  }
}
</style>
