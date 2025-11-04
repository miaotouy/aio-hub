<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import type { LlmParameters } from "../../types";
import type { ProviderType, LlmParameterSupport } from "@/types/llm-profiles";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useLlmChatUiState } from "../../composables/useLlmChatUiState";
import { useLlmChatStore } from "../../store";
import { useAgentStore } from "../../agentStore";
import { useChatHandler } from "../../composables/useChatHandler";
import type { ContextPreviewData } from "../../composables/useChatHandler";
import ConfigSection from "../common/ConfigSection.vue";

/**
 * 模型参数编辑器组件
 * 根据渠道类型和模型能力智能显示可用的参数
 */

interface Props {
  modelValue: LlmParameters;
  providerType?: ProviderType;
  compact?: boolean;
  /** 模型的上下文窗口限制（如果为 undefined 则使用默认最大值） */
  contextLengthLimit?: number;
}

const props = withDefaults(defineProps<Props>(), {
  compact: false,
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

// 本地状态
const localParams = ref<LlmParameters>({ ...props.modelValue });

// 监听外部值变化
watch(
  () => props.modelValue,
  (newVal) => {
    localParams.value = { ...newVal };
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
// 折叠状态管理 - 使用 useLlmChatUiState
const { basicParamsExpanded, advancedParamsExpanded, specialFeaturesExpanded } =
  useLlmChatUiState();

// 上下文管理折叠状态（局部状态）
const contextManagementExpanded = ref(true);
// 上下文后处理折叠状态（局部状态）
const postProcessingExpanded = ref(true);

// 可用的后处理规则定义
const availableRules = [
  {
    type: "merge-system-to-head" as const,
    name: "合并 System 消息到头部",
    description: "将所有 system 角色的消息合并为一条，并放在消息列表的最开头",
    supportsSeparator: true,
  },
  {
    type: "merge-consecutive-roles" as const,
    name: "合并连续相同角色",
    description: "合并连续出现的相同角色消息（如两个 user 消息相邻）",
    supportsSeparator: true,
  },
  {
    type: "convert-system-to-user" as const,
    name: "转换 System 为 User",
    description: "将所有 system 角色转换为 user 角色（适用于不支持 system 角色的模型）",
    supportsSeparator: false,
  },
  {
    type: "ensure-alternating-roles" as const,
    name: "确保角色交替",
    description: "强制实现 user 和 assistant 的严格交替对话模式",
    supportsSeparator: false,
  },
];

// 检查规则是否启用
const isRuleEnabled = (ruleType: string) => {
  const rules = localParams.value.contextPostProcessing?.rules || [];
  return rules.some((r) => r.type === ruleType && r.enabled);
};

// 获取规则的分隔符
const getRuleSeparator = (ruleType: string) => {
  const rules = localParams.value.contextPostProcessing?.rules || [];
  const rule = rules.find((r) => r.type === ruleType);
  return rule?.separator || "";
};

// 切换规则启用状态
const toggleRule = (ruleType: string, enabled: boolean) => {
  const currentRules = localParams.value.contextPostProcessing?.rules || [];

  if (enabled) {
    // 添加规则（如果不存在）
    const exists = currentRules.some((r) => r.type === ruleType);
    if (!exists) {
      const newRules = [
        ...currentRules,
        {
          type: ruleType as any,
          enabled: true,
          separator: "\n\n---\n\n",
        },
      ];
      updateParameter("contextPostProcessing", { rules: newRules });
    } else {
      // 更新现有规则
      const newRules = currentRules.map((r) => (r.type === ruleType ? { ...r, enabled: true } : r));
      updateParameter("contextPostProcessing", { rules: newRules });
    }
  } else {
    // 禁用规则
    const newRules = currentRules.map((r) => (r.type === ruleType ? { ...r, enabled: false } : r));
    updateParameter("contextPostProcessing", { rules: newRules });
  }
};

// 更新规则分隔符
const updateRuleSeparator = (ruleType: string, separator: string) => {
  const currentRules = localParams.value.contextPostProcessing?.rules || [];
  const newRules = currentRules.map((r) => (r.type === ruleType ? { ...r, separator } : r));
  updateParameter("contextPostProcessing", { rules: newRules });
};

// 上下文统计数据
const contextStats = ref<ContextPreviewData["statistics"] | null>(null);
const isLoadingStats = ref(false);

// 获取当前会话的上下文统计
const loadContextStats = async () => {
  const chatStore = useLlmChatStore();
  const session = chatStore.currentSession;

  if (!session || !session.activeLeafId) {
    contextStats.value = null;
    return;
  }

  isLoadingStats.value = true;
  try {
    const { getLlmContextForPreview } = useChatHandler();
    // 传入当前选中的智能体 ID，让上下文构建器使用它来计算统计数据。
    // 如果 currentAgentId 为空，getLlmContextForPreview 内部会处理这种情况，只计算会话历史。
    const previewData = await getLlmContextForPreview(
      session,
      session.activeLeafId,
      agentStore.currentAgentId ?? undefined // 明确传递当前选中的 agentId
    );

    if (previewData) {
      contextStats.value = previewData.statistics;
    }
  } catch (error) {
    console.warn("获取上下文统计失败", error);
    contextStats.value = null;
  } finally {
    isLoadingStats.value = false;
  }
};

// Store 引用（在 setup 顶层）
const chatStore = useLlmChatStore();
const agentStore = useAgentStore();

// 用于跟踪消息生成状态
let previousGeneratingCount = 0;

// 初始加载统计
onMounted(() => {
  loadContextStats();
});

// 监听会话变化，重新加载统计
watch(
  () => chatStore.currentSessionId,
  () => {
    loadContextStats();
  }
);

// 监听活跃叶节点变化
watch(
  () => chatStore.currentSession?.activeLeafId,
  () => {
    loadContextStats();
  }
);

// 监听智能体切换（模型可能改变，需要重新计算上下文统计）
watch(
  () => agentStore.currentAgentId,
  () => {
    loadContextStats();
  }
);

// 监听智能体模型变化（用户在智能体内更换模型）
watch(
  () => {
    if (!agentStore.currentAgentId) return null;
    const agent = agentStore.getAgentById(agentStore.currentAgentId);
    return agent?.modelId;
  },
  () => {
    loadContextStats();
  }
);

// 监听上下文管理参数变化，重新计算统计
watch(
  () => localParams.value.contextManagement,
  () => {
    // 延迟执行，避免频繁更新
    setTimeout(() => {
      loadContextStats();
    }, 300);
  },
  { deep: true }
);

// 监听上下文后处理规则变化，重新计算统计
watch(
  () => localParams.value.contextPostProcessing,
  () => {
    // 延迟执行，避免频繁更新
    setTimeout(() => {
      loadContextStats();
    }, 300);
  },
  { deep: true }
);

// 监听消息生成完成，重新计算统计
// 当 generatingNodes 从有值变为空时，说明所有消息都生成完成了
watch(
  () => chatStore.generatingNodes.size,
  (newSize) => {
    // 只在从生成中变为完成时刷新（size 从 > 0 变为 0）
    if (previousGeneratingCount > 0 && newSize === 0) {
      loadContextStats();
    }
    previousGeneratingCount = newSize;
  }
);

// 监听智能体预设消息变化，重新计算统计
watch(
  () => {
    if (!agentStore.currentAgentId) return null;
    const agent = agentStore.getAgentById(agentStore.currentAgentId);
    return agent?.presetMessages;
  },
  () => {
    loadContextStats();
  },
  { deep: true }
);

// 监听会话中消息的编辑/删除等操作（通过 updatedAt 时间戳）
// 但排除新消息生成时的更新（因为已经在上面的 generatingNodes 监听中处理）
watch(
  () => chatStore.currentSession?.updatedAt,
  (newTime, oldTime) => {
    // 只在非生成状态时才刷新（避免发送消息时立即刷新）
    if (chatStore.generatingNodes.size === 0 && newTime !== oldTime) {
      loadContextStats();
    }
  }
);

// 检查是否有高级参数
const hasAdvancedParams = computed(() => {
  return (
    supportedParameters.value.seed ||
    supportedParameters.value.stop ||
    supportedParameters.value.maxCompletionTokens ||
    supportedParameters.value.reasoningEffort ||
    supportedParameters.value.logprobs ||
    supportedParameters.value.topLogprobs
  );
});

// 检查是否有特殊功能
const hasSpecialFeatures = computed(() => {
  return (
    supportedParameters.value.thinking ||
    supportedParameters.value.webSearch ||
    supportedParameters.value.tools ||
    supportedParameters.value.responseFormat
  );
});

// 计算 maxTokens 滑块的最大值
// 如果模型定义了上下文窗口限制，使用它；否则使用默认值 32768
const maxTokensLimit = computed(() => {
  return props.contextLengthLimit || 32768;
});

// 监听上下文限制变化，自动调整 maxTokens 值
watch(
  () => props.contextLengthLimit,
  (newLimit) => {
    if (newLimit && localParams.value.maxTokens > newLimit) {
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
</script>

<template>
  <div class="model-parameters-editor" :class="{ compact }">
    <!-- 基础参数分组 -->
    <ConfigSection title="基础参数" :icon="'i-ep-setting'" v-model:expanded="basicParamsExpanded">
      <!-- Temperature -->
      <div v-if="supportedParameters.temperature" class="param-group">
        <label class="param-label">
          <span>Temperature</span>
          <el-input-number
            :model-value="localParams.temperature"
            @update:model-value="updateParameter('temperature', $event)"
            :min="0"
            :max="2"
            :step="0.01"
            :precision="2"
            :controls="false"
            class="param-input"
          />
        </label>
        <el-slider
          :model-value="localParams.temperature"
          @update:model-value="updateParameter('temperature', $event)"
          :min="0"
          :max="2"
          :step="0.01"
          :show-tooltip="false"
        />
        <div class="param-desc">
          控制输出的随机性（0-2）。值越高，输出越随机；值越低，输出越确定。
        </div>
      </div>

      <!-- Max Tokens -->
      <div v-if="supportedParameters.maxTokens" class="param-group">
        <label class="param-label">
          <span>Max Tokens</span>
          <el-input-number
            :model-value="localParams.maxTokens"
            @update:model-value="updateParameter('maxTokens', $event)"
            :min="256"
            :max="maxTokensLimit"
            :step="256"
            :controls="false"
            class="param-input"
          />
        </label>
        <el-slider
          :model-value="localParams.maxTokens"
          @update:model-value="updateParameter('maxTokens', $event)"
          :min="256"
          :max="maxTokensLimit"
          :step="256"
          :show-tooltip="false"
        />
        <div class="param-desc">
          单次响应的最大 token 数量。
          <span v-if="contextLengthLimit" class="limit-hint"
            >（受模型上下文窗口限制: {{ contextLengthLimit.toLocaleString() }}）</span
          >
        </div>
      </div>

      <!-- Top P -->
      <div v-if="supportedParameters.topP" class="param-group">
        <label class="param-label">
          <span>Top P</span>
          <el-input-number
            :model-value="localParams.topP ?? 0.9"
            @update:model-value="updateParameter('topP', $event)"
            :min="0"
            :max="1"
            :step="0.01"
            :precision="2"
            :controls="false"
            class="param-input"
          />
        </label>
        <el-slider
          :model-value="localParams.topP ?? 0.9"
          @update:model-value="updateParameter('topP', $event)"
          :min="0"
          :max="1"
          :step="0.01"
          :show-tooltip="false"
        />
        <div class="param-desc">核采样概率（0-1）。控制候选词的多样性。</div>
      </div>

      <!-- Top K -->
      <div v-if="supportedParameters.topK" class="param-group">
        <label class="param-label">
          <span>Top K</span>
          <el-input-number
            :model-value="localParams.topK ?? 40"
            @update:model-value="updateParameter('topK', $event)"
            :min="1"
            :max="100"
            :step="1"
            :controls="false"
            class="param-input"
          />
        </label>
        <el-slider
          :model-value="localParams.topK ?? 40"
          @update:model-value="updateParameter('topK', $event)"
          :min="1"
          :max="100"
          :step="1"
          :show-tooltip="false"
        />
        <div class="param-desc">保留概率最高的 K 个候选词。</div>
      </div>

      <!-- Frequency Penalty -->
      <div v-if="supportedParameters.frequencyPenalty" class="param-group">
        <label class="param-label">
          <span>Frequency Penalty</span>
          <el-input-number
            :model-value="localParams.frequencyPenalty ?? 0"
            @update:model-value="updateParameter('frequencyPenalty', $event)"
            :min="-2"
            :max="2"
            :step="0.01"
            :precision="2"
            :controls="false"
            class="param-input"
          />
        </label>
        <el-slider
          :model-value="localParams.frequencyPenalty ?? 0"
          @update:model-value="updateParameter('frequencyPenalty', $event)"
          :min="-2"
          :max="2"
          :step="0.01"
          :show-tooltip="false"
        />
        <div class="param-desc">降低重复词汇的出现频率（-2.0 到 2.0）。</div>
      </div>

      <!-- Presence Penalty -->
      <div v-if="supportedParameters.presencePenalty" class="param-group">
        <label class="param-label">
          <span>Presence Penalty</span>
          <el-input-number
            :model-value="localParams.presencePenalty ?? 0"
            @update:model-value="updateParameter('presencePenalty', $event)"
            :min="-2"
            :max="2"
            :step="0.01"
            :precision="2"
            :controls="false"
            class="param-input"
          />
        </label>
        <el-slider
          :model-value="localParams.presencePenalty ?? 0"
          @update:model-value="updateParameter('presencePenalty', $event)"
          :min="-2"
          :max="2"
          :step="0.01"
          :show-tooltip="false"
        />
        <div class="param-desc">鼓励模型谈论新话题（-2.0 到 2.0）。</div>
      </div>
    </ConfigSection>

    <!-- 高级参数分组 -->
    <ConfigSection
      v-if="hasAdvancedParams"
      title="高级参数"
      :icon="'i-ep-tools'"
      v-model:expanded="advancedParamsExpanded"
    >
      <!-- Seed -->
      <div v-if="supportedParameters.seed" class="param-group">
        <label class="param-label">
          <span>Seed</span>
          <el-input-number
            :model-value="localParams.seed ?? undefined"
            @update:model-value="updateParameter('seed', $event || undefined)"
            placeholder="随机"
            :controls="false"
            class="param-input"
          />
        </label>
        <div class="param-desc">随机种子，用于确定性采样。设置相同的种子可以获得相同的输出。</div>
      </div>

      <!-- Stop Sequences -->
      <div v-if="supportedParameters.stop" class="param-group">
        <label class="param-label param-label-single">
          <span>Stop Sequences</span>
        </label>
        <el-input
          :model-value="
            Array.isArray(localParams.stop) ? localParams.stop.join(', ') : (localParams.stop ?? '')
          "
          @update:model-value="
            updateParameter(
              'stop',
              $event ? $event.split(',').map((s: string) => s.trim()) : undefined
            )
          "
          placeholder="用逗号分隔多个序列"
        />
        <div class="param-desc">停止序列，模型遇到这些文本时会停止生成。</div>
      </div>

      <!-- Max Completion Tokens -->
      <div v-if="supportedParameters.maxCompletionTokens" class="param-group">
        <label class="param-label">
          <span>Max Completion Tokens</span>
          <el-input-number
            :model-value="localParams.maxCompletionTokens ?? undefined"
            @update:model-value="updateParameter('maxCompletionTokens', $event || undefined)"
            :min="1"
            :max="128000"
            placeholder="默认"
            :controls="false"
            class="param-input"
          />
        </label>
        <div class="param-desc">补全中可生成的最大标记数。优先级高于 Max Tokens。</div>
      </div>

      <!-- Reasoning Effort -->
      <div v-if="supportedParameters.reasoningEffort" class="param-group">
        <label class="param-label">
          <span>Reasoning Effort</span>
          <el-select
            :model-value="localParams.reasoningEffort ?? ''"
            @update:model-value="updateParameter('reasoningEffort', $event || undefined)"
            placeholder="默认"
            style="width: 130px"
          >
            <el-option label="默认" value="" />
            <el-option label="Low（低）" value="low" />
            <el-option label="Medium（中）" value="medium" />
            <el-option label="High（高）" value="high" />
          </el-select>
        </label>
        <div class="param-desc">推理工作约束（OpenAI o1 系列模型）。</div>
      </div>

      <!-- Logprobs -->
      <div v-if="supportedParameters.logprobs" class="param-group">
        <label class="param-label">
          <span>Logprobs</span>
          <el-switch
            :model-value="localParams.logprobs ?? false"
            @update:model-value="updateParameter('logprobs', $event)"
          />
        </label>
        <div class="param-desc">是否返回 logprobs（对数概率）。</div>
      </div>

      <!-- Top Logprobs -->
      <div v-if="supportedParameters.topLogprobs && localParams.logprobs" class="param-group">
        <label class="param-label">
          <span>Top Logprobs</span>
          <el-input-number
            :model-value="localParams.topLogprobs ?? 0"
            @update:model-value="updateParameter('topLogprobs', $event)"
            :min="0"
            :max="20"
            :step="1"
            :controls="false"
            class="param-input"
          />
        </label>
        <el-slider
          :model-value="localParams.topLogprobs ?? 0"
          @update:model-value="updateParameter('topLogprobs', $event)"
          :min="0"
          :max="20"
          :step="1"
          :show-tooltip="false"
        />
        <div class="param-desc">返回的 top logprobs 数量（0-20）。</div>
      </div>
    </ConfigSection>

    <!-- 上下文管理分组 -->
    <ConfigSection
      title="上下文管理"
      :icon="'i-ep-document'"
      v-model:expanded="contextManagementExpanded"
    >
      <!-- 当前上下文统计 -->
      <div v-if="contextStats" class="context-stats-card">
        <div class="stats-title">
          <span>当前上下文使用情况</span>
          <el-tag v-if="contextStats.tokenizerName" size="small" type="info">
            {{ contextStats.isEstimated ? "估算" : "精确" }} - {{ contextStats.tokenizerName }}
          </el-tag>
        </div>
        <div class="stats-grid">
          <div class="stat-item primary">
            <div class="stat-label">总计</div>
            <div class="stat-value">
              <template v-if="contextStats.totalTokenCount !== undefined">
                {{ contextStats.totalTokenCount.toLocaleString() }} tokens
                <span class="char-hint"
                  >{{ contextStats.totalCharCount.toLocaleString() }} 字符</span
                >
              </template>
              <template v-else> {{ contextStats.totalCharCount.toLocaleString() }} 字符 </template>
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-label">系统提示</div>
            <div class="stat-value">
              <template v-if="contextStats.systemPromptTokenCount !== undefined">
                {{ contextStats.systemPromptTokenCount.toLocaleString() }} tokens
              </template>
              <template v-else>
                {{ contextStats.systemPromptCharCount.toLocaleString() }} 字符
              </template>
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-label">预设消息</div>
            <div class="stat-value">
              <template v-if="contextStats.presetMessagesTokenCount !== undefined">
                {{ contextStats.presetMessagesTokenCount.toLocaleString() }} tokens
              </template>
              <template v-else>
                {{ contextStats.presetMessagesCharCount.toLocaleString() }} 字符
              </template>
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-label">会话历史</div>
            <div class="stat-value">
              <template v-if="contextStats.chatHistoryTokenCount !== undefined">
                {{ contextStats.chatHistoryTokenCount.toLocaleString() }} tokens
              </template>
              <template v-else>
                {{ contextStats.chatHistoryCharCount.toLocaleString() }} 字符
              </template>
            </div>
          </div>
        </div>
        <div
          v-if="
            localParams.contextManagement?.enabled &&
            localParams.contextManagement.maxContextTokens > 0
          "
          class="usage-bar"
        >
          <div class="usage-label">
            <span>使用率</span>
            <span class="usage-percent">
              {{
                contextStats.totalTokenCount !== undefined
                  ? Math.round(
                      (contextStats.totalTokenCount /
                        localParams.contextManagement.maxContextTokens) *
                        100
                    )
                  : 0
              }}%
            </span>
          </div>
          <el-progress
            :percentage="
              contextStats.totalTokenCount !== undefined
                ? Math.min(
                    100,
                    Math.round(
                      (contextStats.totalTokenCount /
                        localParams.contextManagement.maxContextTokens) *
                        100
                    )
                  )
                : 0
            "
            :color="
              contextStats.totalTokenCount !== undefined &&
              contextStats.totalTokenCount > localParams.contextManagement.maxContextTokens
                ? '#F56C6C'
                : contextStats.totalTokenCount !== undefined &&
                    contextStats.totalTokenCount >
                      localParams.contextManagement.maxContextTokens * 0.8
                  ? '#E6A23C'
                  : '#67C23A'
            "
            :show-text="false"
          />
        </div>
      </div>

      <!-- 启用上下文限制 -->
      <div class="param-group">
        <label class="param-label">
          <span>启用上下文限制</span>
          <el-switch
            :model-value="localParams.contextManagement?.enabled ?? false"
            @update:model-value="
              updateParameter('contextManagement', {
                enabled: $event,
                maxContextTokens: localParams.contextManagement?.maxContextTokens ?? 4096,
                retainedCharacters: localParams.contextManagement?.retainedCharacters ?? 200,
              })
            "
          />
        </label>
        <div class="param-desc">启用后，会在发送前截断过长的会话历史，防止超出模型上下文窗口。</div>
      </div>

      <!-- 最大上下文 Token 数 -->
      <div v-if="localParams.contextManagement?.enabled" class="param-group">
        <label class="param-label">
          <span>最大上下文 Token 数</span>
          <el-input-number
            :model-value="localParams.contextManagement?.maxContextTokens ?? 4096"
            @update:model-value="
              updateParameter('contextManagement', {
                ...localParams.contextManagement!,
                maxContextTokens: $event || 0,
              })
            "
            :min="0"
            :max="contextLengthLimit || 1000000"
            :step="512"
            :controls="false"
            class="param-input"
          />
        </label>
        <el-slider
          :model-value="localParams.contextManagement?.maxContextTokens ?? 4096"
          @update:model-value="
            updateParameter('contextManagement', {
              ...localParams.contextManagement!,
              maxContextTokens: $event,
            })
          "
          :min="0"
          :max="Math.min(contextLengthLimit || 256000, 256000)"
          :step="512"
          :show-tooltip="false"
        />
        <div class="param-desc">
          会话历史的最大 Token 数量（0 = 不限制，使用模型默认上限）。
          <span v-if="contextLengthLimit" class="limit-hint">
            （当前模型上限: {{ contextLengthLimit.toLocaleString() }}）
          </span>
        </div>
      </div>

      <!-- 截断保留字符数 -->
      <div v-if="localParams.contextManagement?.enabled" class="param-group">
        <label class="param-label">
          <span>截断保留字符数</span>
          <el-input-number
            :model-value="localParams.contextManagement?.retainedCharacters ?? 200"
            @update:model-value="
              updateParameter('contextManagement', {
                ...localParams.contextManagement!,
                retainedCharacters: $event || 0,
              })
            "
            :min="0"
            :max="300"
            :step="10"
            :controls="false"
            class="param-input"
          />
        </label>
        <el-slider
          :model-value="localParams.contextManagement?.retainedCharacters ?? 200"
          @update:model-value="
            updateParameter('contextManagement', {
              ...localParams.contextManagement!,
              retainedCharacters: $event,
            })
          "
          :min="0"
          :max="300"
          :step="10"
          :show-tooltip="false"
        />
        <div class="param-desc">
          截断消息时保留的开头字符数。0 表示完全删除，推荐 100-200 让消息保留简略开头。
        </div>
      </div>
    </ConfigSection>

    <!-- 上下文后处理管道分组 -->
    <ConfigSection
      title="上下文后处理"
      :icon="'i-ep-connection'"
      v-model:expanded="postProcessingExpanded"
    >
      <div class="param-desc" style="margin-bottom: 16px">
        配置消息发送前的后处理规则，用于调整消息格式以适配不同模型的要求。规则按顺序执行。
      </div>

      <!-- 规则列表 -->
      <div class="post-process-rules">
        <div
          v-for="rule in availableRules"
          :key="rule.type"
          class="rule-item"
          :class="{ enabled: isRuleEnabled(rule.type) }"
        >
          <div class="rule-header">
            <el-checkbox
              :model-value="isRuleEnabled(rule.type)"
              @update:model-value="toggleRule(rule.type, $event)"
            >
              <span class="rule-name">{{ rule.name }}</span>
            </el-checkbox>
          </div>
          <div class="rule-desc">{{ rule.description }}</div>

          <!-- 分隔符配置（仅对需要合并的规则显示） -->
          <div v-if="isRuleEnabled(rule.type) && rule.supportsSeparator" class="rule-separator">
            <label class="separator-label">合并分隔符：</label>
            <el-input
              :model-value="getRuleSeparator(rule.type)"
              @update:model-value="updateRuleSeparator(rule.type, $event)"
              placeholder="默认: \n\n---\n\n"
              size="small"
            />
          </div>
        </div>
      </div>

      <div class="param-hint">
        <strong>提示：</strong>规则将按照上述顺序依次执行。建议顺序：先合并 system 消息 →
        合并连续角色 → 转换角色类型 → 确保交替。
      </div>
    </ConfigSection>

    <!-- 特殊功能分组 -->
    <ConfigSection
      v-if="hasSpecialFeatures"
      title="特殊功能"
      :icon="'i-ep-magic-stick'"
      v-model:expanded="specialFeaturesExpanded"
    >
      <!-- Claude Thinking Mode -->
      <div v-if="supportedParameters.thinking" class="param-group">
        <label class="param-label">
          <span>Thinking Mode (Claude)</span>
          <el-switch
            :model-value="localParams.thinking?.type === 'enabled'"
            @update:model-value="
              updateParameter('thinking', $event ? { type: 'enabled' } : { type: 'disabled' })
            "
          />
        </label>
        <div class="param-desc">启用 Claude 的思考模式，模型会先思考再回答。</div>
      </div>

      <div class="param-hint">
        其他高级功能（如 Response Format、Tools、Web Search）需要通过代码配置。
      </div>
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

/* 上下文统计卡片 */
.context-stats-card {
  margin-bottom: 20px;
  padding: 16px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--primary-color) 2%, transparent),
    color-mix(in srgb, var(--primary-color) 1%, transparent)
  );
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
}

.stats-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 12px;
}

.stat-item {
  padding: 10px;
  background-color: var(--container-bg);
  border-radius: 6px;
  border: 1px solid var(--border-color-light);
}

.stat-item.primary {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--el-color-success) 8%, transparent),
    color-mix(in srgb, var(--el-color-success) 4%, transparent)
  );
  border-color: var(--el-color-success);
}

