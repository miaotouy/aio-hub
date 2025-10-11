<template>
  <div class="model-icon-settings">
    <div class="settings-header">
      <h2>模型图标配置</h2>
      <div class="header-actions">
        <button @click="showPresets = !showPresets" class="btn-secondary">
          {{ showPresets ? '隐藏预设' : '查看预设' }}
        </button>
        <button @click="handleImport" class="btn-secondary">导入配置</button>
        <button @click="handleExport" class="btn-secondary">导出配置</button>
        <button @click="handleReset" class="btn-warning">重置为默认</button>
        <button @click="handleAdd" class="btn-primary">添加配置</button>
      </div>
    </div>

    <div class="settings-stats">
      <span>总配置: {{ configs.length }}</span>
      <span>已启用: {{ enabledCount }}</span>
    </div>

    <!-- 预设图标面板 -->
    <div v-if="showPresets" class="presets-panel">
      <h3>预设图标</h3>
      <div class="presets-grid">
        <div
          v-for="preset in presetIcons"
          :key="preset.path"
          class="preset-item"
          @click="selectPreset(preset)"
        >
          <div class="preset-icon">
            <img :src="getPresetIconPath(preset.path)" :alt="preset.name" />
          </div>
          <div class="preset-info">
            <div class="preset-name">{{ preset.name }}</div>
            <div v-if="preset.suggestedFor" class="preset-tags">
              <span
                v-for="tag in preset.suggestedFor"
                :key="tag"
                class="tag"
              >
                {{ tag }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 配置列表 -->
    <div class="configs-list">
      <div
        v-for="config in sortedConfigs"
        :key="config.id"
        class="config-item"
        :class="{ disabled: config.enabled === false }"
      >
        <div class="config-icon">
          <img
            v-if="config.iconPath"
            :src="config.iconPath"
            :alt="config.matchValue"
            @error="handleImageError"
          />
          <div v-else class="icon-placeholder">?</div>
        </div>

        <div class="config-info">
          <div class="config-header">
            <span class="config-type-badge">{{ getMatchTypeLabel(config.matchType) }}</span>
            <span class="config-value">{{ config.matchValue }}</span>
            <span v-if="config.priority" class="config-priority">优先级: {{ config.priority }}</span>
          </div>
          <div v-if="config.description" class="config-description">
            {{ config.description }}
          </div>
          <div class="config-path">{{ config.iconPath }}</div>
        </div>

        <div class="config-actions">
          <button
            @click="toggleConfig(config.id)"
            class="btn-icon"
            :title="config.enabled === false ? '启用' : '禁用'"
          >
            {{ config.enabled === false ? '☐' : '☑' }}
          </button>
          <button
            @click="handleEdit(config)"
            class="btn-icon"
            title="编辑"
          >
            ✏️
          </button>
          <button
            @click="handleDelete(config.id)"
            class="btn-icon btn-danger"
            title="删除"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>

    <!-- 编辑对话框 -->
    <div v-if="editingConfig" class="modal-overlay" @click.self="closeEditor">
      <div class="modal-content">
        <div class="modal-header">
          <h3>{{ isNewConfig ? '添加配置' : '编辑配置' }}</h3>
          <button @click="closeEditor" class="btn-close">✕</button>
        </div>

        <div class="modal-body">
          <div class="form-group">
            <label>匹配类型</label>
            <select v-model="editingConfig.matchType">
              <option value="provider">Provider (提供商)</option>
              <option value="model">Model (精确模型)</option>
              <option value="modelPrefix">Model Prefix (模型前缀)</option>
              <option value="modelGroup">Model Group (模型分组)</option>
            </select>
          </div>

          <div class="form-group">
            <label>匹配值</label>
            <input
              v-model="editingConfig.matchValue"
              type="text"
              placeholder="例如: openai, gpt-, claude-opus-4"
            />
          </div>

          <div class="form-group">
            <label>图标路径</label>
            <input
              v-model="editingConfig.iconPath"
              type="text"
              placeholder="例如: /model-icons/openai.svg"
            />
            <small>支持相对路径或绝对路径，推荐使用预设图标</small>
          </div>

          <div class="form-group">
            <label>优先级</label>
            <input
              v-model.number="editingConfig.priority"
              type="number"
              min="0"
              max="100"
              placeholder="0-100，数字越大优先级越高"
            />
          </div>

          <div class="form-group">
            <label>描述</label>
            <input
              v-model="editingConfig.description"
              type="text"
              placeholder="配置说明（可选）"
            />
          </div>

          <div class="form-group checkbox-group">
            <label>
              <input
                v-model="editingConfig.enabled"
                type="checkbox"
              />
              启用此配置
            </label>
          </div>

          <div v-if="editingConfig.iconPath" class="icon-preview">
            <h4>图标预览</h4>
            <img
              :src="editingConfig.iconPath"
              alt="预览"
              @error="handleImageError"
            />
          </div>
        </div>

        <div class="modal-footer">
          <button @click="closeEditor" class="btn-secondary">取消</button>
          <button @click="handleSave" class="btn-primary">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useModelIcons } from '../../composables/useModelIcons';
