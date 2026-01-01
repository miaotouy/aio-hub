<template>
  <div class="export-options">
    <div class="options-section">
      <div class="section-title">导出格式</div>
      <el-radio-group v-model="format" class="format-group">
        <el-radio-button value="markdown">Markdown{{ isSession ? " (树状)" : "" }}</el-radio-button>
        <el-radio-button value="json">JSON</el-radio-button>
        <el-radio-button value="raw">Raw (JSON)</el-radio-button>
      </el-radio-group>
    </div>

    <div class="options-section">
      <div class="section-title">包含内容</div>
      <div class="options-grid">
        <template v-if="!isSession">
          <el-checkbox v-model="includePreset" class="option-checkbox">
            <span class="option-label">
              智能体预设消息
              <span v-if="presetCount > 0" class="option-hint">（{{ presetCount }} 条）</span>
            </span>
          </el-checkbox>

          <el-checkbox
            v-model="mergePresetIntoMessages"
            class="option-checkbox"
            :disabled="!includePreset"
          >
            <span class="option-label"> 合并预设到消息列表 </span>
          </el-checkbox>
        </template>

        <el-checkbox v-model="includeUserProfile" class="option-checkbox">
          <span class="option-label">用户档案信息</span>
        </el-checkbox>

        <el-checkbox v-model="includeAgentInfo" class="option-checkbox">
          <span class="option-label">智能体信息</span>
        </el-checkbox>

        <el-checkbox v-model="includeModelInfo" class="option-checkbox">
          <span class="option-label">模型信息</span>
        </el-checkbox>

        <el-checkbox v-model="includeTokenUsage" class="option-checkbox">
          <span class="option-label">Token 用量</span>
        </el-checkbox>

        <el-checkbox v-model="includeAttachments" class="option-checkbox">
          <span class="option-label">附件信息</span>
        </el-checkbox>

        <el-checkbox v-model="includeErrors" class="option-checkbox">
          <span class="option-label">错误信息</span>
        </el-checkbox>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElCheckbox, ElRadioGroup, ElRadioButton } from "element-plus";

interface Props {
  isSession?: boolean;
  presetCount?: number;
}

const props = withDefaults(defineProps<Props>(), {
  isSession: false,
  presetCount: 0,
});

const format = defineModel<"markdown" | "json" | "raw">("format", { required: true });
const includeUserProfile = defineModel<boolean>("includeUserProfile", { default: true });
const includeAgentInfo = defineModel<boolean>("includeAgentInfo", { default: true });
const includeModelInfo = defineModel<boolean>("includeModelInfo", { default: true });
const includeTokenUsage = defineModel<boolean>("includeTokenUsage", { default: true });
const includeAttachments = defineModel<boolean>("includeAttachments", { default: true });
const includeErrors = defineModel<boolean>("includeErrors", { default: true });

// 仅 Branch 模式使用的选项
const includePreset = defineModel<boolean>("includePreset", { default: false });
const mergePresetIntoMessages = defineModel<boolean>("mergePresetIntoMessages", { default: true });
</script>

<style scoped>
.export-options {
  flex-shrink: 0;
  padding: 12px;
  background-color: var(--container-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.options-section {
  margin-bottom: 16px;
}

.options-section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
  margin-bottom: 8px;
}

.format-group {
  display: flex;
  gap: 8px;
}

.format-group :deep(.el-radio-button) {
  .el-radio-button__inner {
    border: 1px solid var(--border-color);
    border-radius: 4px !important;
    padding: 5px 15px;
  }

  &:not(:last-child) .el-radio-button__inner {
    border-right: 1px solid var(--border-color);
  }

  &.is-active .el-radio-button__inner {
    border-color: var(--el-color-primary);
    background-color: var(--el-color-primary);
    color: var(--el-color-white);
  }

  &:hover .el-radio-button__inner {
    border-color: var(--el-color-primary);
  }
}

.options-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.option-checkbox {
  display: flex;
  align-items: flex-start;
}

.option-label {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  font-size: 13px;
}

.option-hint {
  color: var(--text-color-light);
  font-size: 12px;
}
</style>