/**
 * 目录树核心状态管理
 */
import { ref, watch } from "vue";
import { debounce } from "lodash-es";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { DirectoryTreeConfig, TreeNode, TreeStats } from "../config";
import { loadConfig as loadConfigFromStore, saveConfig as saveConfigToStore } from "../config";
import type { GenerateTreeOptions } from "../actions";
import { generateTree as generateTreeAction } from "../actions";

const errorHandler = createModuleErrorHandler("tools/directory-tree");

export function useDirectoryTreeState() {
  // 配置状态
  const targetPath = ref("");
  const showFiles = ref(true);
  const showHidden = ref(false);
  const filterMode = ref<"none" | "gitignore" | "custom" | "both">("none");
  const customPattern = ref("");
  const maxDepth = ref(5);
  const autoGenerateOnDrop = ref(true);
  const includeMetadata = ref(false);

  // 结果状态
  const treeData = ref<TreeNode | null>(null);
  const lastGenerationOptions = ref<GenerateTreeOptions | null>(null);
  const statsInfo = ref<TreeStats | null>(null);
  const isGenerating = ref(false);
  const isLoadingConfig = ref(true);

  // 二次筛选/视图控制状态
  const showResultFilter = ref(false);
  const secondaryMaxDepth = ref(10);
  const secondaryIncludePath = ref("");
  const secondaryExcludePattern = ref("");
  const viewShowFiles = ref(true);
  const showSize = ref(true);
  const showDirSize = ref(true);
  const showDirItemCount = ref(false);

  // 编辑器内容（与 processedTreeResult 解耦，允许临时编辑）
  const editorContent = ref("");

  // 加载配置
  const loadConfig = async () => {
    try {
      const config = await loadConfigFromStore();
      customPattern.value = config.customPatterns;
      filterMode.value = config.lastFilterMode;
      targetPath.value = config.lastTargetPath;
      showFiles.value = config.showFiles;
      showHidden.value = config.showHidden;
      showSize.value = config.showSize ?? true;
      showDirSize.value = config.showDirSize ?? true;
      showDirItemCount.value = config.showDirItemCount ?? false;
      maxDepth.value = config.maxDepth;
      autoGenerateOnDrop.value = config.autoGenerateOnDrop ?? true;
      includeMetadata.value = config.includeMetadata ?? false;

      // 恢复上次生成的结果
      if (config.lastTreeStructure) {
        treeData.value = config.lastTreeStructure;
      }
      if (config.lastStatsInfo) {
        statsInfo.value = config.lastStatsInfo;
      }
      if (config.lastGenerationOptions) {
        lastGenerationOptions.value = config.lastGenerationOptions;
      }

      return config;
    } catch (error) {
      errorHandler.handle(error, { userMessage: "加载配置失败", showToUser: false });
      throw error;
    } finally {
      isLoadingConfig.value = false;
    }
  };

  // 防抖保存配置
  const debouncedSaveConfig = debounce(async (pathHistory: any[]) => {
    if (isLoadingConfig.value) return;

    try {
      const config: DirectoryTreeConfig = {
        customPatterns: customPattern.value,
        lastFilterMode: filterMode.value,
        lastTargetPath: targetPath.value,
        showFiles: showFiles.value,
        showHidden: showHidden.value,
        showSize: showSize.value,
        showDirSize: showDirSize.value,
        showDirItemCount: showDirItemCount.value,
        maxDepth: maxDepth.value,
        autoGenerateOnDrop: autoGenerateOnDrop.value,
        includeMetadata: includeMetadata.value,
        lastTreeStructure: treeData.value,
        lastStatsInfo: statsInfo.value,
        lastGenerationOptions: lastGenerationOptions.value,
        pathHistory,
        version: "1.0.0",
      };
      await saveConfigToStore(config);
    } catch (error) {
      errorHandler.handle(error, {
        userMessage: "保存配置失败",
        context: {
          customPatterns: customPattern.value,
          lastFilterMode: filterMode.value,
          lastTargetPath: targetPath.value,
          showFiles: showFiles.value,
          showHidden: showHidden.value,
          maxDepth: maxDepth.value,
        },
      });
    }
  }, 500);

  // 生成目录树
  const generateTree = async (addToHistoryCallback: (path: string) => void) => {
    if (!targetPath.value) {
      customMessage.warning("请先选择目录");
      return;
    }

    isGenerating.value = true;
    try {
      const options: GenerateTreeOptions = {
        path: targetPath.value,
        showFiles: showFiles.value,
        showHidden: showHidden.value,
        maxDepth: maxDepth.value,
        filterMode: filterMode.value,
        customPattern: customPattern.value,
        includeMetadata: false,
      };

      const result = await generateTreeAction(options);

      treeData.value = result.structure;
      statsInfo.value = result.stats;
      lastGenerationOptions.value = options;

      // 添加到历史记录
      addToHistoryCallback(targetPath.value);

      customMessage.success("目录树生成成功");
    } catch (error: any) {
      errorHandler.error(error, "生成失败");
      treeData.value = null;
    } finally {
      isGenerating.value = false;
    }
  };

  // 重置目录树
  const resetTree = () => {
    treeData.value = null;
    statsInfo.value = null;
    secondaryIncludePath.value = "";
    secondaryExcludePattern.value = "";
    editorContent.value = "";
    customMessage.success("结果已清空");
  };

  // 监听生成结果，自动重置二次筛选
  watch(treeData, () => {
    // actualMaxDepth 会在 useTreeRenderer 中计算，这里不需要处理
  });

  return {
    // 配置状态
    targetPath,
    showFiles,
    showHidden,
    filterMode,
    customPattern,
    maxDepth,
    autoGenerateOnDrop,
    includeMetadata,

    // 结果状态
    treeData,
    lastGenerationOptions,
    statsInfo,
    isGenerating,
    isLoadingConfig,

    // 二次筛选/视图控制
    showResultFilter,
    secondaryMaxDepth,
    secondaryIncludePath,
    secondaryExcludePattern,
    viewShowFiles,
    showSize,
    showDirSize,
    showDirItemCount,

    // 编辑器
    editorContent,

    // 方法
    loadConfig,
    debouncedSaveConfig,
    generateTree,
    resetTree,
  };
}
