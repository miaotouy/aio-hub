<template>
  <div class="section variables-section">
    <div class="section-header">
      <h3>URL 变量</h3>
      <button @click="addNewVariable" class="btn-secondary btn-sm">+ 添加变量</button>
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
        <div v-for="variable in editableVariables" :key="variable.key" class="table-row">
          <div>
            <el-tooltip :content="variable.key || '变量名'" placement="top-start" :disabled="!variable.key">
              <input
                v-model="variable.key"
                type="text"
                placeholder="变量名"
                @blur="updateVariable(variable)"
                class="input-sm"
              />
            </el-tooltip>
          </div>

          <div>
            <select v-model="variable.type" @change="updateVariable(variable)" class="select-sm">
              <option value="string">文本</option>
              <option value="enum">枚举</option>
              <option value="boolean">布尔值</option>
            </select>
          </div>

          <div>
            <!-- 文本类型 -->
            <el-tooltip
              v-if="variable.type === 'string'"
              :content="String(variable.value) || '输入值'"
              placement="top-start"
              :disabled="!variable.value"
            >
              <input
                v-model="variable.value"
                type="text"
                :placeholder="variable.placeholder || '输入值'"
                @blur="updateVariable(variable)"
                class="input-sm"
              />
            </el-tooltip>

            <!-- 枚举类型 -->
            <div v-else-if="variable.type === 'enum'" class="enum-value-cell">
              <el-tooltip
                :content="String(variable.value) || '选择值'"
                placement="top-start"
                :disabled="!variable.value"
              >
                <select v-model="variable.value" @change="updateVariable(variable)" class="select-sm">
                  <option value="">-- 选择值 --</option>
                  <option v-for="option in variable.options || []" :key="option" :value="option">
                    {{ option }}
                  </option>
                </select>
              </el-tooltip>
              <button @click="editEnumOptions(variable)" class="btn-edit-options" title="编辑选项">
                ⚙️
              </button>
            </div>

            <!-- 布尔类型 -->
            <label v-else-if="variable.type === 'boolean'" class="checkbox-label">
              <input
                type="checkbox"
                :checked="!!variable.value"
                @change="toggleBoolean(variable)"
              />
              <span>{{ variable.value ? "是" : "否" }}</span>
            </label>
          </div>

          <div>
            <el-tooltip
              :content="variable.description || '可选说明'"
              placement="top-start"
              :disabled="!variable.description"
            >
              <input
                v-model="variable.description"
                type="text"
                placeholder="可选说明"
                @blur="updateVariable(variable)"
                class="input-sm"
              />
            </el-tooltip>
          </div>

          <div class="action-cell">
            <button @click="removeVariable(variable.key)" class="btn-delete" title="删除变量">
              ✕
            </button>
          </div>
        </div>

        <div v-if="editableVariables.length === 0" class="empty-state">
          暂无变量，点击"+ 添加变量"来创建
        </div>
      </div>
    </div>

    <!-- 枚举选项编辑对话框 -->
    <div v-if="editingEnum" class="modal-overlay" @click.self="closeEnumEditor">
      <div class="modal-content">
        <div class="modal-header">
          <h4>编辑枚举选项 - {{ editingEnum.key }}</h4>
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
import { ref, watch } from "vue";
import { useApiTesterStore } from "../store";
import type { Variable } from "../types";

const store = useApiTesterStore();

// 可编辑的变量列表
const editableVariables = ref<Variable[]>([]);

// 枚举编辑状态
const editingEnum = ref<Variable | null>(null);
const enumOptionsText = ref("");

// 从 store 加载变量
function loadVariables() {
  if (!store.selectedPreset) return;

  editableVariables.value = store.selectedPreset.variables.map((v) => ({
    ...v,
    value: store.variables[v.key] ?? v.value,
  }));
}

// 添加新变量
function addNewVariable() {
  const newVar: Variable = {
    key: `var${Date.now()}`,
    value: "",
    type: "string",
    label: "新变量",
    description: "",
  };

  editableVariables.value.push(newVar);
  store.updateVariable(newVar.key, newVar.value);
}

// 更新变量
function updateVariable(variable: Variable) {
  // 当类型改为枚举时，初始化 options
  if (variable.type === "enum" && !variable.options) {
    variable.options = [];
    variable.value = "";
  }
  // 当类型改为布尔时，设置默认值
  if (variable.type === "boolean" && typeof variable.value !== "boolean") {
    variable.value = false;
  }
  store.updateVariable(variable.key, variable.value);
}

// 切换布尔值
function toggleBoolean(variable: Variable) {
  variable.value = !variable.value;
  updateVariable(variable);
}

// 删除变量
function removeVariable(key: string) {
  const index = editableVariables.value.findIndex((v) => v.key === key);
  if (index !== -1) {
    editableVariables.value.splice(index, 1);
    store.removeVariable(key);
  }
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
  if (options.length > 0 && !options.includes(String(editingEnum.value.value))) {
    editingEnum.value.value = options[0];
  } else if (options.length === 0) {
    editingEnum.value.value = "";
  }

  updateVariable(editingEnum.value);
  closeEnumEditor();
}

// 关闭枚举编辑器
function closeEnumEditor() {
  editingEnum.value = null;
  enumOptionsText.value = "";
}

// 监听预设变化
watch(
  () => store.selectedPreset,
  () => {
    loadVariables();
  },
  { immediate: true }
);
</script>

<style scoped>
.section {
  background: var(--container-bg);
  border-radius: 8px;
  padding: 20px;
  border: 1px solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
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
  min-height: 15vh;
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
  border-bottom: 1px solid var(--border-color);
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

/* 枚举值单元格 */
.enum-value-cell {
  display: flex;
  flex-direction: row;
  gap: 8px;
  align-items: center;
  width: 100%;
}

.enum-value-cell .select-sm {
  flex: 1;
  min-width: 0;
}

.btn-edit-options {
  padding: 6px 10px;
  background: transparent;
  border: 1px solid var(--border-color);
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
  box-sizing: border-box;
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
