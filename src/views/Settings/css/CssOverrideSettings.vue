<script setup lang="ts">
import { ref, computed } from 'vue';
import { useCssOverrides } from '@/composables/useCssOverrides';
import RichCodeEditor from '@/components/common/RichCodeEditor.vue';
import AddCssPresetDialog from './components/AddCssPresetDialog.vue';
import { DocumentCopy, Refresh, Delete, Check, Loading, Edit, Plus, Position, QuestionFilled } from '@element-plus/icons-vue';
import { ElMessageBox } from 'element-plus';

const {
  builtInPresets,
  displayContent,
  isPreviewMode,
  saveStatus,
  isEnabled,
  currentPreset,
  canRestore,
  userSettings,
  selectPreset,
  selectCustom,
  applySelectedPreset,
  addUserPreset,
  deleteUserPreset,
  restoreToPreset,
  clearContent,
} = useCssOverrides();

const showAddDialog = ref(false);
const editorType = ref<'monaco' | 'codemirror'>('codemirror');

// 保存状态的图标和文字
const saveStatusInfo = computed(() => {
  switch (saveStatus.value) {
    case 'saving':
      return { icon: Loading, text: '保存中...', class: 'status-saving' };
    case 'saved':
      return { icon: Check, text: '已保存', class: 'status-saved' };
    case 'unsaved':
      return { icon: null, text: '未保存', class: 'status-unsaved' };
    default:
      return { icon: null, text: '', class: '' };
  }
});

// 处理预设选择
function handlePresetSelect(presetId: string | null) {
  if (presetId === null) {
    // 选择"纯自定义"
    selectCustom();
  } else {
    selectPreset(presetId);
  }
}

// 处理应用预设
function handleApplyPreset() {
  applySelectedPreset();
}

// 处理添加预设
function handleAddPreset(name: string) {
  addUserPreset(name);
}

// 处理删除预设
function handleDeletePreset(presetId: string) {
  ElMessageBox.confirm(
    '确定要删除这个预设吗？此操作不可恢复。',
    '确认删除',
    {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    }
  ).then(() => {
    deleteUserPreset(presetId);
  }).catch(() => {
    // 取消删除
  });
}

// 判断预设是否正在使用
function isPresetActive(presetId: string | null): boolean {
  return userSettings.value.basedOnPresetId === presetId;
}

// 判断预设是否被选中
function isPresetSelected(presetId: string | null): boolean {
  return userSettings.value.selectedPresetId === presetId;
}
</script>

