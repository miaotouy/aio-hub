import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { ContextProcessor, PipelineContext } from "../types/pipeline";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createConfigManager } from "@/utils/configManager";
import { sessionLoader } from "../core/pipeline/processors/session-loader";

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
    enabledProcessorIds: [],
    orderedProcessorIds: [],
  }),
});

const getInitialProcessors = (): ContextProcessor[] => {
  return [
    sessionLoader,
  ];
};

export const useContextPipelineStore = defineStore(
  "contextPipeline",
  () => {
    const initialProcessors = getInitialProcessors();
    const processors = ref<ContextProcessor[]>(initialProcessors);

    const enabledProcessorIds = ref<string[]>(
      initialProcessors
        .filter((p) => p.defaultEnabled !== false)
        .map((p) => p.id),
    );

    const isInitialized = ref(false);

    const loadSettings = async () => {
      try {
        const settings = await settingsManager.load();

        if (settings.enabledProcessorIds && settings.enabledProcessorIds.length > 0) {
          const validIds = settings.enabledProcessorIds.filter(id =>
            processors.value.some(p => p.id === id)
          );
          if (validIds.length > 0) {
            enabledProcessorIds.value = validIds;
          }
        }

        if (settings.orderedProcessorIds && settings.orderedProcessorIds.length > 0) {
          reorderProcessors(settings.orderedProcessorIds, false);
        }

        isInitialized.value = true;
        logger.info("Pipeline 设置已加载");
      } catch (error) {
        logger.warn("加载 Pipeline 设置失败，使用默认设置", error);
      }
    };

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
      const processorMap = new Map(processors.value.map((p) => [p.id, p]));
      const newProcessors: ContextProcessor[] = [];
      let currentPriority = 100;

      for (const id of orderedIds) {
        const processor = processorMap.get(id);
        if (processor) {
          processor.priority = currentPriority;
          newProcessors.push(processor);
          currentPriority += 100;
        }
      }

      processors.value.forEach(p => {
        if (!orderedIds.includes(p.id)) {
          p.priority = currentPriority;
          newProcessors.push(p);
          currentPriority += 100;
        }
      });

      processors.value = newProcessors;
      if (shouldSave) saveSettings();
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