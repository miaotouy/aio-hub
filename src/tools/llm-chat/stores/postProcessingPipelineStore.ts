import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type {
  ContextProcessor,
  PipelineContext,
} from "@/tools/llm-chat/types/pipeline";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { CorePostProcessors } from "../core/context-processors/post";
import type { LlmModelInfo } from "@/types/llm-profiles";
import type { ContextPostProcessRule } from "@/tools/llm-chat/types/llm";

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
      // 1. 获取 Agent 配置的规则
      const agentRules =
        context.agentConfig.parameters?.contextPostProcessing?.rules || [];

      // 2. 获取模型配置的默认规则
      const model = context.sharedData.get("model") as LlmModelInfo | undefined;
      // 兼容处理：确保 defaultPostProcessingRules 是 ContextPostProcessRule[]
      // 虽然类型定义已更新，但运行时数据可能仍是 string[] (旧数据)，这里做防御性编程
      let modelRules: ContextPostProcessRule[] = [];
      if (model?.defaultPostProcessingRules) {
        if (
          model.defaultPostProcessingRules.length > 0 &&
          typeof model.defaultPostProcessingRules[0] === "string"
        ) {
          modelRules = (
            model.defaultPostProcessingRules as unknown as string[]
          ).map((id) => ({
            type: id,
            enabled: true,
          }));
        } else {
          modelRules =
            model.defaultPostProcessingRules as ContextPostProcessRule[];
        }
      }

      // 3. 合并规则 (Agent 优先，模型兜底)
      // 使用 Map 来去重，key 为 rule.type (processorId)
      const mergedRulesMap = new Map<string, ContextPostProcessRule>();

      // 先放入模型规则
      modelRules.forEach((rule) => {
        mergedRulesMap.set(rule.type, rule);
      });

      // 再放入 Agent 规则 (覆盖模型规则)
      agentRules.forEach((rule) => {
        mergedRulesMap.set(rule.type, rule);
      });

      const finalRules = Array.from(mergedRulesMap.values());

      // 4. 筛选并排序要执行的处理器
      let processorsToExecute: ContextProcessor[] = [];

      // 严格模式：只执行明确启用的规则
      processorsToExecute = processors.value.filter((processor) => {
        const rule = finalRules.find((r) => r.type === processor.id);
        return rule?.enabled === true;
      });

      // 确保按优先级排序
      processorsToExecute.sort((a, b) => a.priority - b.priority);

      logger.info("开始执行后处理管道", {
        processorCount: processorsToExecute.length,
        usingAgentRules: agentRules.length > 0,
        usingModelRules: modelRules.length > 0,
        finalRuleCount: finalRules.length,
        executedIds: processorsToExecute.map((p) => p.id),
      });

      for (const processor of processorsToExecute) {
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
