import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { ToolConfig } from '@/config/tools';
import { toolsConfig as initialTools } from '@/config/tools';

export const useToolsStore = defineStore('tools', () => {
  // 使用浅拷贝以保留图标的 markRaw 状态
  // lodash-es 的 cloneDeep 会破坏 markRaw
  const tools = ref<ToolConfig[]>(initialTools.map(t => ({ ...t })));
  const isReady = ref(false); // 新增状态，标记工具是否已加载完成

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
    isReady,
    setReady,
    addTool,
    removeTool,
  };
});