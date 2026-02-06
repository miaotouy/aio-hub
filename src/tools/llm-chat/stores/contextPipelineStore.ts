import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type {
  ContextProcessor,
  PipelineContext,
} from "@/tools/llm-chat/types/pipeline";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createConfigManager } from "@/utils/configManager";
import {
  sessionLoader,
  regexProcessor,
  injectionAssembler,
  transcriptionProcessor,
  worldbookProcessor,
  knowledgeProcessor,
  tokenLimiter,
  messageFormatter,
  assetResolver,
} from "../core/context-processors";

const logger = createModuleLogger("contextPipelineStore");
const errorHandler = createModuleErrorHandler("contextPipelineStore");

// --- 持久化配置 ---
interface PipelineSettings {
  enabledProcessorIds: string[];
  orderedProcessorIds: string[];
}

const settingsManager = createConfigManager<PipelineSettings>({
  moduleName: "llm-chat",
  fileName: "pipeline-settings.json",
  version: "1.0.0",
  createDefault: () => ({
    enabledProcessorIds: [], // 默认值在加载逻辑中处理，这里为空即可
    orderedProcessorIds: [],
  }),
});

const getInitialProcessors = (): ContextProcessor[] => {
  return [
    sessionLoader,
    regexProcessor,
    injectionAssembler,
    knowledgeProcessor,
    transcriptionProcessor,
    worldbookProcessor,
    tokenLimiter,
    messageFormatter,
    assetResolver,
  ];
};

export const useContextPipelineStore = defineStore(
  "contextPipeline",
  () => {
    const initialProcessors = getInitialProcessors();
    const processors = ref<ContextProcessor[]>(initialProcessors);
    
    // 默认启用所有 defaultEnabled !== false 的处理器
    const enabledProcessorIds = ref<string[]>(
      initialProcessors
        .filter((p) => p.defaultEnabled !== false)
        .map((p) => p.id),
    );

    // 初始化标志
    const isInitialized = ref(false);

    // 加载持久化配置
    const loadSettings = async () => {
      try {
        const settings = await settingsManager.load();
        
        // 1. 恢复启用状态
        if (settings.enabledProcessorIds && settings.enabledProcessorIds.length > 0) {
          // 过滤掉已不存在的处理器 ID
          const validIds = settings.enabledProcessorIds.filter(id =>
            processors.value.some(p => p.id === id)
          );
          // 如果有有效的保存配置，则使用它；否则保留默认值
          if (validIds.length > 0) {
            enabledProcessorIds.value = validIds;
          }
        }

        // 2. 恢复顺序
        if (settings.orderedProcessorIds && settings.orderedProcessorIds.length > 0) {
          reorderProcessors(settings.orderedProcessorIds, false); // false 表示不触发保存，避免循环
        }
        
        isInitialized.value = true;
        logger.info("Pipeline 设置已加载");
      } catch (error) {
        logger.warn("加载 Pipeline 设置失败，使用默认设置", error);
      }
    };

    // 保存配置
    const saveSettings = async () => {
      if (!isInitialized.value) return;
      
      try {
        await settingsManager.save({
          enabledProcessorIds: enabledProcessorIds.value,
          orderedProcessorIds: processors.value.map(p => p.id),
        });
        logger.debug("Pipeline 设置已保存");
      } catch (error) {
        errorHandler.error(error as Error, "保存 Pipeline 设置失败");
      }
    };

    // 立即初始化
    loadSettings();

    const sortedAndEnabledProcessors = computed(() => {
      return processors.value
        .filter((p) => enabledProcessorIds.value.includes(p.id))
        .sort((a, b) => a.priority - b.priority);
    });

    function registerProcessor(processor: ContextProcessor) {
      if (processors.value.some((p) => p.id === processor.id)) {
        logger.warn("处理器已注册，将进行覆盖", { id: processor.id });
      }
      processors.value = [
        ...processors.value.filter((p) => p.id !== processor.id),
        processor,
      ];
      if (processor.defaultEnabled !== false) {
        setProcessorEnabled(processor.id, true);
      }
      logger.info("处理器已注册", { id: processor.id });
    }

    function unregisterProcessor(processorId: string) {
      processors.value = processors.value.filter((p) => p.id !== processorId);
      enabledProcessorIds.value = enabledProcessorIds.value.filter(
        (id) => id !== processorId,
      );
      saveSettings();
      logger.info("处理器已卸载", { id: processorId });
    }

    function setProcessorEnabled(processorId: string, enabled: boolean) {
      const exists = enabledProcessorIds.value.includes(processorId);
      if (enabled && !exists) {
        enabledProcessorIds.value.push(processorId);
        saveSettings();
      } else if (!enabled && exists) {
        enabledProcessorIds.value = enabledProcessorIds.value.filter(
          (id) => id !== processorId,
        );
        saveSettings();
      }
    }

    function reorderProcessors(orderedIds: string[], shouldSave = true) {
      // 创建当前处理器的 Map 以便快速查找
      const processorMap = new Map(processors.value.map((p) => [p.id, p]));
      
      const newProcessors: ContextProcessor[] = [];
      let currentPriority = 100;

      // 按新顺序重建数组并更新优先级
      for (const id of orderedIds) {
        const processor = processorMap.get(id);
        if (processor) {
          // 更新优先级以反映新顺序
          // 注意：这会修改内存中的处理器对象，如果需要持久化，应在这里处理
          processor.priority = currentPriority;
          newProcessors.push(processor);
          currentPriority += 100;
        }
      }

      // 添加未在 orderedIds 中的处理器（如果有的话，虽然不太可能）
      processors.value.forEach(p => {
        if (!orderedIds.includes(p.id)) {
          p.priority = currentPriority;
          newProcessors.push(p);
          currentPriority += 100;
        }
      });

      processors.value = newProcessors;
      
      if (shouldSave) {
        saveSettings();
      }
      logger.info("处理器已重新排序");
    }

    function resetToDefaults() {
      const initial = getInitialProcessors();
      processors.value = [...initial];
      enabledProcessorIds.value = initial
        .filter((p) => p.defaultEnabled !== false)
        .map((p) => p.id);
      saveSettings();
      logger.info("上下文管道已重置为默认设置");
    }

    async function executePipeline(
      context: PipelineContext,
    ): Promise<PipelineContext> {
      logger.info("开始执行上下文管道", {
        processorCount: sortedAndEnabledProcessors.value.length,
        processors: sortedAndEnabledProcessors.value.map(p => p.id)
      });

      for (const processor of sortedAndEnabledProcessors.value) {
        await errorHandler.wrapAsync(
          async () => {
            logger.debug("执行处理器", { id: processor.id });
            await processor.execute(context);
          },
          {
            userMessage: `处理步骤 [${processor.name}] 失败`,
            context: { processorId: processor.id },
          },
        );
      }

      logger.info("上下文管道执行完毕");
      return context;
    }

    return {
      processors,
      enabledProcessorIds,
      sortedAndEnabledProcessors,
      registerProcessor,
      unregisterProcessor,
      setProcessorEnabled,
      reorderProcessors,
      resetToDefaults,
      executePipeline,
    };
  },
);