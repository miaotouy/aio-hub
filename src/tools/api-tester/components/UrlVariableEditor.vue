<template>
  <div class="section variables-section">
    <div class="section-header">
      <h3>URL 变量</h3>
      <el-button @click="addNewVariable" type="primary" plain>+ 添加变量</el-button>
    </div>

    <div class="variables-list">
      <div v-for="(variable, index) in editableVariables" :key="index" class="variable-item">
        <VariableEditor
          v-model="editableVariables[index]"
          @remove="removeVariable(index)"
          @edit-enum="editEnumOptions(variable)"
        />
      </div>

      <el-empty
        v-if="editableVariables.length === 0"
        description="暂无变量，点击'+ 添加变量'来创建"
        :image-size="60"
      />
    </div>

    <!-- 枚举选项编辑对话框 -->
    <BaseDialog
      v-model="isEnumEditorVisible"
      :title="`编辑枚举选项 - ${editingEnum?.key}`"
      @confirm="saveEnumOptions"
    >
      <p class="hint">每行输入一个选项值：</p>
      <el-input
        v-model="enumOptionsText"
        type="textarea"
        :rows="8"
        placeholder="选项1&#10;选项2&#10;选项3"
      />
    </BaseDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { useApiTesterStore } from "../stores/store";
import type { Variable } from "../types";
import { ElButton, ElEmpty, ElInput } from "element-plus";
import BaseDialog from "@components/common/BaseDialog.vue";
import VariableEditor from "./VariableEditor.vue";

const store = useApiTesterStore();

// 将 store 中的变量转换为可编辑的 ref
const editableVariables = computed({
  get: () =>
    store.selectedPreset?.variables.map((v: any) => ({
      ...v,
      value: store.variables[v.key] ?? v.value,
    })) || [],
  set: () => {
    // 这个 setter 主要用于 v-model 的类型兼容，实际更新通过 action
  },
});

// 枚举编辑状态
const isEnumEditorVisible = ref(false);
const editingEnum = ref<Variable | null>(null);
const enumOptionsText = ref("");

// 添加新变量
function addNewVariable() {
  const newVar: Variable = {
    key: `var${Date.now()}`,
    value: "",
    type: "string",
    label: "新变量",
    description: "",
  };
  store.addVariableDefinition(newVar);
}

// 更新变量
function updateVariable(index: number, variable: Variable) {
  store.updateVariableDefinition(index, variable);
  store.updateVariable(variable.key, variable.value);
}

// 监听 v-model 的变化
watch(
  editableVariables,
  (newVal, oldVal) => {
    if (JSON.stringify(newVal) !== JSON.stringify(oldVal)) {
      newVal.forEach((variable: any, index: number) => {
        // 检查定义或值是否有变化
        const oldVariable = oldVal.find((v: any) => v.key === variable.key);
        if (JSON.stringify(variable) !== JSON.stringify(oldVariable)) {
          updateVariable(index, variable);
        }
      });
    }
  },
  { deep: true }
);

// 删除变量
function removeVariable(index: number) {
  store.removeVariableDefinition(index);
}

// 编辑枚举选项
function editEnumOptions(variable: Variable) {
  editingEnum.value = variable;
  enumOptionsText.value = (variable.options || []).join("\n");
  isEnumEditorVisible.value = true;
}

// 保存枚举选项
function saveEnumOptions() {
  if (!editingEnum.value) return;

  const options = enumOptionsText.value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const updatedVariable = { ...editingEnum.value, options };

  // 如果当前值不在新选项中，重置
  if (options.length > 0 && !options.includes(String(updatedVariable.value))) {
    updatedVariable.value = options[0];
  } else if (options.length === 0) {
    updatedVariable.value = "";
  }

  const index = editableVariables.value.findIndex((v: any) => v.key === updatedVariable.key);
  if (index !== -1) {
    updateVariable(index, updatedVariable);
  }

  isEnumEditorVisible.value = false;
}
</script>

<style scoped>
.section {
  background: var(--container-bg);
  border-radius: 8px;
  padding: 20px;
  border: 1px solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
  box-sizing: border-box;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  box-sizing: border-box;
}

.section-header h3 {
  margin: 0;
  font-size: 18px;
  color: var(--text-color);
}

.variables-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 400px;
  overflow-y: auto;
  padding-right: 8px; /* For scrollbar */
}

.variable-item {
  background: var(--input-bg);
  padding: 10px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  box-sizing: border-box;
}

.hint {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--text-color-light);
}
</style>
