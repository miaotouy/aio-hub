<script setup lang="ts">
import { inject } from "vue";
import { InfoFilled } from "@element-plus/icons-vue";
import VariableTreeEditor from "./VariableTreeEditor.vue";

const editForm = inject<any>("agent-edit-form");

if (!editForm.variableConfig) {
  editForm.variableConfig = {
    enabled: false,
    definitions: [],
    customStyles: ""
  };
}
</script>

<template>
  <div class="session-variable-section">
    <div class="section-header" data-setting-id="sessionVariables">
      <h3>会话变量系统</h3>
      <el-switch v-model="editForm.variableConfig.enabled" />
    </div>

    <div v-if="editForm.variableConfig.enabled" class="section-content">
      <div class="info-alert">
        <el-icon><InfoFilled /></el-icon>
        <div class="info-text">
          启用后，智能体可以通过 <code>&lt;svar name="path" op="+" value="1" /&gt;</code> 标签更新变量状态。
          你可以在提示词中使用 <code>$[path]</code> 来引用当前变量值。
        </div>
      </div>

      <VariableTreeEditor v-model="editForm.variableConfig.definitions" />

      <div class="custom-styles">
        <div class="label">自定义样式 (CSS)</div>
        <el-input
          v-model="editForm.variableConfig.customStyles"
          type="textarea"
          :rows="3"
          placeholder=".svar-badge { ... }"
        />
        <div class="form-hint">你可以通过 CSS 覆盖变量徽章的默认外观。</div>
      </div>
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
}

.info-alert {
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  background: var(--el-color-primary-light-9);
  border-radius: 8px;
  color: var(--el-color-primary);
  font-size: 13px;
  line-height: 1.6;
}

.info-alert code {
  background: rgba(var(--el-color-primary-rgb), 0.1);
  padding: 2px 4px;
  border-radius: 4px;
  font-family: var(--el-font-family-mono);
}

.custom-styles .label {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 8px;
}

.form-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
</style>