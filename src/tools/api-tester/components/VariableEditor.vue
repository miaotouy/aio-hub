<template>
  <div class="section variables-section">
    <h3>参数配置</h3>
    <div class="variables-grid">
      <div
        v-for="variable in store.selectedPreset?.variables"
        :key="variable.key"
        class="variable-item"
      >
        <label :for="`var-${variable.key}`" class="variable-label">
          {{ variable.label || variable.key }}
          <span v-if="variable.required" class="required-mark">*</span>
        </label>

        <!-- 字符串类型 -->
        <input
          v-if="variable.type === 'string'"
          :id="`var-${variable.key}`"
          type="text"
          :placeholder="variable.placeholder"
          :value="store.variables[variable.key]"
          @input="handleInput(variable.key, ($event.target as HTMLInputElement).value)"
          class="variable-input"
        />

        <!-- 枚举类型 -->
        <div v-else-if="variable.type === 'enum'" class="enum-value-cell">
          <select
            :id="`var-${variable.key}`"
            :value="store.variables[variable.key]"
            @change="handleInput(variable.key, ($event.target as HTMLSelectElement).value)"
            class="variable-select"
          >
            <option value="">-- 选择值 --</option>
            <option v-for="option in variable.options || []" :key="option" :value="option">
              {{ option }}
            </option>
          </select>
          <button @click="editEnumOptions(variable)" class="btn-edit-options" title="编辑选项">
            ⚙️
          </button>
        </div>

        <!-- 布尔类型 -->
        <label v-else-if="variable.type === 'boolean'" class="variable-checkbox">
          <input
            :id="`var-${variable.key}`"
            type="checkbox"
            :checked="!!store.variables[variable.key]"
            @change="handleInput(variable.key, ($event.target as HTMLInputElement).checked)"
          />
          <span class="checkbox-label">启用</span>
        </label>
      </div>
    </div>

    <!-- 枚举选项编辑对话框 -->
    <div v-if="editingEnum" class="modal-overlay" @click.self="closeEnumEditor">
      <div class="modal-content">
        <div class="modal-header">
          <h4>编辑枚举选项 - {{ editingEnum.label || editingEnum.key }}</h4>
          <button @click="closeEnumEditor" class="btn-close">✕</button>
        </div>
        <div class="modal-body">
          <p class="hint">每行输入一个选项值：</p>
          <textarea
            v-model="enumOptionsText"
            placeholder="选项1&#10;选项2&#10;选项3"
            rows="8"
            class="options-textarea"
          ></textarea>
          <div class="modal-actions">
            <button @click="saveEnumOptions" class="btn-primary">✓ 保存</button>
            <button @click="closeEnumEditor" class="btn-cancel">✕ 取消</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useApiTesterStore } from "../store";
import type { Variable } from "../types";

const store = useApiTesterStore();

// 枚举编辑状态
const editingEnum = ref<Variable | null>(null);
const enumOptionsText = ref("");

function handleInput(key: string, value: string | boolean) {
  store.updateVariable(key, value);
}

// 编辑枚举选项
function editEnumOptions(variable: Variable) {
  editingEnum.value = variable;
  enumOptionsText.value = (variable.options || []).join("\n");
}

// 保存枚举选项
function saveEnumOptions() {
  if (!editingEnum.value) return;

  const options = enumOptionsText.value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  editingEnum.value.options = options;

  // 如果当前值不在新选项中，重置为第一个选项或空字符串
  const currentValue = store.variables[editingEnum.value.key];
  if (options.length > 0 && !options.includes(String(currentValue))) {
    store.updateVariable(editingEnum.value.key, options[0]);
  } else if (options.length === 0) {
    store.updateVariable(editingEnum.value.key, "");
  }

  closeEnumEditor();
}

// 关闭枚举编辑器
function closeEnumEditor() {
  editingEnum.value = null;
  enumOptionsText.value = "";
}
</script>

<style scoped>
.section {
  background: var(--container-bg);
  border-radius: 8px;
  padding: 20px;
  border: 1px solid var(--border-color);
}

.section h3 {
  margin: 0 0 16px 0;
  font-size: 18px;
  color: var(--text-color);
}

.variables-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.variable-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.variable-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

.required-mark {
  color: var(--error-color);
}

.variable-input,
.variable-select {
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 14px;
  background: var(--input-bg);
  color: var(--text-color);
}

.variable-input:focus,
.variable-select:focus {
  outline: none;
  border-color: var(--primary-color);
}

.variable-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.variable-checkbox input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.variable-checkbox .checkbox-label {
  color: var(--text-color);
}

/* 枚举值单元格 */
.enum-value-cell {
  display: flex;
  flex-direction: row;
  gap: 8px;
  align-items: center;
  width: 100%;
}

.enum-value-cell .variable-select {
  flex: 1;
  min-width: 0;
}

.btn-edit-options {
  padding: 6px 10px;
  background: var(--primary-color);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
  flex-shrink: 0;
}

.btn-edit-options:hover {
  background: var(--primary-hover-color);
  transform: scale(1.05);
}

/* 模态框样式 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--container-bg);
  border-radius: 8px;
  width: 90%;
  max-width: 500px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h4 {
  margin: 0;
  font-size: 16px;
  color: var(--text-color);
}

.modal-body {
  padding: 20px;
}

.hint {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--text-color-light);
}

.options-textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 14px;
  font-family: monospace;
  background: var(--input-bg);
  color: var(--text-color);
  resize: vertical;
  min-height: 150px;
}

.options-textarea:focus {
  outline: none;
  border-color: var(--primary-color);
}

.modal-actions {
  display: flex;
  gap: 12px;
  margin-top: 16px;
  justify-content: flex-end;
}

.btn-primary,
.btn-cancel {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--primary-color);
  color: white;
}

.btn-primary:hover {
  background: var(--primary-hover-color);
}

.btn-cancel {
  background: var(--border-color);
  color: var(--text-color);
}

.btn-cancel:hover {
  background: var(--border-color-light);
}

.btn-close {
  background: transparent;
  border: none;
  font-size: 20px;
  line-height: 1;
  color: var(--text-color);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.2s;
}

.btn-close:hover {
  background: var(--border-color);
}
</style>