<template>
  <div class="css-override-settings">
    <!-- 顶部控制栏 -->
    <div class="header-section">
      <div class="header-left">
        <h3>CSS 样式覆盖</h3>
        <span class="header-subtitle">自定义应用的全局样式</span>
      </div>
      <div class="header-right">
        <el-button
          type="primary"
          :icon="Position"
          :disabled="
            userSettings.selectedPresetId === userSettings.basedOnPresetId
          "
          @click="handleApplyPreset"
        >
          应用选中的预设
        </el-button>
        <div class="save-status" :class="saveStatusInfo.class">
          <el-icon v-if="saveStatusInfo.icon" :class="{ rotating: saveStatus === 'saving' }">
            <component :is="saveStatusInfo.icon" />
          </el-icon>
          <span>{{ saveStatusInfo.text }}</span>
        </div>
        <el-switch
          v-model="isEnabled"
          active-text="启用"
          inactive-text="禁用"
          size="large"
        />
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 左侧预设列表 -->
      <div class="presets-sidebar">
        <div class="sidebar-header">
          <h4>预设模板</h4>
          <el-button
            type="primary"
            :icon="Plus"
            size="small"
            @click="showAddDialog = true"
          >
            添加
          </el-button>
        </div>

        <div class="sidebar-content">
          <!-- 纯自定义选项 -->
          <div
            class="preset-item custom-item"
            :class="{
              selected: isPresetSelected(null),
              active: isPresetActive(null),
            }"
            @click="handlePresetSelect(null)"
          >
            <div class="preset-info">
              <el-icon><Edit /></el-icon>
              <span class="preset-name">纯自定义</span>
            </div>
            <span
              v-if="isPresetActive(null)"
              class="active-badge"
            >
              使用中
            </span>
          </div>

          <!-- 内置预设分组 -->
          <div class="preset-group">
            <div class="group-title">内置预设</div>
            <div
              v-for="preset in builtInPresets"
              :key="preset.id"
              class="preset-item"
              :class="{
                selected: isPresetSelected(preset.id),
                active: isPresetActive(preset.id),
              }"
              @click="handlePresetSelect(preset.id)"
            >
              <div class="preset-info">
                <el-icon><DocumentCopy /></el-icon>
                <div class="preset-text">
                  <span class="preset-name">{{ preset.name }}</span>
                  <span class="preset-desc">{{ preset.description }}</span>
                </div>
              </div>
              <span
                v-if="isPresetActive(preset.id)"
                class="active-badge"
              >
                使用中
              </span>
            </div>
          </div>

          <!-- 用户预设分组 -->
          <div v-if="userSettings.userPresets.length > 0" class="preset-group">
            <div class="group-title">我的预设</div>
            <div
              v-for="preset in userSettings.userPresets"
              :key="preset.id"
              class="preset-item user-preset"
              :class="{
                selected: isPresetSelected(preset.id),
                active: isPresetActive(preset.id),
              }"
              @click="handlePresetSelect(preset.id)"
            >
              <div class="preset-info">
                <el-icon><DocumentCopy /></el-icon>
                <div class="preset-text">
                  <span class="preset-name">{{ preset.name }}</span>
                  <span class="preset-desc">{{ preset.description }}</span>
                </div>
              </div>
              <div class="preset-actions">
                <span
                  v-if="isPresetActive(preset.id)"
                  class="active-badge"
                >
                  使用中
                </span>
                <el-button
                  size="small"
                  type="danger"
                  :icon="Delete"
                  text
                  @click.stop="handleDeletePreset(preset.id)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧编辑器 -->
      <div class="editor-section">
        <div class="section-header">
          <div class="header-left">
            <h4>自定义 CSS</h4>
            <span class="section-subtitle">
              <template v-if="isPreviewMode">
                <el-tag type="info" size="small">预览模式</el-tag>
              </template>
              <template v-else>
                {{ currentPreset ? `基于预设：${currentPreset.name}` : '完全自定义' }}
              </template>
            </span>
          </div>
          <div class="section-actions">
            <el-segmented v-model="editorType" :options="['codemirror', 'monaco']" size="small" />
            <el-button
              v-if="canRestore"
              size="small"
              :icon="Refresh"
              @click="restoreToPreset"
            >
              还原到预设
            </el-button>
            <el-button
              v-if="displayContent.trim() && !isPreviewMode"
              size="small"
              :icon="Delete"
              @click="clearContent"
            >
              清空
            </el-button>
          </div>
        </div>

        <div class="editor-wrapper">
          <RichCodeEditor
            v-model="displayContent"
            language="css"
            :line-numbers="true"
            :readonly="isPreviewMode"
            :editor-type="editorType"
          />
        </div>

        <!-- 说明提示（折叠面板） -->
        <el-collapse class="info-collapse">
          <el-collapse-item>
            <template #title>
              <div class="collapse-title">
                <el-icon class="help-icon"><QuestionFilled /></el-icon>
                <strong>使用提示</strong>
              </div>
            </template>
            <div class="alert-content">
              <ul>
                <li>自定义 CSS 会在启用时立即应用到整个应用</li>
                <li>编辑器支持自动保存，修改后会在 500ms 后自动保存</li>
                <li>可以使用 CSS 变量来适配主题，如 <code>var(--primary-color)</code></li>
                <li>选择预设后会进入预览模式（只读），点击"应用选中的预设"按钮才会应用</li>
                <li>预览模式下无法编辑，应用后即可编辑</li>
                <li>点击"添加"按钮可以将当前编辑器内容保存为新预设</li>
                <li>建议谨慎使用 <code>!important</code>，避免影响应用的正常功能</li>
              </ul>
            </div>
          </el-collapse-item>
        </el-collapse>
      </div>
    </div>

    <!-- 添加预设对话框 -->
    <AddCssPresetDialog
      v-model:visible="showAddDialog"
      @confirm="handleAddPreset"
    />
  </div>