import type { ModelIconConfig, IconMatchType } from '../../types/model-icons';

const {
  configs,
  presetIcons,
  enabledCount,
  addConfig,
  updateConfig,
  deleteConfig,
  toggleConfig,
  resetToDefaults,
  getPresetIconPath,
  exportConfigs,
  importConfigs,
} = useModelIcons();

const showPresets = ref(false);
const editingConfig = ref<Partial<ModelIconConfig> | null>(null);
const isNewConfig = ref(false);

// 按优先级排序的配置列表
const sortedConfigs = computed(() => {
  return [...configs.value].sort((a, b) => (b.priority || 0) - (a.priority || 0));
});

// 获取匹配类型标签
function getMatchTypeLabel(type: IconMatchType): string {
  const labels: Record<IconMatchType, string> = {
    provider: 'Provider',
    model: 'Model',
    modelPrefix: 'Prefix',
    modelGroup: 'Group',
  };
  return labels[type] || type;
}

// 选择预设图标
function selectPreset(preset: any) {
  if (editingConfig.value) {
    editingConfig.value.iconPath = getPresetIconPath(preset.path);
  }
}

// 处理添加
function handleAdd() {
  isNewConfig.value = true;
  editingConfig.value = {
    matchType: 'provider',
    matchValue: '',
    iconPath: '',
    priority: 10,
    enabled: true,
    description: '',
  };
}

// 处理编辑
function handleEdit(config: ModelIconConfig) {
  isNewConfig.value = false;
  editingConfig.value = { ...config };
}

// 处理保存
function handleSave() {
  if (!editingConfig.value) return;

  const config = editingConfig.value;
  
  // 验证必填字段
  if (!config.matchValue || !config.iconPath) {
    alert('请填写匹配值和图标路径');
    return;
  }

  let success = false;
  if (isNewConfig.value) {
    success = addConfig(config as Omit<ModelIconConfig, 'id'>);
  } else if (config.id) {
    success = updateConfig(config.id, config);
  }

  if (success) {
    closeEditor();
  } else {
    alert('保存失败，请检查配置');
  }
}

// 处理删除
function handleDelete(id: string) {
  if (confirm('确定要删除这个配置吗？')) {
    deleteConfig(id);
  }
}

// 关闭编辑器
function closeEditor() {
  editingConfig.value = null;
  isNewConfig.value = false;
}

// 处理重置
function handleReset() {
  if (confirm('确定要重置为默认配置吗？这将清除所有自定义配置。')) {
    if (resetToDefaults()) {
      alert('已重置为默认配置');
    }
  }
}

