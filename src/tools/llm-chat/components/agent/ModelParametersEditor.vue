<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import type { LlmParameters } from "../../types";
import type { ProviderType, LlmParameterSupport, LlmModelInfo } from "@/types/llm-profiles";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useLlmChatUiState } from "../../composables/useLlmChatUiState";
import { useLlmChatStore } from "../../store";
import { useAgentStore } from "../../agentStore";
import { useChatHandler } from "../../composables/useChatHandler";
import type { ContextPreviewData } from "../../composables/useChatHandler";
import { getModelFamily } from "@/llm-apis/request-builder";
import { isEqual } from "lodash-es";
import ConfigSection from "../common/ConfigSection.vue";
import ParameterItem from "./ParameterItem.vue";
import ContextCompressionConfigPanel from "./parameters/ContextCompressionConfigPanel.vue";
import { ParameterConfig, parameterConfigs } from "../../config/parameter-config";
import { DEFAULT_CONTEXT_COMPRESSION_CONFIG } from "../../types/llm";

// New Components
import SafetySettingsPanel from "./parameters/SafetySettingsPanel.vue";
import PostProcessingPanel from "./parameters/PostProcessingPanel.vue";
import CustomParamsPanel from "./parameters/CustomParamsPanel.vue";
import ContextStatsCard from "./parameters/ContextStatsCard.vue";
import {
  Setting,
  Tools,
  Document,
  Files,
  Connection,
  MagicStick,
  CirclePlus,
} from "@element-plus/icons-vue";
import { Shield } from "lucide-vue-next";

/**
 * 模型参数编辑器组件
 * 根据渠道类型和模型能力智能显示可用的参数
 */

interface Props {
  modelValue: LlmParameters;
  providerType?: ProviderType;
  modelId?: string;
  capabilities?: LlmModelInfo["capabilities"];
  compact?: boolean;
  /** 模型的上下文窗口限制（如果为 undefined 则使用默认最大值） */
  contextLengthLimit?: number;
  /** 外部传入的上下文统计数据（如果有，组件将不再自行计算） */
  externalStats?: ContextPreviewData["statistics"] | null;
}

const props = withDefaults(defineProps<Props>(), {
  compact: false,
  externalStats: undefined,
});

const emit = defineEmits<{
  (e: "update:modelValue", value: LlmParameters): void;
}>();

const { getSupportedParameters } = useLlmProfiles();

// 获取支持的参数
const supportedParameters = computed<LlmParameterSupport>(() => {
  if (!props.providerType) {
    return {
      temperature: true,
      maxTokens: true,
    };
  }
  return getSupportedParameters(props.providerType);
});

// 初始化参数逻辑：如果 enabledParameters 不存在，根据值是否为 undefined 智能推断
const initLocalParams = (params: LlmParameters): LlmParameters => {
  const newParams = { ...params };

  // 确保 contextCompression 有默认结构（如果未定义）
  if (!newParams.contextCompression) {
    newParams.contextCompression = {
      ...DEFAULT_CONTEXT_COMPRESSION_CONFIG,
      enabled: false,
    };
  }

  if (!newParams.enabledParameters) {
    // 获取所有非 undefined 的参数键作为启用的参数
    // 这样既兼容了旧数据（有值的参数保持启用），又满足了新需求（没值的高级参数默认关闭）
    const enabledKeys = (Object.keys(newParams) as Array<keyof LlmParameters>).filter((key) => {
      if (key === "enabledParameters" || key === "custom") return false;
      return newParams[key] !== undefined;
    });

    newParams.enabledParameters = enabledKeys as Array<keyof Omit<LlmParameters, "custom">>;
  }

  return newParams;
};

// 本地状态
const localParams = ref<LlmParameters>(initLocalParams(props.modelValue));

// 监听外部值变化
watch(
  () => props.modelValue,
  (newVal) => {
    // 使用相同的初始化逻辑，确保外部更新也能正确处理启用状态
    localParams.value = initLocalParams(newVal);
  },
  { deep: true }
);

// 更新参数的通用方法
const updateParameter = <K extends keyof LlmParameters>(key: K, value: LlmParameters[K]) => {
  localParams.value = {
    ...localParams.value,
    [key]: value,
  };
  emit("update:modelValue", localParams.value);
};

