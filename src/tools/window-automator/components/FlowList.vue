<script setup lang="ts">
/**
 * 方案大厅（一级页）
 *
 * 展示所有已保存的方案卡片，每张卡片支持：
 *  - 一键启动（无需进入编辑）；
 *  - 进入编辑页；
 *  - 重命名（双击名称或点击编辑图标）；
 *  - 复制 / 删除。
 *
 * 顶部工具栏：新建方案、导入方案。
 */
import { ref, computed, onMounted } from "vue";
import {
  Plus,
  Play,
  Pencil,
  Copy,
  Trash2,
  Upload,
  Sparkles,
  CircleAlert,
} from "lucide-vue-next";
import { useWindowAutomatorStore } from "../stores/windowAutomator.store";
import { useFlowPersistence } from "../composables/useFlowPersistence";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { customMessage } from "@/utils/customMessage";
import { ElMessageBox } from "element-plus";
import type { ActionFlow } from "../types";

const errorHandler = createModuleErrorHandler("window-automator/FlowList");

const store = useWindowAutomatorStore();
const persistence = useFlowPersistence();
const importing = ref(false);
const loadingAll = ref(false);
const renamingId = ref<string | null>(null);
const renameValue = ref("");

const flows = computed(() => store.savedFlows);

async function reload() {
  loadingAll.value = true;
  const all = await persistence.loadAll();
  store.setSavedFlows(all);
  loadingAll.value = false;
}

function onNew() {
  const flow = store.createFlow("新方案");
  void persistence.save(flow);
  store.enterFlow(flow.id);
  customMessage.success("已创建新方案");
}

function openFlow(flow: ActionFlow) {
  store.enterFlow(flow.id);
}

function quickStart(flow: ActionFlow) {
  if (flow.steps.length === 0) {
    customMessage.warning("方案无步骤，无法启动");
    return;
  }
  if (!store.boundWindow) {
    customMessage.warning("请先在编辑页绑定目标窗口");
    return;
  }
  if (store.runtime.status !== "idle") {
    customMessage.warning("已有方案在运行");
    return;
  }
  // 触发自定义事件由父组件唤起执行器
  emit("quick-start", flow);
}

function duplicate(flow: ActionFlow) {
  const cloned = store.duplicateFlow(flow.id);
  if (cloned) {
    void persistence.save(cloned);
    customMessage.success("已复制方案");
  }
}

async function remove(flow: ActionFlow) {
  try {
    await ElMessageBox.confirm(
      `确定要删除方案 "${flow.name}" 吗？此操作无法撤销。`,
      "删除方案",
      {
        confirmButtonText: "删除",
        cancelButtonText: "取消",
        type: "warning",
        lockScroll: false,
      }
    );
  } catch {
    return;
  }
  const ok = await persistence.remove(flow.id);
  if (ok) {
    store.deleteFlow(flow.id);
    customMessage.success("已删除");
  }
}

function beginRename(flow: ActionFlow) {
  renamingId.value = flow.id;
  renameValue.value = flow.name;
}

function commitRename(flow: ActionFlow) {
  if (renamingId.value !== flow.id) return;
  const name = renameValue.value.trim() || flow.name;
  store.updateFlow(flow.id, { name });
  const updated = store.savedFlows.find((f) => f.id === flow.id);
  if (updated) void persistence.save(updated);
  renamingId.value = null;
}

function cancelRename() {
  renamingId.value = null;
  renameValue.value = "";
}

async function onImport() {
  importing.value = true;
  try {
    // 简化导入：粘贴 JSON 文本（避免新增 file dialog 依赖项）
    const { value } = await ElMessageBox.prompt(
      "粘贴方案 JSON 文本：",
      "导入方案",
      {
        confirmButtonText: "导入",
        cancelButtonText: "取消",
        inputType: "textarea",
        inputPlaceholder: "在此粘贴从其它窗口导出的方案 JSON",
        lockScroll: false,
        inputValidator: (val) => {
          if (!val || !val.trim()) return "请输入方案 JSON";
          const parsed = persistence.parseFlow(val);
          if (!parsed) return "JSON 格式无效";
          return true;
        },
      }
    );
    if (!value) return;
    const parsed = persistence.parseFlow(value);
    if (!parsed) {
      customMessage.error("方案 JSON 解析失败");
      return;
    }
    // 重置 id 防止冲突
    parsed.id = `${parsed.id}-import-${Date.now()}`;
    parsed.createdAt = new Date().toISOString();
    parsed.updatedAt = parsed.createdAt;
    parsed.steps = parsed.steps.map((s) => ({
      ...s,
      id: `${s.id}-${Math.random().toString(36).slice(2, 6)}`,
    }));
    store.addFlow(parsed);
    await persistence.save(parsed);
    customMessage.success("方案导入成功");
  } catch (e) {
    if ((e as { type?: string }).type !== "cancel") {
      errorHandler.error(e, "导入方案失败");
    }
  } finally {
    importing.value = false;
  }
}