// 处理导出
function handleExport() {
  const json = exportConfigs();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `model-icons-config-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// 处理导入
function handleImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      if (importConfigs(text)) {
        alert('导入成功');
      } else {
        alert('导入失败，请检查文件格式');
      }
    } catch (error) {
      alert('导入失败: ' + error);
    }
  };
  input.click();
}

// 处理图片加载错误
function handleImageError(e: Event) {
  const img = e.target as HTMLImageElement;
  img.style.display = 'none';
}
</script>

<style scoped>
.model-icon-settings {
  padding: 1.5rem;
  max-width: 1200px;
  margin: 0 auto;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.settings-header h2 {
  margin: 0;
  font-size: 1.5rem;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
}

.settings-stats {
  display: flex;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
  padding: 0.75rem;
  background: var(--vscode-editor-background);
  border-radius: 4px;
  font-size: 0.9rem;
}

/* 预设面板 */
.presets-panel {
  margin-bottom: 2rem;
  padding: 1rem;
  background: var(--vscode-editor-background);
  border-radius: 4px;
}

.presets-panel h3 {
  margin-top: 0;
  margin-bottom: 1rem;
}

.presets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 1rem;
}

.preset-item {
  padding: 1rem;
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}

.preset-item:hover {
  border-color: var(--vscode-focusBorder);
  transform: translateY(-2px);
}

.preset-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto 0.5rem;
}

.preset-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.preset-info {
  font-size: 0.85rem;
}

.preset-name {
  font-weight: 500;
  margin-bottom: 0.25rem;
}

.preset-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  justify-content: center;
}

.tag {
  display: inline-block;
  padding: 0.125rem 0.375rem;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  border-radius: 3px;
  font-size: 0.75rem;
}

/* 配置列表 */
.configs-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.config-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;
  transition: all 0.2s;
}

.config-item.disabled {
  opacity: 0.5;
}

.config-item:hover {
  border-color: var(--vscode-focusBorder);
}

.config-icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}

.config-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.icon-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--vscode-input-background);
  border-radius: 4px;
  font-size: 1.5rem;
  color: var(--vscode-descriptionForeground);
}

.config-info {
  flex: 1;
  min-width: 0;
}

.config-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
  flex-wrap: wrap;
}

.config-type-badge {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  border-radius: 3px;
  font-size: 0.75rem;
  font-weight: 500;
}

.config-value {
  font-weight: 500;
  font-family: 'Consolas', 'Monaco', monospace;
}

.config-priority {
  font-size: 0.85rem;
  color: var(--vscode-descriptionForeground);
}

.config-description {
  font-size: 0.85rem;
  color: var(--vscode-descriptionForeground);
  margin-bottom: 0.25rem;
}

.config-path {
  font-size: 0.75rem;
  color: var(--vscode-descriptionForeground);
  font-family: 'Consolas', 'Monaco', monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.config-actions {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}

/* 按钮样式 */
.btn-primary,
.btn-secondary,
.btn-warning,
.btn-icon {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.btn-primary:hover {
  background: var(--vscode-button-hoverBackground);
}

.btn-secondary {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
}

.btn-secondary:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

.btn-warning {
  background: #f59e0b;
  color: white;
}

.btn-warning:hover {
  background: #d97706;
}

.btn-icon {
  padding: 0.375rem 0.5rem;
  background: transparent;
  border: 1px solid var(--vscode-input-border);
}

.btn-icon:hover {
  background: var(--vscode-input-background);
}

.btn-icon.btn-danger:hover {
  background: #ef4444;
  color: white;
  border-color: #ef4444;
}

/* 模态框 */
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
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  overflow: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--vscode-input-border);
}

.modal-header h3 {
  margin: 0;
}

.btn-close {
  background: transparent;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--vscode-foreground);
  padding: 0;
  width: 2rem;
  height: 2rem;
}

.btn-close:hover {
  color: var(--vscode-errorForeground);
}

.modal-body {
  padding: 1.5rem;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--vscode-input-border);
}

/* 表单 */
.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 0.5rem;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;
  font-size: 0.9rem;
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: var(--vscode-focusBorder);
}

.form-group small {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.8rem;
  color: var(--vscode-descriptionForeground);
}

.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.checkbox-group input[type="checkbox"] {
  width: auto;
  margin: 0;
}

.icon-preview {
  margin-top: 1rem;
  padding: 1rem;
  background: var(--vscode-input-background);
  border-radius: 4px;
  text-align: center;
}

.icon-preview h4 {
  margin-top: 0;
  margin-bottom: 0.75rem;
}

.icon-preview img {
  max-width: 120px;
  max-height: 120px;
}
</style>