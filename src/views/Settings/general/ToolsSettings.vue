<script setup lang="ts">
import { InfoFilled, Rank } from "@element-plus/icons-vue";
import type { ToolConfig } from "@/services/types";
import { useToolsStore } from "@/stores/tools";
import { VueDraggableNext } from "vue-draggable-next";
import { ref, onMounted } from "vue";
import { updateAppSettings } from "@/utils/appSettings";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";

// 定义 props 和 emits
interface ToolsVisible {
  [key: string]: boolean;
}
const toolsVisible = defineModel<ToolsVisible>("toolsVisible", { required: true });
const toolsStore = useToolsStore();
const errorHandler = createModuleErrorHandler("Settings/ToolsSettings");

// 从路径提取工具ID
const getToolIdFromPath = (path: string): string => {
  // 从 /regex-applier 转换为 regexApply
  return path.substring(1).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
};

// 可排序的工具列表（使用 ref 而不是 computed）
// 初始化时从 store 的 orderedTools 获取，确保与侧边栏顺序一致
const sortedTools = ref<ToolConfig[]>([]);

// 用于记录拖拽前的顺序
const orderBeforeDrag = ref<string[]>([]);

// 组件挂载时初始化
onMounted(() => {
  // 从 store 获取排序后的工具列表
  sortedTools.value = [...toolsStore.orderedTools];

  // 确保所有工具都有明确的可见性值
  // 对于未设置的工具，默认设置为 true（显示）
  if (toolsVisible.value) {
    // 检查是否有未定义的工具
    const hasUndefined = sortedTools.value.some((tool) => {
      const toolId = getToolIdFromPath(tool.path);
      return toolsVisible.value![toolId] === undefined;
    });

    // 如果有未定义的工具，创建新对象以触发响应式更新
    if (hasUndefined) {
      const updated = { ...toolsVisible.value };
      sortedTools.value.forEach((tool) => {
        const toolId = getToolIdFromPath(tool.path);
        if (updated[toolId] === undefined) {
          updated[toolId] = true;
        }
      });
      // 通过赋值新对象来触发 defineModel 的更新
      toolsVisible.value = updated;
    }
  }
});

// 拖拽开始时记录当前顺序
const onDragStart = () => {
  orderBeforeDrag.value = sortedTools.value.map((tool) => tool.path);
};

// 拖拽结束时的处理函数
const onDragEnd = () => {
  const newOrder = sortedTools.value.map((tool) => tool.path);

  // 检查顺序是否真的发生了变化
  const hasChanged = !orderBeforeDrag.value.every((path, index) => path === newOrder[index]);

  if (!hasChanged) {
    // 顺序没有变化，可能只是点击，不执行保存
    return;
  }

  try {
    updateAppSettings({ toolsOrder: newOrder });
    // 同步更新 store 中的顺序状态，使其他组件立即响应
    toolsStore.updateOrder(newOrder);
    customMessage.success("工具顺序已更新");
  } catch (error) {
    errorHandler.error(error, "保存工具顺序失败");
  }
};

// 重置顺序功能
const resetOrder = () => {
  try {
    // 清除保存的顺序设置
    updateAppSettings({ toolsOrder: [] });
    // 同步更新 store 中的顺序状态
    toolsStore.updateOrder([]);
    // 重置为原始顺序（此时 store 的 orderedTools 会自动返回未排序的列表）
    sortedTools.value = [...toolsStore.orderedTools];
    customMessage.success("工具顺序已重置为默认");
  } catch (error) {
    errorHandler.error(error, "重置工具顺序失败");
  }
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
      <div class="batch-actions">
        <el-button
          size="small"
          @click="Object.keys(toolsVisible || {}).forEach((k) => (toolsVisible![k] = true))"
        >
          全选
        </el-button>
        <el-button
          size="small"
          @click="Object.keys(toolsVisible || {}).forEach((k) => (toolsVisible![k] = false))"
        >
          全不选
        </el-button>
        <el-button size="small" @click="resetOrder"> 重置顺序 </el-button>
      </div>
    </div>

    <VueDraggableNext
      v-model="sortedTools"
      item-key="path"
      class="tools-list"
      handle=".drag-handle"
      @start="onDragStart"
      @end="onDragEnd"
      ghost-class="ghost"
      drag-class="sortable-drag"
      chosen-class="chosen"
      :force-fallback="true"
      :fallback-tolerance="3"
      :animation="200"
    >
      <div v-for="tool in sortedTools" :key="tool.path" class="tool-item">
        <el-checkbox v-if="toolsVisible" v-model="toolsVisible[getToolIdFromPath(tool.path)]">
          <div class="tool-checkbox-content">
            <el-icon class="drag-handle">
              <Rank />
            </el-icon>
            <!-- 统一的图标容器 -->
            <span class="icon-wrapper">
              <component :is="tool.icon" />
            </span>
            <div class="tool-info">
              <span class="tool-name">{{ tool.name }}</span>
              <span v-if="tool.description" class="tool-description">{{ tool.description }}</span>
            </div>
          </div>
        </el-checkbox>
      </div>
    </VueDraggableNext>
  </div>
</template>

<style scoped>
.tools-settings {
  padding: 0;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-radius: 8px;
  backdrop-filter: blur(var(--ui-blur));
}

.setting-item:not(:last-child) {
  border-bottom: 1px solid var(--border-color);
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
  border-radius: 8px;
  backdrop-filter: blur(var(--ui-blur));
  user-select: none;
}

/* 拖拽手柄样式 */
.drag-handle {
  color: var(--text-color-secondary);
  cursor: grab;
  font-size: 18px;
  margin-right: 8px;
  margin-top: 2px;
  flex-shrink: 0;
}

.drag-handle:active {
  cursor: grabbing;
}

/* 拖拽时的占位符样式 */
.ghost {
  opacity: 0.5;
  background: var(--bg-color-page);
}

/* 被选中拖拽项的样式 */
.chosen {
  transform: rotate(3deg);
}

.sortable-drag {
  opacity: 0.8;
  transform: rotate(3deg);
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  transition: none !important;
  background: var(--bg-color-overlay);
  z-index: 9999;
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

/* 统一的图标容器样式 */
.icon-wrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  font-size: 20px;
  color: var(--primary-color);
  margin-top: 2px;
  flex-shrink: 0;
  vertical-align: middle;
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
}
</style>
