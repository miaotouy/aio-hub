<script setup lang="ts">
import { inject } from "vue";
import { InfoFilled } from "@element-plus/icons-vue";
import VariableTreeEditor from "./VariableTreeEditor.vue";

const editForm = inject<any>("agent-edit-form");

if (!editForm.variableConfig) {
  editForm.variableConfig = {
    enabled: false,
    definitions: [],
    customStyles: "",
  };
}
</script>

<template>
  <div class="session-variable-section">
    <div class="section-header" data-setting-id="sessionVariables">
      <h3>会话变量系统</h3>
      <el-switch v-model="editForm.variableConfig.enabled" />
    </div>

    <div class="section-content" :class="{ 'is-disabled': !editForm.variableConfig.enabled }">
      <div v-if="!editForm.variableConfig.enabled" class="disabled-overlay-hint">
        <el-icon><InfoFilled /></el-icon>
        <span>当前功能已禁用，配置将不会在会话中生效</span>
      </div>

      <div class="info-alert">
        <el-icon><InfoFilled /></el-icon>
        <div class="info-text">
          启用后，智能体可以通过 <code>&lt;svar name="path" op="+" value="1" /&gt;</code> 标签更新变量状态。
          你可以在提示词中使用 <code>$[path]</code> 来引用当前变量值。
        </div>
      </div>

      <el-collapse class="custom-styles-collapse">
        <el-collapse-item name="css">
          <template #title>
            <div class="collapse-title">高级自定义样式 (CSS)</div>
          </template>
          <div class="custom-styles-content">
            <el-input
              v-model="editForm.variableConfig.customStyles"
              type="textarea"
              :rows="5"
              placeholder=".svar-badge { ... }"
            />
            <div class="form-hint">你可以通过 CSS 覆盖变量徽章的默认外观。</div>
          </div>
        </el-collapse-item>
      </el-collapse>

      <VariableTreeEditor v-model="editForm.variableConfig.definitions" />
    </div>
  </div>
</template>

<style scoped>
.session-variable-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.section-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.section-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
  position: relative;
  transition: all 0.3s ease;
}

.section-content.is-disabled {
  opacity: 0.6;
  filter: grayscale(0.3);
  pointer-events: auto; /* 允许点击和编辑 */
}

.disabled-overlay-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(var(--el-color-info-rgb), calc(var(--card-opacity) * 0.1));
  border: 1px solid rgba(var(--el-color-info-rgb), calc(var(--card-opacity) * 0.2));
  border-radius: 6px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  margin-bottom: -8px;
}

.info-alert {
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.1));
  border: 1px solid rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.2));
  border-radius: 8px;
  color: var(--el-color-primary);
  font-size: 13px;
  line-height: 1.6;
}

.info-alert code {
  background: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.15));
  padding: 2px 4px;
  border-radius: 4px;
  font-family: var(--el-font-family-mono);
}

.custom-styles-collapse {
  border: none;
  background: transparent;
}

:deep(.custom-styles-collapse .el-collapse-item__header) {
  background: transparent;
  border-bottom: none;
  height: 40px;
}

:deep(.custom-styles-collapse .el-collapse-item__wrap) {
  background: transparent;
  border-bottom: none;
}

:deep(.custom-styles-collapse .el-collapse-item__content) {
  padding-bottom: 10px;
}

.collapse-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-regular);
}

.form-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 8px;
}
</style>
