<script setup lang="ts">
import { InfoFilled, Rank } from "@element-plus/icons-vue";
import type { ToolConfig } from "@/config/tools";
import { useToolsStore } from "@/stores/tools";
import { VueDraggableNext } from "vue-draggable-next";
import { ref, onMounted } from "vue";
import { updateAppSettings, loadAppSettings } from "@/utils/appSettings";
import { customMessage } from "@/utils/customMessage";

// 定义 props 和 emits
interface ToolsVisible {
  [key: string]: boolean;
}
const toolsVisible = defineModel<ToolsVisible>("toolsVisible", { required: true });
const toolsStore = useToolsStore();

// 从路径提取工具ID
const getToolIdFromPath = (path: string): string => {
  // 从 /regex-apply 转换为 regexApply
  return path.substring(1).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
};

// 初始化工具列表的函数
const initializeTools = (): ToolConfig[] => {
  const settings = loadAppSettings();
  const order = settings.toolsOrder || [];

  // 创建一个工具路径到配置的映射
  const toolMap = new Map<string, ToolConfig>();
  toolsStore.tools.forEach(tool => {
    toolMap.set(tool.path, tool);
  });

  // 按照保存的顺序排列工具
  const orderedTools: ToolConfig[] = [];
  order.forEach(path => {
    const tool = toolMap.get(path);
    if (tool) {
      orderedTools.push(tool);
      toolMap.delete(path); // 从映射中移除已处理的工具
    }
  });

  // 将剩余的（新添加的）工具添加到末尾
  toolMap.forEach(tool => {
    orderedTools.push(tool);
  });

  return orderedTools;
};

// 可排序的工具列表（使用 ref 而不是 computed）
const sortedTools = ref<ToolConfig[]>([]);

// 用于记录拖拽前的顺序
const orderBeforeDrag = ref<string[]>([]);

// 组件挂载时初始化
onMounted(() => {
  sortedTools.value = initializeTools();
});

// 拖拽开始时记录当前顺序
const onDragStart = () => {
  orderBeforeDrag.value = sortedTools.value.map(tool => tool.path);
};

// 拖拽结束时的处理函数
const onDragEnd = () => {
  const newOrder = sortedTools.value.map(tool => tool.path);
  
  // 检查顺序是否真的发生了变化
  const hasChanged = !orderBeforeDrag.value.every((path, index) => path === newOrder[index]);
  
  if (!hasChanged) {
    // 顺序没有变化，可能只是点击，不执行保存
    return;
  }
  
  try {
    updateAppSettings({ toolsOrder: newOrder });
    customMessage.success("工具顺序已更新");
  } catch (error) {
    console.error("保存工具顺序失败:", error);
    customMessage.error("保存工具顺序失败");
  }
};

// 重置顺序功能
const resetOrder = () => {
  try {
    // 清除保存的顺序设置
    updateAppSettings({ toolsOrder: [] });
    // 重置为原始顺序
    sortedTools.value = [...toolsStore.tools];
    customMessage.success("工具顺序已重置为默认");
  } catch (error) {
    console.error("重置工具顺序失败:", error);
    customMessage.error("重置工具顺序失败");
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
    </div>

    <VueDraggableNext
      v-model="sortedTools"
      item-key="path"
      class="tools-list"
      handle=".drag-handle"
      @start="onDragStart"
      @end="onDragEnd"
      ghost-class="ghost"
      chosen-class="chosen"
      :force-fallback="true"
    >
      <div v-for="tool in sortedTools" :key="tool.path" class="tool-item">
        <el-checkbox v-if="toolsVisible" v-model="toolsVisible[getToolIdFromPath(tool.path)]">
          <div class="tool-checkbox-content">
            <el-icon class="drag-handle">
              <Rank />
            </el-icon>
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
    </VueDraggableNext>

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
      <el-button
        size="small"
        @click="resetOrder"
      >
        重置顺序
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