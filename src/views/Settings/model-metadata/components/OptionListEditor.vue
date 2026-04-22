<template>
  <div class="option-list-editor">
    <div v-if="modelValue.length > 0" class="options-container">
      <div v-for="(item, index) in modelValue" :key="index" class="option-row">
        <el-input v-model="item.label" placeholder="显示标签" class="label-input" />
        <el-input v-model="item.value" placeholder="参数值" class="value-input" @blur="handleValueBlur(index)" />
        <el-button type="danger" :icon="Delete" circle @click="removeOption(index)" />
      </div>
    </div>
    <div v-else class="empty-options">暂无选项</div>
    <el-button type="primary" :icon="Plus" plain @click="addOption" class="add-btn">添加选项</el-button>
  </div>
</template>

<script setup lang="ts">
import { Plus, Delete } from "@element-plus/icons-vue";

interface Option {
  label: string;
  value: string;
}

const props = defineProps<{
  modelValue: Option[];
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: Option[]): void;
}>();

function addOption() {
  const newList = [...props.modelValue, { label: "", value: "" }];
  emit("update:modelValue", newList);
}

function removeOption(index: number) {
  const newList = [...props.modelValue];
  newList.splice(index, 1);
  emit("update:modelValue", newList);
}

function handleValueBlur(index: number) {
  const item = props.modelValue[index];
  // 如果 label 为空，自动使用 value 填充
  if (item.value && !item.label) {
    item.label = item.value;
  }
}
</script>

<style scoped>
.option-list-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.options-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.option-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.label-input {
  flex: 1;
}

.value-input {
  flex: 1;
}

.empty-options {
  font-size: 12px;
  color: var(--text-color-light);
  text-align: center;
  padding: 10px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
}

.add-btn {
  align-self: flex-start;
}
</style>
