<script setup lang="ts">
import { computed } from "vue";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-vue-next";
import type { GreetingMessage } from "../../../types";

interface Props {
  modelValue?: GreetingMessage[];
}

interface Emits {
  (e: "update:modelValue", value: GreetingMessage[]): void;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: () => [],
});
const emit = defineEmits<Emits>();

const greetings = computed<GreetingMessage[]>({
  get: () => props.modelValue || [],
  set: (value) => emit("update:modelValue", value),
});

function cloneGreetings(): GreetingMessage[] {
  return JSON.parse(JSON.stringify(greetings.value || []));
}

function updateGreeting(index: number, patch: Partial<GreetingMessage>) {
  const next = cloneGreetings();
  next[index] = { ...next[index], ...patch };
  greetings.value = next;
}

function addGreeting() {
  const next = cloneGreetings();
  next.push({
    id: `greeting-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    name: next.length === 0 ? "默认开场白" : `开场白 ${next.length + 1}`,
    role: "assistant",
    content: "",
  });
  greetings.value = next;
}

function removeGreeting(index: number) {
  const next = cloneGreetings();
  next.splice(index, 1);
  greetings.value = next;
}

function moveGreeting(index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= greetings.value.length) return;

  const next = cloneGreetings();
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  greetings.value = next;
}
</script>

<template>
  <div class="greeting-editor">
    <div class="editor-toolbar">
      <span class="summary">{{ greetings.length }} 条开局</span>
      <el-button type="primary" size="small" @click="addGreeting">
        <Plus :size="14" />
        添加
      </el-button>
    </div>

    <el-empty
      v-if="greetings.length === 0"
      description="暂无开局消息"
      :image-size="72"
    />

    <div v-else class="greeting-list">
      <div
        v-for="(greeting, index) in greetings"
        :key="greeting.id"
        class="greeting-item"
      >
        <div class="item-header">
          <el-input
            :model-value="greeting.name"
            placeholder="开局名称"
            size="small"
            @update:model-value="
              (value: string) => updateGreeting(index, { name: value })
            "
          />
          <el-select
            :model-value="greeting.role"
            size="small"
            class="role-select"
            @update:model-value="
              (value: any) => updateGreeting(index, { role: value })
            "
          >
            <el-option label="助手" value="assistant" />
            <el-option label="用户" value="user" />
          </el-select>
          <div class="item-actions">
            <el-tooltip content="上移" placement="top">
              <button
                class="icon-btn"
                :disabled="index === 0"
                @click="moveGreeting(index, -1)"
              >
                <ArrowUp :size="14" />
              </button>
            </el-tooltip>
            <el-tooltip content="下移" placement="top">
              <button
                class="icon-btn"
                :disabled="index === greetings.length - 1"
                @click="moveGreeting(index, 1)"
              >
                <ArrowDown :size="14" />
              </button>
            </el-tooltip>
            <el-tooltip content="删除" placement="top">
              <button class="icon-btn danger" @click="removeGreeting(index)">
                <Trash2 :size="14" />
              </button>
            </el-tooltip>
          </div>
        </div>

        <el-input
          :model-value="greeting.content"
          type="textarea"
          :rows="4"
          resize="vertical"
          placeholder="输入开局内容，支持 {{char}}、{{user}} 等宏"
          @update:model-value="
            (value: string) => updateGreeting(index, { content: value })
          "
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.greeting-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.summary {
  font-size: 12px;
  color: var(--text-color-light);
}

.greeting-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.greeting-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background-color: var(--input-bg);
}

.item-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 100px auto;
  gap: 8px;
  align-items: center;
}

.role-select {
  width: 100%;
}

.item-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.icon-btn {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  color: var(--text-color-secondary);
  background-color: var(--card-bg);
  cursor: pointer;
}

.icon-btn:hover:not(:disabled) {
  color: var(--primary-color);
  border-color: var(--primary-color);
}

.icon-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.icon-btn.danger:hover {
  color: var(--error-color);
  border-color: var(--error-color);
}
</style>
