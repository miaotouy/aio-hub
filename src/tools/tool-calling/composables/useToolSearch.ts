import { computed, type Ref, type ComputedRef } from "vue";
import type { MethodMetadata } from "@/services/types";

export interface DiscoveredToolMethods {
  toolId: string;
  toolName: string;
  toolDescription?: string;
  icon?: any;
  factoryId?: string;
  methods: MethodMetadata[];
  settingsSchema?: any[];
}

/**
 * 工具搜索优先级权重
 */
const SCORE_WEIGHTS = {
  TOOL_NAME_EXACT: 100,
  TOOL_NAME_PREFIX: 80,
  TOOL_ID_EXACT: 70,
  TOOL_NAME_CONTAINS: 60,
  TOOL_ID_CONTAINS: 50,
  METHOD_NAME_CONTAINS: 40,
  TOOL_DESC_CONTAINS: 30,
  METHOD_DESC_CONTAINS: 20,
};

export function useToolSearch(
  tools: Ref<DiscoveredToolMethods[]> | ComputedRef<DiscoveredToolMethods[]>,
  searchQuery: Ref<string>,
) {
  const calcToolScore = (tool: DiscoveredToolMethods, query: string): number => {
    const tName = tool.toolName.toLowerCase();
    const tId = tool.toolId.toLowerCase();
    const tDesc = (tool.toolDescription || "").toLowerCase();

    let maxScore = 0;

    // 1. 工具名称匹配
    if (tName === query) {
      maxScore = Math.max(maxScore, SCORE_WEIGHTS.TOOL_NAME_EXACT);
    } else if (tName.startsWith(query)) {
      maxScore = Math.max(maxScore, SCORE_WEIGHTS.TOOL_NAME_PREFIX);
    } else if (tName.includes(query)) {
      maxScore = Math.max(maxScore, SCORE_WEIGHTS.TOOL_NAME_CONTAINS);
    }

    // 2. 工具 ID 匹配
    if (tId === query) {
      maxScore = Math.max(maxScore, SCORE_WEIGHTS.TOOL_ID_EXACT);
    } else if (tId.includes(query)) {
      maxScore = Math.max(maxScore, SCORE_WEIGHTS.TOOL_ID_CONTAINS);
    }

    // 3. 方法匹配
    for (const method of tool.methods) {
      const mName = method.name.toLowerCase();
      const mDisplayName = (method.displayName || "").toLowerCase();
      const mDesc = (method.description || "").toLowerCase();

      if (mName.includes(query) || mDisplayName.includes(query)) {
        maxScore = Math.max(maxScore, SCORE_WEIGHTS.METHOD_NAME_CONTAINS);
      }

      if (mDesc.includes(query)) {
        maxScore = Math.max(maxScore, SCORE_WEIGHTS.METHOD_DESC_CONTAINS);
      }
    }

    // 4. 工具描述匹配
    if (tDesc.includes(query)) {
      maxScore = Math.max(maxScore, SCORE_WEIGHTS.TOOL_DESC_CONTAINS);
    }

    return maxScore;
  };

  const filteredTools = computed(() => {
    const query = searchQuery.value.trim().toLowerCase();
    if (!query) return tools.value;

    return tools.value
      .map((tool) => ({
        tool,
        score: calcToolScore(tool, query),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.tool);
  });

  return {
    filteredTools,
  };
}
