<script setup lang="ts">
import { InfoFilled } from "@element-plus/icons-vue";
import { toolsConfig } from "@/config/tools";

// 定义 props 和 emits
interface ToolsVisible {
  [key: string]: boolean;
}

const toolsVisible = defineModel<ToolsVisible>("toolsVisible", { required: true });

// 从路径提取工具ID
const getToolIdFromPath = (path: string): string => {
  // 从 /regex-apply 转换为 regexApply
  return path.substring(1).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
};
</script>

<template>
  <div class="tools-settings">
    <div class="setting-item">
      <div class="setting-label">
        <span>工具模块显示</span>
        <el-tooltip content="选择要在主页显示的工具模块" placement="top">
          <el-icon class="info-icon">
            <InfoFilled />
          </el-icon>
        </el-tooltip>
      </div>
    </div>

    <div class="tools-list">
      <div v-for="tool in toolsConfig" :key="tool.path" class="tool-item">
        <el-checkbox v-if="toolsVisible" v-model="toolsVisible[getToolIdFromPath(tool.path)]">
          <div class="tool-checkbox-content">
            <el-icon class="tool-icon">
              <component :is="tool.icon" />
            </el-icon>
            <div class="tool-info">
              <span class="tool-name">{{ tool.name }}</span>
              <span v-if="tool.description" class="tool-description">{{
                tool.description
              }}</span>
            </div>
          </div>
        </el-checkbox>
      </div>
    </div>

    <el-divider />

    <div class="batch-actions">
      <el-button
        size="small"
        @click="
          Object.keys(toolsVisible || {}).forEach((k) => (toolsVisible![k] = true))
        "
      >
        全选
      </el-button>
      <el-button
        size="small"
        @click="
          Object.keys(toolsVisible || {}).forEach((k) => (toolsVisible![k] = false))
        "
      >
        全不选
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.tools-settings {
  padding: 0 24px 24px;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
}

.setting-item:not(:last-child) {
  border-bottom: 1px solid var(--border-color-light);
}

.setting-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--text-color);
}

.info-icon {
  color: var(--text-color-secondary);
  cursor: help;
}

.tools-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.tool-item {
  padding: 8px;
  overflow: hidden;
}

/* 覆盖 element-plus checkbox 样式 */
.tool-item :deep(.el-checkbox) {
  height: auto;
  align-items: flex-start;
}

.tool-item :deep(.el-checkbox__label) {
  white-space: normal;
  padding-left: 8px;
  width: 100%;
}

.tool-checkbox-content {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
}

.tool-icon {
  font-size: 20px;
  color: var(--primary-color);
  margin-top: 2px;
  flex-shrink: 0;
}

.tool-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
  overflow: hidden;
}

.tool-name {
  font-size: 14px;
  color: var(--text-color);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tool-description {
  font-size: 12px;
  color: var(--text-color-secondary);
  line-height: 1.4;
  word-wrap: break-word;
  overflow-wrap: break-word;
  hyphens: auto;
}

/* 批量操作按钮 */
.batch-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
</style>