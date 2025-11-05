import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { ToolConfig } from '@/config/tools';
import { toolsConfig as initialTools } from '@/config/tools';
import { loadAppSettings } from '@/utils/appSettings';

export const useToolsStore = defineStore('tools', () => {
  // 使用浅拷贝以保留图标的 markRaw 状态
  // lodash-es 的 cloneDeep 会破坏 markRaw
  const tools = ref<ToolConfig[]>(initialTools.map(t => ({ ...t })));
  const isReady = ref(false); // 新增状态，标记工具是否已加载完成
  
  // 响应式的工具顺序配置
  const toolsOrder = ref<string[]>([]);

  /**
   * 初始化工具顺序（从配置文件加载）
   */
  function initializeOrder() {
    const settings = loadAppSettings();
    toolsOrder.value = settings.toolsOrder || [];
  }

  /**
   * 更新工具顺序
   */
  function updateOrder(newOrder: string[]) {
    toolsOrder.value = newOrder;
  }

  /**
   * 根据用户保存的顺序返回排序后的工具列表
   */
  const orderedTools = computed<ToolConfig[]>(() => {
    if (toolsOrder.value.length === 0) {
      // 没有保存的顺序，返回原始顺序
      return tools.value;
    }

    // 创建工具路径到配置的映射
    const toolMap = new Map<string, ToolConfig>();
    tools.value.forEach(tool => {
      toolMap.set(tool.path, tool);
    });

    // 按照保存的顺序排列工具
    const ordered: ToolConfig[] = [];
    toolsOrder.value.forEach(path => {
      const tool = toolMap.get(path);
      if (tool) {
        ordered.push(tool);
        toolMap.delete(path);
      }
    });

    // 将剩余的（新添加的）工具添加到末尾
    toolMap.forEach(tool => {
      ordered.push(tool);
    });

    return ordered;
  });

  /**
   * 将工具加载状态设置为就绪
   */
  function setReady() {
    isReady.value = true;
  }

  /**
   * Adds a new tool to the store.
   * @param tool The tool configuration to add.
   */
  function addTool(tool: ToolConfig) {
    if (!tools.value.some(t => t.path === tool.path)) {
      tools.value.push(tool);
    }
  }

  /**
   * Removes a tool from the store by its path.
   * @param toolPath The unique path of the tool to remove.
   */
  function removeTool(toolPath: string) {
    const index = tools.value.findIndex(t => t.path === toolPath);
    if (index !== -1) {
      tools.value.splice(index, 1);
    }
  }

  return {
    tools,
    orderedTools,
    toolsOrder,
    isReady,
    setReady,
    initializeOrder,
    updateOrder,
    addTool,
    removeTool,
  };
});