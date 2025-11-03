import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { ToolConfig } from '@/config/tools';
import { toolsConfig as initialTools } from '@/config/tools';
import { cloneDeep } from 'lodash-es';

export const useToolsStore = defineStore('tools', () => {
  const tools = ref<ToolConfig[]>(cloneDeep(initialTools));

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
    addTool,
    removeTool,
  };
});