</template>

<style scoped>
.css-override-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 0 24px 24px;
  height: 100%;
  overflow: hidden;
}

/* 顶部控制栏 */
.header-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  flex-shrink: 0;
}

.header-left h3 {
  margin: 0 0 4px 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.header-subtitle {
  font-size: 13px;
  color: var(--text-secondary);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

/* 保存状态指示器 */
.save-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  padding: 6px 12px;
  border-radius: 4px;
  border: 1px solid transparent;
  transition: all 0.3s ease;
}

.status-saved {
  color: var(--el-color-success);
  background: color-mix(in srgb, var(--el-color-success) 10%, transparent);
  border-color: var(--el-color-success);
}

.status-saving {
  color: var(--el-color-info);
  background: color-mix(in srgb, var(--el-color-info) 10%, transparent);
  border-color: var(--el-color-info);
}

.status-unsaved {
  color: var(--el-color-warning);
  background: color-mix(in srgb, var(--el-color-warning) 10%, transparent);
  border-color: var(--el-color-warning);
}

.rotating {
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* 主内容区 */
.main-content {
  display: flex;
  gap: 16px;
  flex: 1;
  background: transparent;
  overflow: hidden;
}

/* 左侧预设列表 */
.presets-sidebar {
  width: 300px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.sidebar-header h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

/* 预设项 */
.preset-item {
  padding: 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
  border: 2px solid transparent;
}

.preset-item:hover {
  background: var(--bg-color);
}

.preset-item.selected {
  background: rgba(var(--primary-color-rgb), 0.1);
  border-color: var(--primary-color);
}

.preset-item.active {
  background: rgba(var(--primary-color-rgb), 0.15);
}

.preset-item.custom-item {
  border-style: dashed;
}

.preset-item.custom-item.selected {
  border-style: solid;
}

.preset-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.preset-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.preset-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preset-desc {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preset-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 预设分组 */
.preset-group {
  margin-top: 12px;
}

.preset-group:first-child {
  margin-top: 0;
}

.group-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  padding: 8px 12px 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* 使用中徽章 */
.active-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 12px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--el-color-success) 10%, transparent);
  border: 1px solid var(--el-color-success);
  color: var(--el-color-success);
  white-space: nowrap;
}

/* 右侧编辑器 */
.editor-section {
  flex: 1;
  background: var(--card-bg);
  padding: 20px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-shrink: 0;
}

.section-header h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.section-header .header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.section-subtitle {
  font-size: 12px;
  color: var(--text-secondary);
}

.section-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.editor-wrapper {
  flex: 1;
  margin-bottom: 16px;
  border-radius: 4px;
  overflow: hidden;
  min-height: 0;
  max-height: 600px; /* 限制编辑器最大高度，防止 Monaco 无限扩展 */
  background: transparent;
}

/* 提示折叠面板 */
.info-collapse {
  flex-shrink: 0;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--card-bg);
}

.collapse-title {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 12px;
  font-size: 14px;
  color: var(--text-primary);
}

.help-icon {
  color: var(--el-color-primary);
  font-size: 16px;
}

.alert-content ul {
  margin: 8px 0 0 0;
  padding-left: 20px;
  color: var(--text-secondary);
}

.alert-content li {
  margin: 6px 0;
  font-size: 13px;
  line-height: 1.6;
}

.alert-content code {
  padding: 2px 6px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 3px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 12px;
  color: var(--primary-color);
}

/* 响应式 */
@media (max-width: 1200px) {
  .presets-sidebar {
    width: 250px;
  }
}

@media (max-width: 768px) {
  .css-override-settings {
    padding: 0 16px 16px;
    gap: 12px;
  }

  .header-section {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .header-right {
    width: 100%;
    justify-content: space-between;
  }

  .main-content {
    flex-direction: column;
  }

  .presets-sidebar {
    width: 100%;
    max-height: 300px;
  }

  .section-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .section-actions {
    width: 100%;
    flex-wrap: wrap;
  }
}

@media (max-width: 480px) {
  .css-override-settings {
    padding: 0 12px 12px;
  }

  .header-section,
  .presets-sidebar,
  .editor-section {
    padding: 16px;
  }
}
</style>