<template>
  <div class="section variables-section">
    <div class="section-header">
      <h3>URL 变量</h3>
      <button @click="addNewVariable" class="btn-secondary btn-sm">
        + 添加变量
      </button>
    </div>

    <div class="variables-table">
      <div class="table-header">
        <div>变量名</div>
        <div>类型</div>
        <div>值</div>
        <div>说明</div>
        <div>操作</div>
      </div>

      <div class="table-body">
        <div
          v-for="variable in editableVariables"
          :key="variable.key"
          class="table-row"
        >
          <div>
            <input
              v-model="variable.key"
              type="text"
              placeholder="变量名"
              @blur="updateVariable(variable)"
              class="input-sm"
            />
          </div>

          <div>
            <select
              v-model="variable.type"
              @change="updateVariable(variable)"
              class="select-sm"
            >
              <option value="string">文本</option>
              <option value="enum">枚举</option>
              <option value="boolean">布尔值</option>
            </select>
          </div>

          <div>
            <!-- 文本类型 -->
            <input
              v-if="variable.type === 'string'"
              v-model="variable.value"
              type="text"
              :placeholder="variable.placeholder || '输入值'"
              @blur="updateVariable(variable)"
              class="input-sm"
            />

            <!-- 枚举类型 -->
            <select
              v-else-if="variable.type === 'enum'"
              v-model="variable.value"
              @change="updateVariable(variable)"
              class="select-sm"
            >
              <option
                v-for="option in variable.options"
                :key="option"
                :value="option"
              >
                {{ option }}
              </option>
            </select>

            <!-- 布尔类型 -->
            <label v-else-if="variable.type === 'boolean'" class="checkbox-label">
              <input
                type="checkbox"
                :checked="!!variable.value"
                @change="toggleBoolean(variable)"
              />
              <span>{{ variable.value ? '是' : '否' }}</span>
            </label>
          </div>

          <div>
            <input
              v-model="variable.description"
              type="text"
              placeholder="可选说明"
              @blur="updateVariable(variable)"
              class="input-sm"
            />
          </div>

          <div class="action-cell">
            <button
              @click="removeVariable(variable.key)"
              class="btn-delete"
              title="删除变量"
            >
              ✕
            </button>
          </div>
        </div>

        <div v-if="editableVariables.length === 0" class="empty-state">
          暂无变量，点击"+ 添加变量"来创建
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useApiTesterStore } from '../store';
import type { Variable } from '../types';

const store = useApiTesterStore();

// 可编辑的变量列表
const editableVariables = ref<Variable[]>([]);

// 从 store 加载变量
function loadVariables() {
  if (!store.selectedPreset) return;
  
  editableVariables.value = store.selectedPreset.variables.map(v => ({
    ...v,
    value: store.variables[v.key] ?? v.value,
  }));
}

// 添加新变量
function addNewVariable() {
  const newVar: Variable = {
    key: `var${Date.now()}`,
    value: '',
    type: 'string',
    label: '新变量',
    description: '',
  };
  
  editableVariables.value.push(newVar);
  store.updateVariable(newVar.key, newVar.value);
}

// 更新变量
function updateVariable(variable: Variable) {
  store.updateVariable(variable.key, variable.value);
}

// 切换布尔值
function toggleBoolean(variable: Variable) {
  variable.value = !variable.value;
  updateVariable(variable);
}

// 删除变量
function removeVariable(key: string) {
  const index = editableVariables.value.findIndex(v => v.key === key);
  if (index !== -1) {
    editableVariables.value.splice(index, 1);
    store.removeVariable(key);
  }
}

// 监听预设变化
watch(() => store.selectedPreset, () => {
  loadVariables();
}, { immediate: true });
</script>

<style scoped>
.section {
  background: var(--container-bg);
  border-radius: 8px;
  padding: 20px;
  border: 1px solid var(--border-color);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-header h3 {
  margin: 0;
  font-size: 18px;
  color: var(--text-color);
}

.variables-table {
  background: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
}

.table-header,
.table-row {
  display: grid;
  grid-template-columns: 1.5fr 1fr 2fr 2fr 0.5fr;
  gap: 12px;
  align-items: center;
  padding: 12px 16px;
}

.table-header {
  background: var(--container-bg);
  font-weight: 500;
  font-size: 13px;
  color: var(--text-color-light);
  border-bottom: 1px solid var(--border-color);
}

.table-body {
  max-height: 400px;
  overflow-y: auto;
}

.table-row {
  border-bottom: 1px solid var(--border-color-light);
  transition: background-color 0.2s;
}

.table-row:last-child {
  border-bottom: none;
}

.table-row:hover {
  background: var(--border-color-light);
}

.input-sm,
.select-sm {
  width: 100%;
  padding: 6px 10px;
  font-size: 14px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--input-bg);
  color: var(--text-color);
  transition: border-color 0.2s;
}

.input-sm:focus,
.select-sm:focus {
  outline: none;
  border-color: var(--primary-color);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.checkbox-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.checkbox-label span {
  font-size: 14px;
  color: var(--text-color);
}

.action-cell {
  display: flex;
  justify-content: center;
}

.btn-delete {
  background: transparent;
  border: none;
  color: var(--error-color);
  font-size: 18px;
  font-weight: bold;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s;
}

.btn-delete:hover {
  background: rgba(245, 108, 108, 0.1);
  transform: scale(1.1);
}

.btn-secondary {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  background: var(--primary-color);
  color: white;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: var(--primary-hover-color);
}

.btn-sm {
  padding: 6px 12px;
  font-size: 13px;
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-color-light);
  font-size: 14px;
}
</style>