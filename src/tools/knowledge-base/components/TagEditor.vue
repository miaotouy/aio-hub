<script setup lang="ts">
import { ref } from "vue";
import { Plus, X } from "lucide-vue-next";
import type { TagWithWeight } from "../types";
import { calculateHash, normalizeTagName } from "../utils/kbUtils";

const props = defineProps<{
  modelValue: TagWithWeight[];
  title?: string;
  disabled?: boolean;
  colorType?: "primary" | "success" | "warning" | "danger" | "info";
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: TagWithWeight[]): void;
}>();

const inputValue = ref("");
const inputVisible = ref(false);

const handleClose = (tagName: string) => {
  const newValue = props.modelValue.filter((t) => t.name !== tagName);
  emit("update:modelValue", newValue);
};

const showInput = () => {
  if (props.disabled) return;
  inputVisible.value = true;
};

const handleInputConfirm = async () => {
  if (inputValue.value) {
    // 支持使用逗号或分号一次性输入多个标签，但不再使用空格拆分
    const rawNames = inputValue.value.split(/[,，;；]+/);
    const newTags = [...props.modelValue];
    let changed = false;

    for (const rawName of rawNames) {
      const normalized = normalizeTagName(rawName);
      if (normalized && !newTags.some((t) => t.name === normalized)) {
        const hash = await calculateHash(normalized);
        newTags.push({
          name: normalized,
          weight: 1.0,
          hash,
        });
        changed = true;
      }
    }

    if (changed) {
      emit("update:modelValue", newTags);
    }
  }
  inputVisible.value = false;
  inputValue.value = "";
};

const updateWeight = (tag: TagWithWeight, delta: number) => {
  if (props.disabled) return;
  const newValue = props.modelValue.map((t) => {
    if (t.name === tag.name) {
      const w = Math.max(0.1, Math.min(5.0, t.weight + delta));
      return { ...t, weight: Number(w.toFixed(1)) };
    }
    return t;
  });
  emit("update:modelValue", newValue);
};
</script>

<template>
  <div class="tag-editor-container">
    <div class="tag-list">
      <div
        v-for="tag in modelValue"
        :key="tag.name"
        class="tag-item"
        :class="[colorType ? `is-${colorType}` : '']"
      >
        <span class="tag-name">{{ tag.name }}</span>

        <div class="weight-controls" v-if="!disabled">
          <span class="weight-value">{{ tag.weight }}</span>
          <div class="weight-btns">
            <button @click="updateWeight(tag, 0.1)" class="w-btn">+</button>
            <button @click="updateWeight(tag, -0.1)" class="w-btn">-</button>
          </div>
        </div>
        <span v-else class="weight-value-readonly">{{ tag.weight }}</span>

        <button v-if="!disabled" @click="handleClose(tag.name)" class="close-btn">
          <X :size="10" />
        </button>
      </div>

      <div v-if="!disabled || modelValue.length === 0" class="add-tag-box">
        <el-input
          v-if="inputVisible"
          ref="saveTagInput"
          v-model="inputValue"
          class="tag-input"
          size="small"
          @keyup.enter="handleInputConfirm"
          @blur="handleInputConfirm"
          autofocus
        />
        <el-button
          v-else
          class="button-new-tag"
          size="small"
          :disabled="disabled"
          @click="showInput"
        >
          <Plus :size="12" />
          <span>{{ disabled ? "暂无标签" : "添加标签" }}</span>
        </el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tag-editor-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.tag-item {
  display: flex;
  align-items: center;
  background-color: var(--el-fill-color-light);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 2px 6px;
  gap: 6px;
  transition: all 0.2s;
  color: var(--el-text-color-primary);
  z-index: 1;
}

.tag-item.is-primary {
  background-color: rgba(var(--el-color-primary-rgb), 0.1);
  border-color: rgba(var(--el-color-primary-rgb), 0.2);
  color: var(--el-color-primary);
}

.tag-item.is-danger {
  background-color: rgba(var(--el-color-danger-rgb), 0.1);
  border-color: rgba(var(--el-color-danger-rgb), 0.2);
  color: var(--el-color-danger);
}

.tag-item.is-warning {
  background-color: rgba(var(--el-color-warning-rgb), 0.1);
  border-color: rgba(var(--el-color-warning-rgb), 0.2);
  color: var(--el-color-warning);
}

.tag-item.is-success {
  background-color: rgba(var(--el-color-success-rgb), 0.1);
  border-color: rgba(var(--el-color-success-rgb), 0.2);
  color: var(--el-color-success);
}

.core-icon {
  color: var(--el-color-primary);
}

.tag-name {
  font-size: 12px;
  font-weight: 500;
}

.weight-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 4px;
  border-left: 1px solid var(--border-color);
  border-right: 1px solid var(--border-color);
}

.weight-value {
  font-size: 10px;
  font-family: monospace;
  min-width: 18px;
  text-align: center;
}

.weight-value-readonly {
  font-size: 10px;
  color: var(--el-text-color-secondary);
}

.weight-btns {
  display: flex;
  flex-direction: column;
  line-height: 1;
}

.w-btn {
  border: none;
  background: none;
  padding: 0;
  margin: 0;
  cursor: pointer;
  font-size: 8px;
  height: 8px;
  color: var(--el-text-color-secondary);
}

.w-btn:hover {
  color: var(--el-color-primary);
}

.close-btn {
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  color: var(--el-text-color-placeholder);
}

.close-btn:hover {
  color: var(--el-color-danger);
}

.tag-input {
  width: 90px;
}

.button-new-tag {
  height: 24px;
  padding-top: 0;
  padding-bottom: 0;
  font-size: 12px;
}
</style>
