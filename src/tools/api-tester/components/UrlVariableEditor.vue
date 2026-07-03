<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<template>
  <div class="section variables-section">
    <div class="section-header">
      <h3>URL 变量</h3>
      <el-button @click="addNewVariable" type="primary" plain
        >+ 添加变量</el-button
      >
    </div>

    <div class="variables-list">
      <div
        v-for="(variable, index) in editableVariables"
        :key="index"
        class="variable-item"
      >
        <VariableEditor
          :model-value="variable"
          @update:model-value="updateVariable(index, $event)"
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
    >
      <p class="hint">每行输入一个选项值：</p>
      <el-input
        v-model="enumOptionsText"
        type="textarea"
        :rows="8"
        placeholder="选项1&#10;选项2&#10;选项3"
      />
      <template #footer>
        <el-button @click="isEnumEditorVisible = false">取消</el-button>
        <el-button type="primary" @click="saveEnumOptions">保存</el-button>
      </template>
    </BaseDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useApiTesterStore } from "../stores/store";
import type { Variable } from "../types";
import { ElButton, ElEmpty, ElInput } from "element-plus";
import BaseDialog from "@components/common/BaseDialog.vue";
import VariableEditor from "./VariableEditor.vue";

const store = useApiTesterStore();

const editableVariables = computed<Variable[]>(
  () =>
    store.selectedPreset?.variables.map((variable) => ({
      ...variable,
      value: store.variables[variable.key] ?? variable.value,
    })) || []
);

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

  const index = editableVariables.value.findIndex(
    (variable) => variable.key === updatedVariable.key
  );
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
  border: var(--border-width) solid var(--border-color);
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
  border: var(--border-width) solid var(--border-color);
  box-sizing: border-box;
}

.hint {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--text-color-light);
}
</style>