// 检查参数是否启用
const isParameterEnabled = (key: keyof LlmParameters) => {
  // initLocalParams 保证了 enabledParameters 一定存在
  // 使用类型断言，因为我们知道这里处理的 key 都是标准参数
  return localParams.value.enabledParameters?.includes(key as any) ?? false;
};

// 切换参数启用状态
const toggleParameterEnabled = (key: keyof LlmParameters, enabled: boolean) => {
  const currentEnabled = localParams.value.enabledParameters || [];

  let newEnabled: Array<keyof Omit<LlmParameters, "custom">>;

  if (enabled) {
    // 使用类型断言，因为我们知道这里处理的 key 都是标准参数
    if (!currentEnabled.includes(key as any)) {
      newEnabled = [...currentEnabled, key as any];
    } else {
      newEnabled = currentEnabled as Array<keyof Omit<LlmParameters, "custom">>;
    }
  } else {
    newEnabled = currentEnabled.filter((k) => k !== key) as Array<
      keyof Omit<LlmParameters, "custom">
    >;
  }

  localParams.value = {
    ...localParams.value,
    enabledParameters: newEnabled,
  };
  emit("update:modelValue", localParams.value);
};

// 折叠状态管理 - 使用 useLlmChatUiState
const {
  basicParamsExpanded,
  advancedParamsExpanded,
  specialFeaturesExpanded,
  customParamsExpanded,
} = useLlmChatUiState();

// 上下文管理折叠状态（局部状态）
const contextManagementExpanded = ref(true);
// 上下文压缩折叠状态（局部状态）
const contextCompressionExpanded = ref(false);
// 上下文后处理折叠状态（局部状态）
const postProcessingExpanded = ref(true);
// 安全设置折叠状态（局部状态）
const safetySettingsExpanded = ref(false);

// --- 参数配置分组 ---

const basicConfigs = computed(() =>
  processedConfigs.value.filter((c) => c.group === "basic" && shouldShowParameter(c.key))
);

const advancedConfigs = computed(() =>
  processedConfigs.value.filter((c) => c.group === "advanced" && shouldShowParameter(c.key))
);

const specialConfigs = computed(() =>
  processedConfigs.value.filter((c) => c.group === "special" && shouldShowParameter(c.key))
);

// --- 动态参数处理 ---

// 根据 capabilities 动态处理参数配置，特别是 reasoningEffort 的选项
const processedConfigs = computed(() => {
  if (props.capabilities?.thinkingConfigType !== "effort") {
    return parameterConfigs;
  }

  return parameterConfigs.map((config) => {
    if (config.key === "reasoningEffort") {
      const options = props.capabilities?.reasoningEffortOptions || [];
      return {
        ...config,
        options: [
          { label: "默认", value: "" },
          ...options.map((opt) => ({ label: opt, value: opt })),
        ],
      };
    }
    return config;
  });
});

// 根据 provider 支持和 thinkingConfigType 决定是否显示参数
const shouldShowParameter = (key: keyof LlmParameters): boolean => {
  const cap = props.capabilities;
  const config = parameterConfigs.find((c) => c.key === key);
  if (!config) return false;

  // 对于思考相关的参数，直接根据模型自身 capabilities 判断，绕过 provider 检查
  if (config.supportedKey === "thinking") {
    const thinkingType = cap?.thinkingConfigType ?? "none";
    switch (key) {
      case "thinkingEnabled":
        return thinkingType === "switch" || thinkingType === "budget";
      case "thinkingBudget":
        // 只有在预算模式且启用了思考时才显示
        return thinkingType === "budget" && localParams.value.thinkingEnabled === true;
      case "reasoningEffort":
        return thinkingType === "effort";
      default:
        // 对于未知的 thinking 参数，默认不显示
        return false;
    }
  }

  // 对于其他参数，维持原有的 provider 检查
  if (!supportedParameters.value[config.supportedKey]) {
    return false;
  }

  return true;
};

// --- 动态覆盖逻辑 ---

// 计算 maxTokens 滑块的最大值
const maxTokensLimit = computed(() => {
  return props.contextLengthLimit || 131072;
});

