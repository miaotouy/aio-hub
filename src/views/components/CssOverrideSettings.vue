<script setup lang="ts">
import { computed } from 'vue';
import { useCssOverrides } from '@/composables/useCssOverrides';
import RichCodeEditor from '@/components/common/RichCodeEditor.vue';
import { DocumentCopy, Refresh, Delete, Check, Loading, Edit } from '@element-plus/icons-vue';

const {
  presets,
  editorContent,
  saveStatus,
  isEnabled,
  currentPreset,
  canRestore,
  selectPreset,
  restoreToPreset,
  switchToCustom,
  clearContent,
} = useCssOverrides();

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

    <!-- 预设模板 -->
    <div class="presets-section">
      <div class="section-header">
        <h4>预设模板</h4>
        <span class="section-subtitle">快速应用内置样式主题</span>
      </div>
      <div class="presets-grid">
        <!-- 纯自定义选项 -->
        <div
          class="preset-card custom-card"
          :class="{ active: !currentPreset }"
          @click="switchToCustom"
        >
          <div class="preset-header">
            <el-icon><Edit /></el-icon>
            <span class="preset-name">纯自定义</span>
            <el-tag
              v-if="!currentPreset"
              size="small"
              type="success"
              effect="plain"
            >
              使用中
            </el-tag>
          </div>
          <div class="preset-desc">完全自定义样式，不基于任何预设</div>
        </div>

        <!-- 内置预设列表 -->
        <div
          v-for="preset in presets"
          :key="preset.id"
          class="preset-card"
          :class="{ active: currentPreset?.id === preset.id }"
          @click="selectPreset(preset.id)"
        >
          <div class="preset-header">
            <el-icon><DocumentCopy /></el-icon>
            <span class="preset-name">{{ preset.name }}</span>
            <el-tag
              v-if="currentPreset?.id === preset.id"
              size="small"
              type="success"
              effect="plain"
            >
              使用中
            </el-tag>
          </div>
          <div class="preset-desc">{{ preset.description }}</div>
        </div>
      </div>
    </div>

    <!-- CSS 编辑器 -->
    <div class="editor-section">
      <div class="section-header">
        <div class="header-left">
          <h4>自定义 CSS</h4>
          <span class="section-subtitle">
            {{ currentPreset ? `基于预设：${currentPreset.name}` : '完全自定义' }}
          </span>
        </div>
        <div class="section-actions">
          <el-button
            v-if="canRestore"
            size="small"
            :icon="Refresh"
            @click="restoreToPreset"
          >
            还原到预设
          </el-button>
          <el-button
            v-if="editorContent.trim()"
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
          v-model="editorContent"
          language="text"
          :line-numbers="true"
        />
      </div>

      <!-- 说明提示 -->
      <div class="info-alert">
        <div class="alert-content">
          <div>💡 <strong>提示：</strong></div>
          <ul>
            <li>自定义 CSS 会在启用时立即应用到整个应用</li>
            <li>编辑器支持自动保存，修改后会在 500ms 后自动保存</li>
            <li>可以使用 CSS 变量来适配主题，如 <code>var(--primary-color)</code></li>
            <li>选择预设后，可以在编辑器中继续修改，还原按钮可以恢复到预设原始内容</li>
            <li>建议谨慎使用 <code>!important</code>，避免影响应用的正常功能</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.css-override-settings {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 0 24px 24px;
  height: 100%;
  overflow-y: auto;
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
  padding: 4px 12px;
  border-radius: 4px;
  transition: all 0.3s ease;
}

.status-saved {
  color: var(--el-color-success);
  background: var(--el-color-success-light-9);
}

.status-saving {
  color: var(--el-color-info);
  background: var(--el-color-info-light-9);
}

.status-unsaved {
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
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

/* 通用区块样式 */
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-header h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.section-header .header-left {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.section-subtitle {
  font-size: 12px;
  color: var(--text-secondary);
}

.section-actions {
  display: flex;
  gap: 8px;
}

/* 预设模板 */
.presets-section {
  background: var(--card-bg);
  padding: 20px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.presets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 12px;
}

.preset-card {
  padding: 16px;
  border: 2px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--bg-color);
}

.preset-card:hover {
  border-color: var(--primary-color);
  background: var(--hover-bg);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.preset-card.active {
  border-color: var(--primary-color);
  background: var(--primary-color-light-9, rgba(64, 158, 255, 0.1));
}

.preset-card.custom-card {
  border-style: dashed;
}

.preset-card.custom-card.active {
  border-style: solid;
}

.preset-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-weight: 600;
  color: var(--text-primary);
}

.preset-name {
  flex: 1;
}

.preset-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* 编辑器区域 */
.editor-section {
  background: var(--card-bg);
  padding: 20px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.editor-wrapper {
  height: 400px;
  margin-bottom: 16px;
  border-radius: 4px;
  overflow: hidden;
}

/* 提示框 */
.info-alert {
  padding: 12px 16px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.alert-content strong {
  color: var(--text-primary);
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
  .presets-grid {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  }
}

@media (max-width: 768px) {
  .css-override-settings {
    padding: 0 16px 16px;
    gap: 16px;
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

  .presets-grid {
    grid-template-columns: 1fr;
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

  .editor-wrapper {
    height: 300px;
  }
}

@media (max-width: 480px) {
  .css-override-settings {
    padding: 0 12px 12px;
  }

  .header-section,
  .presets-section,
  .editor-section {
    padding: 16px;
  }

  .editor-wrapper {
    height: 250px;
  }
}
</style>