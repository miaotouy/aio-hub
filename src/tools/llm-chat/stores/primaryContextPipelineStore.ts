import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type {
  ContextProcessor,
  PipelineContext,
} from "@/tools/llm-chat/types/pipeline";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { primaryProcessors } from "../core/context-processors/primary";

const logger = createModuleLogger("primaryContextPipelineStore");
const errorHandler = createModuleErrorHandler("primaryContextPipelineStore");

const getInitialProcessors = (): ContextProcessor[] => {
  // 在这里可以添加从本地存储加载用户自定义处理器的逻辑
  return primaryProcessors;
};

export const usePrimaryContextPipelineStore = defineStore(
  "primaryContextPipeline",
  () => {
    const initialProcessors = getInitialProcessors();
    const processors = ref<ContextProcessor[]>(initialProcessors);
    const enabledProcessorIds = ref<string[]>(
      initialProcessors
        .filter((p) => p.defaultEnabled !== false)
        .map((p) => p.id),
    );

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
      if (processor.defaultEnabled) {
        setProcessorEnabled(processor.id, true);
      }
      logger.info("处理器已注册", { id: processor.id });
    }

    function unregisterProcessor(processorId: string) {
      processors.value = processors.value.filter((p) => p.id !== processorId);
      enabledProcessorIds.value = enabledProcessorIds.value.filter(
        (id) => id !== processorId,
      );
      logger.info("处理器已卸载", { id: processorId });
    }

    function setProcessorEnabled(processorId: string, enabled: boolean) {
      const exists = enabledProcessorIds.value.includes(processorId);
      if (enabled && !exists) {
        enabledProcessorIds.value.push(processorId);
      } else if (!enabled && exists) {
        enabledProcessorIds.value = enabledProcessorIds.value.filter(
          (id) => id !== processorId,
        );
      }
    }

    function reorderProcessors(orderedIds: string[]) {
      processors.value.sort((a, b) => {
        const indexA = orderedIds.indexOf(a.id);
        const indexB = orderedIds.indexOf(b.id);
        if (indexA === -1 || indexB === -1) return 0;
        return indexA - indexB;
      });
    }

    function resetToDefaults() {
      const initial = getInitialProcessors();
      processors.value = [...initial];
      enabledProcessorIds.value = initial
        .filter((p) => p.defaultEnabled !== false)
        .map((p) => p.id);
      logger.info("主上下文管道已重置为默认设置");
    }

    async function executePipeline(
      context: PipelineContext,
    ): Promise<PipelineContext> {
      logger.info("开始执行主上下文管道", {
        processorCount: sortedAndEnabledProcessors.value.length,
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

      logger.info("主上下文管道执行完毕");
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
