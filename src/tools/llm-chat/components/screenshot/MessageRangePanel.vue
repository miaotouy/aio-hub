<!--
  顶部消息范围 + 筛选 + 精细列表面板。
  - 父组件通过 v-model:range 双向绑定范围, v-model:selectedIds 接收选中的消息 ID 集合。
  - 父组件用 :key + v-if 触发重挂载以重置 range (基于 initialFocusMessageId)。
  - 本地 watch(range) 自动将范围同步到 selectedIds (范围选择), 精细列表勾选会覆盖范围。
-->
<template>
  <section class="top-panel">
    <div class="range-row">
      <div class="range-label">消息范围</div>
      <el-slider
        v-model="range"
        range
        :min="0"
        :max="maxRange"
        :step="1"
        class="range-slider"
        :show-tooltip="true"
      />
      <div class="range-inputs">
        <el-input-number
          v-model="range[0]"
          :min="0"
          :max="range[1]"
          size="small"
          controls-position="right"
        />
        <span class="range-separator">至</span>
        <el-input-number
          v-model="range[1]"
          :min="range[0]"
          :max="maxRange"
          size="small"
          controls-position="right"
        />
        <span class="range-total">/ 共 {{ total }} 条</span>
      </div>
    </div>

    <div class="filter-row">
      <el-button size="small" @click="selectAll">全选</el-button>
      <el-button size="small" @click="clearAll">清空</el-button>
      <el-button size="small" @click="selectOnlyUser">仅用户</el-button>
      <el-button size="small" @click="selectOnlyAssistant">仅助手</el-button>
      <div class="filter-spacer" />
      <span class="filter-count">
        已选 <strong>{{ selectedIds.size }}</strong> / {{ total }} 条
      </span>
      <el-button
        size="small"
        text
        @click="fineListExpanded = !fineListExpanded"
      >
        <el-icon>
          <component :is="fineListExpanded ? ChevronDown : ChevronRight" />
        </el-icon>
        精细列表
      </el-button>
    </div>

    <transition name="el-fade-in">
      <div v-if="fineListExpanded" class="fine-list">
        <div
          v-for="msg in messages"
          :key="msg.id"
          class="fine-list-item"
          :class="{ 'is-selected': selectedIds.has(msg.id) }"
          @click="toggleMessageSelection(msg.id)"
        >
          <el-checkbox
            :model-value="selectedIds.has(msg.id)"
            @click.stop="toggleMessageSelection(msg.id)"
          />
          <span class="fine-role" :class="`role-${msg.role}`">
            {{
              msg.role === "user"
                ? "用户"
                : msg.role === "assistant"
                  ? "助手"
                  : msg.role === "tool"
                    ? "工具"
                    : "系统"
            }}
          </span>
          <el-tooltip :content="msg.content" placement="top" :show-after="500">
            <span class="fine-summary">{{ getMessageSummary(msg) }}</span>
          </el-tooltip>
        </div>
      </div>
    </transition>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  ElButton,
  ElCheckbox,
  ElIcon,
  ElInputNumber,
  ElSlider,
  ElTooltip,
} from "element-plus";
import { ChevronDown, ChevronRight } from "lucide-vue-next";
import type { ChatMessageNode } from "../../types";

interface Props {
  messages: ChatMessageNode[];
}

const props = defineProps<Props>();

const range = defineModel<[number, number]>("range", { required: true });
const selectedIds = defineModel<Set<string>>("selectedIds", { required: true });

const fineListExpanded = ref(false);

const total = computed(() => props.messages.length);
const maxRange = computed(() => Math.max(0, total.value - 1));

// 范围变化时同步 selectedIds (父组件用 :key 重挂载触发初始设置)
watch(
  range,
  ([s, e]) => {
    selectedIds.value = new Set(
      props.messages.slice(s, e + 1).map((m) => m.id)
    );
  },
  { immediate: false, deep: true }
);

function getMessageSummary(msg: ChatMessageNode): string {
  const text = (msg.content ?? "").replace(/\s+/g, " ").trim();
  return text.length > 60 ? `${text.slice(0, 60)}\u2026` : text;
}

function toggleMessageSelection(id: string) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
}

function setQuickFilter(predicate: (m: ChatMessageNode) => boolean) {
  selectedIds.value = new Set(
    props.messages.filter(predicate).map((m) => m.id)
  );
}

function selectAll() {
  selectedIds.value = new Set(props.messages.map((m) => m.id));
}
function clearAll() {
  selectedIds.value = new Set();
}
function selectOnlyUser() {
  setQuickFilter((m) => m.role === "user");
}
function selectOnlyAssistant() {
  setQuickFilter((m) => m.role === "assistant" || m.role === "tool");
}
</script>

<style scoped>
.top-panel {
  flex-shrink: 0;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 12px;
  background: var(--card-bg);
}
.range-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.range-label {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}
.range-slider {
  flex: 1;
  min-width: 200px;
}
.range-inputs {
  display: flex;
  align-items: center;
  gap: 4px;
}
.range-separator {
  color: var(--text-color-secondary);
  font-size: 12px;
}
.range-total {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-left: 4px;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.filter-spacer {
  flex: 1;
}
.filter-count {
  font-size: 12px;
  color: var(--text-color-secondary);
}
.filter-count strong {
  color: var(--primary-color);
  font-weight: 600;
  margin: 0 2px;
}

.fine-list {
  max-height: 180px;
  overflow-y: auto;
  border-top: 1px solid var(--border-color);
  margin-top: 8px;
  padding-top: 8px;
}
.fine-list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.15s;
}
.fine-list-item:hover {
  background: var(--input-bg);
}
.fine-list-item.is-selected {
  background: color-mix(in srgb, var(--primary-color) 8%, transparent);
}
.fine-role {
  font-weight: 500;
  white-space: nowrap;
}
.fine-role.role-user {
  color: var(--primary-color);
}
.fine-role.role-assistant {
  color: var(--success-color);
}
.fine-role.role-tool {
  color: var(--warning-color);
}
.fine-role.role-system {
  color: var(--info-color);
}
.fine-summary {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-color-secondary);
}
</style>

