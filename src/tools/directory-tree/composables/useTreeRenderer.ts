/**
 * 目录树渲染逻辑
 */
import { computed } from "vue";
import type { Ref } from "vue";
import type { TreeNode, TreeStats } from "../config";
import type { GenerateTreeOptions, RenderTreeOptions } from "../actions";
import { buildMetadataHeader, renderTreeRecursive, calculateMaxDepth } from "../actions";

export function useTreeRenderer(
  treeData: Ref<TreeNode | null>,
  lastGenerationOptions: Ref<GenerateTreeOptions | null>,
  statsInfo: Ref<TreeStats | null>,
  includeMetadata: Ref<boolean>,
  secondaryMaxDepth: Ref<number>,
  secondaryExcludePattern: Ref<string>,
  viewShowFiles: Ref<boolean>,
  showSize: Ref<boolean>,
  showDirSize: Ref<boolean>,
  showDirItemCount: Ref<boolean>
) {
  // 计算实际最大深度（用于滑块范围）
  const actualMaxDepth = computed(() => {
    if (!treeData.value) return 10;
    return Math.max(calculateMaxDepth(treeData.value), 1);
  });

  // 处理后的目录树结果
  const processedTreeResult = computed(() => {
    // 如果有结构化数据，始终使用前端渲染，以支持实时响应所有视图选项
    if (treeData.value) {
      const result: string[] = [];

      // 1. 动态生成元数据部分
      if (includeMetadata.value && lastGenerationOptions.value && statsInfo.value) {
        const metadata = buildMetadataHeader(lastGenerationOptions.value, statsInfo.value);
        result.push(metadata);
      }

      // 2. 基于 treeData 渲染树
      // 解耦面板展开状态与筛选生效逻辑，避免展开/收起时触发重计算
      const maxDepth = secondaryMaxDepth.value;
      const excludePattern = secondaryExcludePattern.value.trim();

      const options: Required<RenderTreeOptions> & { excludePattern: string } = {
        maxDepth,
        excludePattern,
        showFiles: viewShowFiles.value,
        showSize: showSize.value,
        showDirSize: showDirSize.value,
        showDirItemCount: showDirItemCount.value,
      };

      renderTreeRecursive(treeData.value, "", true, true, options, 0, result);
      return result.join("\n");
    }

    // 降级：如果没有结构化数据，返回空
    return "";
  });

  return {
    actualMaxDepth,
    processedTreeResult,
  };
}
