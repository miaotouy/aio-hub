import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type {
  ContextProcessor,
  PipelineContext,
} from "@/tools/llm-chat/core/pipeline/types";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { CorePostProcessors } from "../core/context-processors/post";

const logger = createModuleLogger("postProcessingPipelineStore");
const errorHandler = createModuleErrorHandler("postProcessingPipelineStore");

export const usePostProcessingPipelineStore = defineStore(
  "postProcessingPipeline",
  () => {
    const processors = ref<ContextProcessor[]>([]);
    const enabledProcessorIds = ref<string[]>([]);

    function initializeCoreProcessors() {
      logger.info("初始化核心后处理器");
      CorePostProcessors.forEach(registerProcessor);
    }

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

    async function executePipeline(
      context: PipelineContext,
    ): Promise<PipelineContext> {
      logger.info("开始执行后处理管道", {
        processorCount: sortedAndEnabledProcessors.value.length,
      });

      for (const processor of sortedAndEnabledProcessors.value) {
        await errorHandler.wrapAsync(
          async () => {
            logger.debug("执行处理器", { id: processor.id });
            await processor.execute(context);
          },
          {
            userMessage: `后处理步骤 [${processor.name}] 失败`,
            context: { processorId: processor.id },
          },
        );
      }

      logger.info("后处理管道执行完毕");
      return context;
    }

    // 初始化核心处理器
    initializeCoreProcessors();

    return {
      processors,
      enabledProcessorIds,
      sortedAndEnabledProcessors,
      registerProcessor,
      unregisterProcessor,
      setProcessorEnabled,
      reorderProcessors,
      executePipeline,
    };
  },
);