.stat-label {
  font-size: 11px;
  color: var(--text-color-secondary);
  margin-bottom: 4px;
}

.stat-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-item.primary .stat-value {
  font-size: 16px;
  color: var(--el-color-success);
}

.char-hint {
  font-size: 11px;
  font-weight: normal;
  color: var(--text-color-secondary);
}

.usage-bar {
  margin-top: 12px;
}

.usage-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  font-size: 11px;
  color: var(--text-color-secondary);
}

.usage-percent {
  font-weight: 600;
  color: var(--text-color);
}

.limit-hint {
  color: var(--text-color-secondary);
  font-size: 11px;
}

.param-group {
  margin-bottom: 20px;
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

.param-label-single {
  justify-content: flex-start;
}

.param-value {
  font-family: "Consolas", "Monaco", monospace;
  color: var(--primary-color);
  font-size: 12px;
}

.param-input {
  width: 100px !important;
}

/* Element Plus 组件样式调整 */
:deep(.el-slider__runway) {
  background-color: var(--container-bg);
  border: 1px solid var(--border-color);
}

:deep(.el-slider__bar) {
  background-color: var(--primary-color);
}

:deep(.el-slider__button) {
  border-color: var(--primary-color);
  background-color: var(--primary-color);
}

:deep(.el-select .el-input__wrapper) {
  background-color: var(--container-bg);
}

:deep(.el-switch__core) {
  background-color: var(--border-color);
}

:deep(.el-switch.is-checked .el-switch__core) {
  background-color: var(--primary-color);
}

.param-desc {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-color-light);
  line-height: 1.4;
}

