<script setup lang="ts">
import { computed, ref, inject } from "vue";
import { Plus, Trash2, ArrowUp, ArrowDown, Pencil } from "lucide-vue-next";
import type { GreetingMessage, MessageRole } from "../../../types";
import PresetMessageEditor from "../editors/PresetMessageEditor.vue";
import { useUserProfileStore } from "../../../stores/userProfileStore";

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

const editForm = inject<any>("agent-edit-form");
const userProfileStore = useUserProfileStore();

// 当前生效的用户档案
const effectiveUserProfile = computed(() => {
  return userProfileStore.getEffectiveProfile(editForm?.userProfileId);
});

const greetings = computed<GreetingMessage[]>({
  get: () => props.modelValue || [],
  set: (value) => emit("update:modelValue", value),
});

// 编辑器对话框状态
const editorVisible = ref(false);
const isEditMode = ref(false);
const editingIndex = ref<number>(-1);
const editorInitialForm = ref<{
  role: MessageRole;
  name?: string;
  content: string;
}>({
  role: "assistant",
  name: "",
  content: "",
});

function cloneGreetings(): GreetingMessage[] {
  return JSON.parse(JSON.stringify(greetings.value || []));
}

function addGreeting() {
  isEditMode.value = false;
  editingIndex.value = -1;
  editorInitialForm.value = {
    role: "assistant",
    name:
      greetings.value.length === 0
        ? "默认开场白"
        : `开场白 ${greetings.value.length + 1}`,
    content: "",
  };
  editorVisible.value = true;
}

function editGreeting(index: number) {
  const greeting = greetings.value[index];
  if (!greeting) return;

  isEditMode.value = true;
  editingIndex.value = index;
  editorInitialForm.value = {
    role: greeting.role,
    name: greeting.name || "",
    content: greeting.content,
  };
  editorVisible.value = true;
}

function handleEditorSave(form: {
  role: string;
  name?: string;
  content: string;
}) {
  const next = cloneGreetings();

  if (isEditMode.value && editingIndex.value >= 0) {
    // 编辑模式：更新现有条目
    next[editingIndex.value] = {
      ...next[editingIndex.value],
      role: form.role as "assistant" | "user",
      name: form.name || undefined,
      content: form.content,
    };
  } else {
    // 添加模式：新增条目
    next.push({
      id: `greeting-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      name: form.name || undefined,
      role: form.role as "assistant" | "user",
      content: form.content,
    });
  }

  greetings.value = next;
  editorVisible.value = false;
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

function truncateText(text: string, maxLength: number): string {
  if (!text) return "(空内容)";
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.substring(0, maxLength) + "...";
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
        @click="editGreeting(index)"
      >
        <div class="item-header">
          <div class="item-meta">
            <el-tag
              :type="greeting.role === 'assistant' ? 'success' : 'primary'"
              size="small"
              effect="plain"
            >
              {{ greeting.role === "assistant" ? "助手" : "用户" }}
            </el-tag>
            <span v-if="greeting.name" class="item-name">{{
              greeting.name
            }}</span>
          </div>
          <div class="item-actions" @click.stop>
            <el-tooltip content="编辑" placement="top">
              <button class="icon-btn" @click="editGreeting(index)">
                <Pencil :size="14" />
              </button>
            </el-tooltip>
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

        <div class="item-content">
          {{ truncateText(greeting.content, 120) }}
        </div>
      </div>
    </div>

    <!-- 消息编辑器 (greeting 模式) -->
    <PresetMessageEditor
      v-model:visible="editorVisible"
      :is-edit-mode="isEditMode"
      :initial-form="editorInitialForm"
      :agent-name="editForm?.name || 'Assistant'"
      :user-profile="effectiveUserProfile"
      :agent="editForm"
      :llm-think-rules="editForm?.llmThinkRules"
      :rich-text-style-options="editForm?.richTextStyleOptions"
      editor-mode="greeting"
      @save="handleEditorSave"
    />
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
  gap: 10px;
}

.greeting-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background-color: var(--card-bg);
  cursor: pointer;
  transition: all 0.2s;
}

.greeting-item:hover {
  border-color: var(--el-color-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.item-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.item-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-content {
  font-size: 13px;
  color: var(--el-text-color-regular);
  line-height: 1.5;
  word-break: break-word;
  display: -webkit-box;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.item-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
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
  transition: all 0.15s;
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