// 覆盖配置对象
const overrides = computed(() => ({
  maxTokens: {
    max: maxTokensLimit.value,
  },
}));

// 监听上下文限制变化，自动调整 maxTokens 值
watch(
  () => props.contextLengthLimit,
  (newLimit) => {
    if (
      newLimit &&
      localParams.value.maxTokens !== undefined &&
      localParams.value.maxTokens > newLimit
    ) {
      // 如果当前值超过了新的限制，自动调整到最大值
      updateParameter("maxTokens", newLimit);
    }

    // 同时检查上下文管理的 maxContextTokens 是否超限
    if (
      newLimit &&
      localParams.value.contextManagement?.maxContextTokens &&
      localParams.value.contextManagement.maxContextTokens > newLimit
    ) {
      updateParameter("contextManagement", {
        ...localParams.value.contextManagement,
        maxContextTokens: newLimit,
      });
    }
  }
);

// --- Thinking Budget 与 Max Tokens 联动逻辑 ---
// 确保 maxTokens 始终大于 thinkingBudget (通常需要留出一定的余量用于输出)
const THINKING_OUTPUT_BUFFER = 4096; // 为思考后的回答预留的 token 数

watch(
  () => localParams.value.thinkingBudget,
  (newBudget) => {
    // 仅当启用了思考模式且是 budget 类型时才处理
    if (
      !localParams.value.thinkingEnabled ||
      props.capabilities?.thinkingConfigType !== "budget" ||
      !newBudget
    ) {
      return;
    }

    const currentMaxTokens = localParams.value.maxTokens || 0;
    const requiredMaxTokens = newBudget + THINKING_OUTPUT_BUFFER;

    // 如果当前 maxTokens 不足以容纳 budget + buffer，则自动增加 maxTokens
    if (currentMaxTokens < requiredMaxTokens) {
      // 限制不超过上下文上限
      const limit = maxTokensLimit.value;
      const targetMaxTokens = Math.min(requiredMaxTokens, limit);

      if (targetMaxTokens > currentMaxTokens) {
        updateParameter("maxTokens", targetMaxTokens);
        // 可选：显示轻量提示，但这可能会在拖动滑块时频繁触发，所以暂时不加
      }
    }
  }
);

watch(
  () => localParams.value.maxTokens,
  (newMaxTokens) => {
    // 仅当启用了思考模式且是 budget 类型时才处理
    if (
      !localParams.value.thinkingEnabled ||
      props.capabilities?.thinkingConfigType !== "budget" ||
      !localParams.value.thinkingBudget ||
      !newMaxTokens
    ) {
      return;
    }

    const currentBudget = localParams.value.thinkingBudget;
    // 如果 maxTokens 减小导致空间不足，自动减小 thinkingBudget
    // 允许 budget 稍微挤占 buffer，但不能超过 maxTokens 本身（实际上 Claude 要求 max_tokens > budget_tokens）
    // 这里我们维持一个最小 buffer，比如 1024，或者如果空间实在不够，就让 budget = maxTokens - 1024
    const minBuffer = 1024;

    if (newMaxTokens < currentBudget + minBuffer) {
      const targetBudget = Math.max(1024, newMaxTokens - minBuffer); // 保证 budget 至少有 1024

      if (targetBudget < currentBudget) {
        updateParameter("thinkingBudget", targetBudget);
      }
    }
  }
);

// 监听 thinkingEnabled 开启时，进行一次初始检查
watch(
  () => localParams.value.thinkingEnabled,
  (enabled) => {
    if (enabled && props.capabilities?.thinkingConfigType === "budget") {
      const currentBudget = localParams.value.thinkingBudget || 4096; // 默认值
      const currentMaxTokens = localParams.value.maxTokens || 0;
      const requiredMaxTokens = currentBudget + THINKING_OUTPUT_BUFFER;

      if (currentMaxTokens < requiredMaxTokens) {
        const limit = maxTokensLimit.value;
        const targetMaxTokens = Math.min(requiredMaxTokens, limit);
        if (targetMaxTokens > currentMaxTokens) {
          updateParameter("maxTokens", targetMaxTokens);
        }
      }
    }
  }
);