.param-hint {
  padding: 12px;
  background-color: var(--container-bg);
  border: 1px dashed var(--border-color);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-color-light);
  line-height: 1.5;
}

/* 修复部分输入框 placeholder 居中的问题 */
:deep(.el-input__inner) {
  text-align: left;
}

/* 上下文后处理规则样式 */
.post-process-rules {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.rule-item {
  padding: 12px;
  background-color: var(--container-bg);
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  transition: all 0.2s;
}

.rule-item.enabled {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--el-color-success) 4%, transparent),
    color-mix(in srgb, var(--el-color-success) 2%, transparent)
  );
  border-color: var(--el-color-success);
}

.rule-item:hover {
  border-color: var(--primary-color);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.rule-header {
  display: flex;
  align-items: center;
  margin-bottom: 4px;
}

.rule-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
}

.rule-desc {
  font-size: 11px;
  color: var(--text-color-secondary);
  line-height: 1.4;
  margin-left: 24px;
  margin-top: 4px;
}

.rule-separator {
  margin-top: 10px;
  margin-left: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.separator-label {
  font-size: 12px;
  color: var(--text-color-secondary);
  white-space: nowrap;
  min-width: 80px;
}

.rule-separator :deep(.el-input) {
  flex: 1;
  max-width: 300px;
}
</style>