function exportFlow(flow: ActionFlow) {
  const text = persistence.exportFlow(flow);
  // 复制到剪贴板
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(() => customMessage.success("已复制到剪贴板"))
      .catch(() => customMessage.warning("复制失败，请手动复制"));
  } else {
    customMessage.warning("当前环境不支持自动复制，请手动操作");
  }
}

const emit = defineEmits<{
  (e: "quick-start", flow: ActionFlow): void;
}>();

onMounted(async () => {
  await reload();
});

// ─── Reveal Highlight (Win10 磁贴边缘照亮) ───
const gridRef = ref<HTMLElement | null>(null);
let rafId: number | null = null;
let lastMouseX = 0;
let lastMouseY = 0;

function updateGlow() {
  rafId = null;
  if (!gridRef.value) return;
  const cards = gridRef.value.querySelectorAll<HTMLElement>(".card");
  const cx = lastMouseX;
  const cy = lastMouseY;
  cards.forEach((card) => {
    const rect = card.getBoundingClientRect();
    const x = cx - rect.left;
    const y = cy - rect.top;
    card.style.setProperty("--mouse-x", `${x}px`);
    card.style.setProperty("--mouse-y", `${y}px`);

    // 计算鼠标到卡片矩形最近边缘的距离（内部为 0）
    const dx = Math.max(rect.left - cx, 0, cx - rect.right);
    const dy = Math.max(rect.top - cy, 0, cy - rect.bottom);
    const dist = Math.sqrt(dx * dx + dy * dy);

    // 判断鼠标是否在卡片内部
    const isInside = dist === 0;
    card.style.setProperty("--is-hovered", isInside ? "1" : "0");

    // 最大感应距离（px），超出则完全不亮
    const maxDist = 150;
    const intensity = Math.max(0, 1 - dist / maxDist);
    card.style.setProperty("--glow-opacity", `${intensity}`);
  });
}

function handleGridMouseMove(e: MouseEvent) {
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  if (rafId === null) {
    rafId = requestAnimationFrame(updateGlow);
  }
}

function handleGridMouseLeave() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (!gridRef.value) return;
  const cards = gridRef.value.querySelectorAll<HTMLElement>(".card");
  cards.forEach((card) => {
    card.style.setProperty("--glow-opacity", "0");
    card.style.setProperty("--is-hovered", "0");
  });
}
</script>