// --- Gemini 安全设置逻辑 ---

// 判断是否显示安全设置：Provider 支持 OR 模型属于 Gemini 家族
const showSafetySettings = computed(() => {
  if (supportedParameters.value.safetySettings) {
    return true;
  }

  // 如果提供了 modelId，使用元数据判断模型家族
  if (props.modelId) {
    const family = getModelFamily(props.modelId, props.providerType);
    return family === "gemini";
  }

  return false;
});

// --- 上下文管理参数配置 ---
const maxContextTokensConfig: ParameterConfig = {
  key: "maxContextTokens" as any,
  label: "最大上下文 Token 数",
  type: "slider",
  description: "会话历史的最大 Token 数量（0 = 不限制，使用模型默认上限）。",
  group: "basic", // Not used here, but required by type
  supportedKey: "maxTokens", // Not used here, but required by type
  min: 0,
  step: 512,
  defaultValue: 8192,
  hideSwitch: true,
  suggestions: [
    { label: "4K", value: 4096 },
    { label: "8K", value: 8192 },
    { label: "16K", value: 16384 },
    { label: "32K", value: 32768 },
    { label: "64K", value: 65536 },
    { label: "128K", value: 131072 },
    { label: "256K", value: 262144 },
    { label: "512K", value: 524288 },
    { label: "1M", value: 1000000 },
    { label: "2M", value: 2000000 },
    { label: "4M", value: 4000000 },
    { label: "10M", value: 10000000 },
  ],
};

const retainedCharactersConfig: ParameterConfig = {
  key: "retainedCharacters" as any,
  label: "截断保留字符数",
  type: "slider",
  description: "截断消息时保留的开头字符数。0 表示完全删除，推荐 100-200 让消息保留简略开头。",
  group: "basic",
  supportedKey: "maxTokens",
  min: 0,
  max: 500,
  step: 10,
  defaultValue: 100,
};

// --- 上下文统计数据逻辑 ---

// 本地计算的统计数据
const localContextStats = ref<ContextPreviewData["statistics"] | null>(null);
const isLoadingStats = ref(false);

// 最终使用的统计数据（优先使用外部传入）
const contextStats = computed(() => {
  if (props.externalStats !== undefined) {
    return props.externalStats;
  }
  return localContextStats.value;
});

const loadContextStats = async () => {
  // 如果有外部统计数据，跳过本地计算
  if (props.externalStats !== undefined) return;

  const chatStore = useLlmChatStore();
  const session = chatStore.currentSession;

  if (!session || !session.activeLeafId) {
    localContextStats.value = null;
    return;
  }

  isLoadingStats.value = true;
  try {
    const { getLlmContextForPreview } = useChatHandler();
    const previewData = await getLlmContextForPreview(
      session,
      session.activeLeafId,
      agentStore.currentAgentId ?? undefined,
      localParams.value
    );

    if (previewData) {
      localContextStats.value = previewData.statistics;
    }
  } catch (error) {
    console.warn("获取上下文统计失败", error);
    localContextStats.value = null;
  } finally {
    isLoadingStats.value = false;
  }
};

const chatStore = useLlmChatStore();
const agentStore = useAgentStore();
let previousGeneratingCount = 0;

onMounted(() => {
  loadContextStats();
});

// 统一的 Watcher 处理逻辑
const handleStateChange = () => {
  if (props.externalStats === undefined) {
    loadContextStats();
  }
};

watch(() => chatStore.currentSessionId, handleStateChange);
watch(() => chatStore.currentSession?.activeLeafId, handleStateChange);
watch(() => agentStore.currentAgentId, handleStateChange);
watch(() => {
  if (!agentStore.currentAgentId) return null;
  const agent = agentStore.getAgentById(agentStore.currentAgentId);
  return agent?.modelId;
}, handleStateChange);
watch(
  () => localParams.value.contextManagement,
  (newVal, oldVal) => {
    if (isEqual(newVal, oldVal)) return;
    if (props.externalStats === undefined) setTimeout(loadContextStats, 300);
  },
  { deep: true }
);
// 注意：contextCompression 是运行时压缩配置，不影响预览结构，无需触发预览更新
watch(
  () => localParams.value.contextPostProcessing,
  (newVal, oldVal) => {
    if (isEqual(newVal, oldVal)) return;
    if (props.externalStats === undefined) setTimeout(loadContextStats, 300);
  },
  { deep: true }
);
watch(
  () => chatStore.generatingNodes.size,
  (newSize) => {
    if (previousGeneratingCount > 0 && newSize === 0) {
      handleStateChange();
    }
    previousGeneratingCount = newSize;
  }
);
watch(
  () => {
    if (!agentStore.currentAgentId) return null;
    const agent = agentStore.getAgentById(agentStore.currentAgentId);
    return agent?.presetMessages;
  },
  handleStateChange,
  { deep: true }
);
watch(
  () => chatStore.currentSession?.updatedAt,
  (newTime, oldTime) => {
    if (chatStore.generatingNodes.size === 0 && newTime !== oldTime) {
      handleStateChange();
    }
  }
);

// 计算是否有开启的后处理规则 (用于 ContextStatsCard 传递)
const hasActivePostProcessingRules = computed(() => {
  const rules = localParams.value.contextPostProcessing?.rules || [];
  return rules.some((r) => r.enabled);
});
</script>