<template>
  <div
    class="flow-list"
    @mousemove="handleGridMouseMove"
    @mouseleave="handleGridMouseLeave"
  >
    <div class="page-header">
      <div class="left">
        <Sparkles :size="18" />
        <h2 class="title">方案大厅</h2>
        <span class="count">{{ flows.length }} 个方案</span>
      </div>
      <div class="right">
        <el-button :icon="Upload" :loading="importing" @click="onImport"
          >导入</el-button
        >
        <el-button type="primary" :icon="Plus" @click="onNew"
          >新建方案</el-button
        >
      </div>
    </div>

    <div class="flow-list-body">
      <div v-if="loadingAll" class="loading">加载中…</div>
      <div v-else-if="flows.length === 0" class="empty">
        <div class="empty-icon">
          <Sparkles :size="48" />
        </div>
        <p class="empty-title">还没有任何方案</p>
        <p class="empty-hint">点击右上角"新建方案"开始你的第一个自动化流程</p>
        <el-button type="primary" :icon="Plus" @click="onNew"
          >新建方案</el-button
        >
      </div>

      <div v-else ref="gridRef" class="grid">
        <div v-for="flow in flows" :key="flow.id" class="card">
          <div class="card-glow-border" />
          <div class="card-glow-bg" />
          <div class="card-header">
            <template v-if="renamingId === flow.id">
              <el-input
                v-model="renameValue"
                size="small"
                @keyup.enter="commitRename(flow)"
                @keyup.esc="cancelRename"
                @blur="commitRename(flow)"
              />
            </template>
            <template v-else>
              <h3
                class="card-title"
                @dblclick="beginRename(flow)"
                :title="flow.name"
              >
                {{ flow.name }}
              </h3>
              <el-tooltip content="重命名" placement="top">
                <el-button
                  link
                  size="small"
                  :icon="Pencil"
                  @click="beginRename(flow)"
                />
              </el-tooltip>
            </template>
          </div>

          <div class="card-meta">
            <div class="meta-row">
              <span class="meta-label">步骤数</span>
              <span class="meta-value">{{ flow.steps.length }}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">目标窗口</span>
              <span class="meta-value" :class="{ unbound: !flow.targetWindow }">
                {{ flow.targetWindow?.title || "未绑定" }}
              </span>
            </div>
            <div class="meta-row">
              <span class="meta-label">更新时间</span>
              <span class="meta-value">{{
                new Date(flow.updatedAt).toLocaleString()
              }}</span>
            </div>
          </div>

          <div
            v-if="
              store.runtime.currentFlowId === flow.id &&
              store.runtime.status !== 'idle'
            "
            class="running-indicator"
          >
            <span class="dot" :class="store.runtime.status"></span>
            <span>{{
              store.runtime.status === "running"
                ? "运行中"
                : store.runtime.status === "paused"
                  ? "已暂停"
                  : "停止中"
            }}</span>
          </div>

          <div class="card-actions">
            <el-button
              type="primary"
              :icon="Play"
              @click="quickStart(flow)"
              :disabled="
                store.runtime.status !== 'idle' ||
                !store.boundWindow ||
                flow.steps.length === 0
              "
            >
              启动
            </el-button>
            <el-button :icon="Pencil" @click="openFlow(flow)">编辑</el-button>
            <el-tooltip content="复制" placement="top">
              <el-button :icon="Copy" link @click="duplicate(flow)" />
            </el-tooltip>
            <el-tooltip content="导出 JSON" placement="top">
              <el-button link @click="exportFlow(flow)">JSON</el-button>
            </el-tooltip>
            <el-tooltip content="删除" placement="top">
              <el-button :icon="Trash2" link @click="remove(flow)" />
            </el-tooltip>
          </div>

          <div v-if="!store.boundWindow && flow.steps.length > 0" class="warn">
            <CircleAlert :size="14" />
            <span>请先在编辑页绑定目标窗口</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.flow-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 16px;
  overflow: hidden;
}
.flow-list-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-bottom: 8px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.page-header .left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}
.count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.right {
  display: flex;
  gap: 8px;
}
.loading,
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px;
}
.empty-icon {
  color: var(--el-color-primary);
  opacity: 0.5;
}
.empty-title {
  font-size: 16px;
  font-weight: 500;
  margin: 0;
}
.empty-hint {
  color: var(--el-text-color-secondary);
  margin: 0 0 8px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
  align-content: start;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  transition: all 0.15s;
  position: relative;
  --mouse-x: 50%;
  --mouse-y: 50%;
  --glow-opacity: 0;
  --is-hovered: 0;
}
.card:hover {
  border-color: rgba(var(--primary-color-rgb, 64, 158, 255), 0.6);
  background-color: rgba(
    var(--primary-color-rgb, 64, 158, 255),
    calc(var(--card-opacity, 1) * 0.03)
  );
}

/* 边框发光层 - 模拟 Win10 Reveal Border */
.card-glow-border {
  position: absolute;
  inset: -2px;
  border-radius: inherit;
  pointer-events: none;
  z-index: 1;
  opacity: calc(var(--glow-opacity) * (1 - var(--is-hovered)));
  background: radial-gradient(
    300px circle at var(--mouse-x) var(--mouse-y),
    rgba(var(--primary-color-rgb, 64, 158, 255), 0.8) 0%,
    transparent 100%
  );
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  mask-composite: exclude;
  padding: 1.5px;
}

/* 背景微光层 */
.card-glow-bg {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  z-index: 0;
  opacity: calc(var(--glow-opacity) * (1 - var(--is-hovered) * 0.6));
  background: radial-gradient(
    250px circle at var(--mouse-x) var(--mouse-y),
    rgba(var(--primary-color-rgb, 64, 158, 255), 0.08) 0%,
    transparent 100%
  );
}

.card-header {
  display: flex;
  gap: 4px;
  align-items: center;
  position: relative;
  z-index: 2;
}
.card-title {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.card-title:hover {
  color: var(--el-color-primary);
}
.card-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 0;
  position: relative;
  z-index: 2;
}
.meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.meta-label {
  color: var(--el-text-color-secondary);
}
.meta-value {
  color: var(--el-text-color-primary);
  font-weight: 500;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta-value.unbound {
  color: var(--el-color-warning);
}
.running-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background-color: var(--el-fill-color-light);
  padding: 2px 8px;
  border-radius: 10px;
  align-self: flex-start;
  position: relative;
  z-index: 2;
}
.running-indicator .dot {
  width: 6px;
  height: 6px;
  border-radius: 3px;
  background-color: var(--el-color-info);
}
.running-indicator .dot.running {
  background-color: var(--el-color-success);
  animation: pulse 1.2s infinite;
}
.running-indicator .dot.paused {
  background-color: var(--el-color-warning);
}
.running-indicator .dot.stopping {
  background-color: var(--el-color-danger);
}
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}
.card-actions {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-wrap: wrap;
  position: relative;
  z-index: 2;
}
.warn {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--el-color-warning);
  font-size: 12px;
  position: relative;
  z-index: 2;
}
</style>