<template>
  <div class="model-parameters-editor" :class="{ compact }">
    <!-- 基础参数分组 -->
    <ConfigSection title="基础参数" :icon="Setting" v-model:expanded="basicParamsExpanded">
      <ParameterItem
        v-for="config in basicConfigs"
        :key="config.key"
        :config="config"
        :model-value="localParams[config.key]"
        :enabled="isParameterEnabled(config.key)"
        @update:model-value="updateParameter(config.key, $event)"
        @update:enabled="toggleParameterEnabled(config.key, $event)"
        :overrides="overrides[config.key as keyof typeof overrides]"
      />
      <div v-if="basicConfigs.length === 0" class="empty-hint">此模型没有可配置的基础参数</div>
    </ConfigSection>

    <!-- 高级参数分组 -->
    <ConfigSection
      v-if="advancedConfigs.length > 0"
      title="高级参数"
      :icon="Tools"
      v-model:expanded="advancedParamsExpanded"
    >
      <ParameterItem
        v-for="config in advancedConfigs"
        :key="config.key"
        :config="config"
        :model-value="localParams[config.key]"
        :enabled="isParameterEnabled(config.key)"
        @update:model-value="updateParameter(config.key, $event)"
        @update:enabled="toggleParameterEnabled(config.key, $event)"
        :overrides="overrides[config.key as keyof typeof overrides]"
      />
    </ConfigSection>

    <!-- 上下文管理分组 -->
    <ConfigSection title="上下文管理" :icon="Document" v-model:expanded="contextManagementExpanded">
      <!-- 当前上下文统计 -->
      <ContextStatsCard
        :stats="contextStats"
        :max-context-tokens="localParams.contextManagement?.maxContextTokens ?? 0"
        :enabled="localParams.contextManagement?.enabled ?? false"
        :has-active-post-processing-rules="hasActivePostProcessingRules"
      />

      <!-- 启用上下文限制 -->
      <div class="param-group">
        <label class="param-label">
          <span>启用上下文限制</span>
          <el-switch
            :model-value="localParams.contextManagement?.enabled ?? false"
            @update:model-value="
              updateParameter('contextManagement', {
                enabled: $event,
                maxContextTokens: localParams.contextManagement?.maxContextTokens ?? 128000,
                retainedCharacters: localParams.contextManagement?.retainedCharacters ?? 200,
              })
            "
          />
        </label>
        <div class="param-desc">启用后，会在发送前截断过长的会话历史，防止超出模型上下文窗口。</div>
      </div>

      <!-- 最大上下文 Token 数 -->
      <ParameterItem
        v-if="localParams.contextManagement?.enabled"
        :config="maxContextTokensConfig"
        :model-value="localParams.contextManagement?.maxContextTokens"
        :overrides="{ max: contextLengthLimit || 4000000 }"
        :enabled="true"
        @update:model-value="
          updateParameter('contextManagement', {
            ...localParams.contextManagement!,
            maxContextTokens: $event === null ? 0 : $event,
          })
        "
      >
        <template #description-suffix>
          <span v-if="contextLengthLimit" class="limit-hint">
            （当前模型上限: {{ contextLengthLimit.toLocaleString() }}）
          </span>
        </template>
      </ParameterItem>

      <!-- 截断保留字符数 -->
      <ParameterItem
        v-if="localParams.contextManagement?.enabled"
        :config="retainedCharactersConfig"
        :model-value="localParams.contextManagement?.retainedCharacters"
        :enabled="localParams.contextManagement?.retainedCharacters !== undefined"
        @update:enabled="
          updateParameter('contextManagement', {
            ...localParams.contextManagement!,
            retainedCharacters: $event ? 100 : undefined,
          })
        "
        @update:model-value="
          updateParameter('contextManagement', {
            ...localParams.contextManagement!,
            retainedCharacters: $event === null ? 0 : $event,
          })
        "
      />
    </ConfigSection>

    <!-- 上下文压缩分组 -->
    <ConfigSection title="上下文压缩" :icon="Files" v-model:expanded="contextCompressionExpanded">
      <ContextCompressionConfigPanel
        :model-value="localParams.contextCompression || {}"
        @update:model-value="updateParameter('contextCompression', $event)"
      />
    </ConfigSection>

    <!-- 上下文后处理管道分组 -->
    <ConfigSection
      title="上下文后处理"
      :icon="Connection"
      v-model:expanded="postProcessingExpanded"
    >
      <PostProcessingPanel
        :model-value="localParams.contextPostProcessing?.rules"
        @update:model-value="(rules) => updateParameter('contextPostProcessing', { rules })"
      />
    </ConfigSection>

    <!-- Gemini 安全设置分组 -->
    <ConfigSection
      v-if="showSafetySettings"
      title="Gemini 安全设置"
      :icon="Shield"
      v-model:expanded="safetySettingsExpanded"
    >
      <SafetySettingsPanel
        :model-value="localParams.safetySettings"
        @update:model-value="updateParameter('safetySettings', $event)"
      />
    </ConfigSection>

    <!-- 特殊功能分组 -->
    <ConfigSection
      v-if="specialConfigs.length > 0"
      title="特殊功能"
      :icon="MagicStick"
      v-model:expanded="specialFeaturesExpanded"
    >
      <ParameterItem
        v-for="config in specialConfigs"
        :key="config.key"
        :config="config"
        :model-value="localParams[config.key]"
        :enabled="isParameterEnabled(config.key)"
        @update:model-value="updateParameter(config.key, $event)"
        @update:enabled="toggleParameterEnabled(config.key, $event)"
        :overrides="overrides[config.key as keyof typeof overrides]"
      />

      <div class="param-hint">
        其他高级功能（如 Response Format、Tools、Web Search）需要通过代码配置。
      </div>
    </ConfigSection>

    <!-- 自定义参数分组 -->
    <ConfigSection title="自定义参数" :icon="CirclePlus" v-model:expanded="customParamsExpanded">
      <CustomParamsPanel
        :model-value="localParams.custom"
        @update:model-value="updateParameter('custom', $event)"
      />
    </ConfigSection>
  </div>
</template>

<style scoped>
.model-parameters-editor {
  width: 100%;
}
.model-parameters-editor.compact {
  font-size: 12px;
}

.param-group {
  padding: 12px;
  margin-bottom: 20px;
  border-radius: 8px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
}

:deep(.param-group) {
  padding: 12px;
  margin-bottom: 16px;
  border-radius: 8px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color-light);
  transition: all 0.3s ease;
}

.param-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
}

.param-desc {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-color-light);
  line-height: 1.4;
}

.param-hint {
  margin-bottom: 16px;
  padding: 12px;
  background-color: var(--container-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px dashed var(--border-color);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-color-light);
  line-height: 1.5;
}

.limit-hint {
  color: var(--text-color-secondary);
  font-size: 11px;
}

.empty-hint {
  padding: 20px;
  text-align: center;
  color: var(--text-color-secondary);
  font-size: 12px;
  background: var(--container-bg);
  border-radius: 8px;
  border: 1px dashed var(--border-color);
}
</style>
