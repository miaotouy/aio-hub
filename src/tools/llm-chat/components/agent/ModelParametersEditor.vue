<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { Setting, Collection, ChatDotRound, WarningFilled } from "@element-plus/icons-vue";
import type { LlmParameters } from "../../types";
import type { ProviderType, LlmParameterSupport } from "@/types/llm-profiles";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useLlmChatUiState } from "../../composables/useLlmChatUiState";
import { useLlmChatStore } from "../../store";
import { useAgentStore } from "../../agentStore";
import { useChatHandler } from "../../composables/useChatHandler";
import type { ContextPreviewData } from "../../composables/useChatHandler";
import ConfigSection from "../common/ConfigSection.vue";
import ParameterItem from "./ParameterItem.vue";
import { parameterConfigs } from "../../config/parameter-config";

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

// 初始化参数逻辑：如果 enabledParameters 不存在，根据值是否为 undefined 智能推断
const initLocalParams = (params: LlmParameters): LlmParameters => {
  const newParams = { ...params };

  if (!newParams.enabledParameters) {
    // 获取所有非 undefined 的参数键作为启用的参数
    // 这样既兼容了旧数据（有值的参数保持启用），又满足了新需求（没值的高级参数默认关闭）
    const enabledKeys = (Object.keys(newParams) as Array<keyof LlmParameters>).filter((key) => {
      if (key === "enabledParameters") return false;
      return newParams[key] !== undefined;
    });

    newParams.enabledParameters = enabledKeys;
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
  return localParams.value.enabledParameters?.includes(key) ?? false;
};

// 切换参数启用状态
const toggleParameterEnabled = (key: keyof LlmParameters, enabled: boolean) => {
  const currentEnabled = localParams.value.enabledParameters || [];

  let newEnabled: Array<keyof LlmParameters>;

  if (enabled) {
    if (!currentEnabled.includes(key)) {
      newEnabled = [...currentEnabled, key];
    } else {
      newEnabled = currentEnabled;
    }
  } else {
    newEnabled = currentEnabled.filter((k) => k !== key);
  }

  localParams.value = {
    ...localParams.value,
    enabledParameters: newEnabled,
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

// --- 参数配置分组 ---

const basicConfigs = computed(() =>
  parameterConfigs.filter((c) => c.group === "basic" && supportedParameters.value[c.supportedKey])
);

const advancedConfigs = computed(() =>
  parameterConfigs.filter(
    (c) => c.group === "advanced" && supportedParameters.value[c.supportedKey]
  )
);

const specialConfigs = computed(() =>
  parameterConfigs.filter((c) => c.group === "special" && supportedParameters.value[c.supportedKey])
);

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

// --- 上下文后处理逻辑 (保留原有逻辑) ---

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

type RuleType = (typeof availableRules)[number]["type"];

const isRuleEnabled = (ruleType: string) => {
  const rules = localParams.value.contextPostProcessing?.rules || [];
  return rules.some((r) => r.type === ruleType && r.enabled);
};

const getRuleSeparator = (ruleType: string) => {
  const rules = localParams.value.contextPostProcessing?.rules || [];
  const rule = rules.find((r) => r.type === ruleType);
  return rule?.separator || "";
};

const toggleRule = (ruleType: string, enabled: boolean) => {
  const currentRules = localParams.value.contextPostProcessing?.rules || [];

  if (enabled) {
    const exists = currentRules.some((r) => r.type === ruleType);
    if (!exists) {
      const newRules = [
        ...currentRules,
        {
          type: ruleType as RuleType,
          enabled: true,
          separator: "\n\n---\n\n",
        },
      ];
      updateParameter("contextPostProcessing", { rules: newRules });
    } else {
      const newRules = currentRules.map((r) => (r.type === ruleType ? { ...r, enabled: true } : r));
      updateParameter("contextPostProcessing", { rules: newRules });
    }
  } else {
    const newRules = currentRules.map((r) => (r.type === ruleType ? { ...r, enabled: false } : r));
    updateParameter("contextPostProcessing", { rules: newRules });
  }
};

const updateRuleSeparator = (ruleType: string, separator: string) => {
  const currentRules = localParams.value.contextPostProcessing?.rules || [];
  const newRules = currentRules.map((r) => (r.type === ruleType ? { ...r, separator } : r));
  updateParameter("contextPostProcessing", { rules: newRules });
};

// --- 上下文统计数据逻辑 (保留原有逻辑) ---

const contextStats = ref<ContextPreviewData["statistics"] | null>(null);
const isLoadingStats = ref(false);

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
    const previewData = await getLlmContextForPreview(
      session,
      session.activeLeafId,
      agentStore.currentAgentId ?? undefined
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

const chatStore = useLlmChatStore();
const agentStore = useAgentStore();
let previousGeneratingCount = 0;

onMounted(() => {
  loadContextStats();
});

watch(
  () => chatStore.currentSessionId,
  () => loadContextStats()
);
watch(
  () => chatStore.currentSession?.activeLeafId,
  () => loadContextStats()
);
watch(
  () => agentStore.currentAgentId,
  () => loadContextStats()
);
watch(
  () => {
    if (!agentStore.currentAgentId) return null;
    const agent = agentStore.getAgentById(agentStore.currentAgentId);
    return agent?.modelId;
  },
  () => loadContextStats()
);
watch(
  () => localParams.value.contextManagement,
  () => setTimeout(loadContextStats, 300),
  { deep: true }
);
watch(
  () => localParams.value.contextPostProcessing,
  () => setTimeout(loadContextStats, 300),
  { deep: true }
);
watch(
  () => chatStore.generatingNodes.size,
  (newSize) => {
    if (previousGeneratingCount > 0 && newSize === 0) {
      loadContextStats();
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
  () => loadContextStats(),
  { deep: true }
);
watch(
  () => chatStore.currentSession?.updatedAt,
  (newTime, oldTime) => {
    if (chatStore.generatingNodes.size === 0 && newTime !== oldTime) {
      loadContextStats();
    }
  }
);
</script>

<template>
  <div class="model-parameters-editor" :class="{ compact }">
    <!-- 基础参数分组 -->
    <ConfigSection title="基础参数" :icon="'i-ep-setting'" v-model:expanded="basicParamsExpanded">
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
      :icon="'i-ep-tools'"
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
    <ConfigSection
      title="上下文管理"
      :icon="'i-ep-document'"
      v-model:expanded="contextManagementExpanded"
    >
      <!-- 当前上下文统计 -->
      <div v-if="contextStats" class="context-stats-card">
        <!-- 核心指标卡片 -->
        <div class="summary-card">
          <!-- 总数 -->
          <div class="total-section">
            <div class="stat-label">Total Tokens</div>
            <div class="total-value">
              <span class="number">{{
                contextStats.totalTokenCount?.toLocaleString() ?? "---"
              }}</span>
            </div>

            <!-- 使用率展示 -->
            <div
              v-if="
                localParams.contextManagement?.enabled &&
                localParams.contextManagement.maxContextTokens > 0 &&
                contextStats.totalTokenCount !== undefined
              "
              class="usage-info"
            >
              <div class="usage-text">
                <span
                  >使用率
                  {{
                    Math.round(
                      (contextStats.totalTokenCount /
                        localParams.contextManagement.maxContextTokens) *
                        100
                    )
                  }}%</span
                >
                <span class="limit-text"
                  >/ {{ localParams.contextManagement.maxContextTokens.toLocaleString() }}</span
                >
              </div>
              <el-progress
                :percentage="
                  Math.min(
                    100,
                    Math.round(
                      (contextStats.totalTokenCount /
                        localParams.contextManagement.maxContextTokens) *
                        100
                    )
                  )
                "
                :color="
                  contextStats.totalTokenCount > localParams.contextManagement.maxContextTokens
                    ? '#F56C6C'
                    : contextStats.totalTokenCount >
                        localParams.contextManagement.maxContextTokens * 0.8
                      ? '#E6A23C'
                      : '#67C23A'
                "
                :show-text="false"
                :stroke-width="6"
                class="mini-progress"
              />
            </div>

            <div v-if="contextStats.isEstimated" class="estimate-badge">
              <el-icon><WarningFilled /></el-icon>
              <span>估算值 ({{ contextStats.tokenizerName }})</span>
            </div>
            <div v-else class="tokenizer-badge">
              <span>{{ contextStats.tokenizerName }}</span>
            </div>
          </div>

          <!-- 分布详情 -->
          <div class="breakdown-section">
            <!-- 系统提示 -->
            <div class="breakdown-item">
              <div class="item-icon system-icon">
                <el-icon><Setting /></el-icon>
              </div>
              <div class="item-content">
                <div class="item-header">
                  <span class="item-label">系统提示</span>
                  <span class="item-value">
                    {{
                      contextStats.systemPromptTokenCount?.toLocaleString() ??
                      contextStats.systemPromptCharCount.toLocaleString() + " 字符"
                    }}
                  </span>
                </div>
                <div
                  class="progress-bg"
                  v-if="
                    contextStats.totalTokenCount &&
                    contextStats.systemPromptTokenCount !== undefined
                  "
                >
                  <div
                    class="progress-bar system-bar"
                    :style="{
                      width: `${((contextStats.systemPromptTokenCount / contextStats.totalTokenCount) * 100).toFixed(1)}%`,
                    }"
                  ></div>
                </div>
              </div>
            </div>

            <!-- 预设消息 -->
            <div class="breakdown-item">
              <div class="item-icon preset-icon">
                <el-icon><Collection /></el-icon>
              </div>
              <div class="item-content">
                <div class="item-header">
                  <span class="item-label">预设消息</span>
                  <span class="item-value">
                    {{
                      contextStats.presetMessagesTokenCount?.toLocaleString() ??
                      contextStats.presetMessagesCharCount.toLocaleString() + " 字符"
                    }}
                  </span>
                </div>
                <div
                  class="progress-bg"
                  v-if="
                    contextStats.totalTokenCount &&
                    contextStats.presetMessagesTokenCount !== undefined
                  "
                >
                  <div
                    class="progress-bar preset-bar"
                    :style="{
                      width: `${((contextStats.presetMessagesTokenCount / contextStats.totalTokenCount) * 100).toFixed(1)}%`,
                    }"
                  ></div>
                </div>
              </div>
            </div>

            <!-- 会话历史 -->
            <div class="breakdown-item">
              <div class="item-icon history-icon">
                <el-icon><ChatDotRound /></el-icon>
              </div>
              <div class="item-content">
                <div class="item-header">
                  <span class="item-label">会话历史</span>
                  <span class="item-value">
                    {{
                      contextStats.chatHistoryTokenCount?.toLocaleString() ??
                      contextStats.chatHistoryCharCount.toLocaleString() + " 字符"
                    }}
                  </span>
                </div>
                <div
                  class="progress-bg"
                  v-if="
                    contextStats.totalTokenCount && contextStats.chatHistoryTokenCount !== undefined
                  "
                >
                  <div
                    class="progress-bar history-bar"
                    :style="{
                      width: `${((contextStats.chatHistoryTokenCount / contextStats.totalTokenCount) * 100).toFixed(1)}%`,
                    }"
                  ></div>
                </div>
              </div>
            </div>
          </div>

          <!-- 底部辅助信息 -->
          <div class="stats-footer">
            <div class="footer-item">
              <span class="label">总字符数:</span>
              <span class="value">{{ contextStats.totalCharCount.toLocaleString() }}</span>
            </div>
            <div class="footer-item" v-if="contextStats.totalTokenCount">
              <span class="label">Token/字符:</span>
              <span class="value">{{
                (contextStats.totalTokenCount / (contextStats.totalCharCount || 1)).toFixed(3)
              }}</span>
            </div>
          </div>
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
                maxContextTokens: localParams.contextManagement?.maxContextTokens ?? 128000,
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
            :model-value="localParams.contextManagement?.maxContextTokens ?? 8192"
            @update:model-value="
              updateParameter('contextManagement', {
                ...localParams.contextManagement!,
                maxContextTokens: $event || 0,
              })
            "
            :min="0"
            :max="contextLengthLimit || 4000000"
            :step="512"
            :controls="false"
            class="param-input"
          />
        </label>
        <el-slider
          :model-value="localParams.contextManagement?.maxContextTokens ?? 8192"
          @update:model-value="
            updateParameter('contextManagement', {
              ...localParams.contextManagement!,
              maxContextTokens: $event,
            })
          "
          :min="0"
          :max="Math.min(contextLengthLimit || 2000000, 2000000)"
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
      <div class="param-hint">
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
    </ConfigSection>

    <!-- 特殊功能分组 -->
    <ConfigSection
      v-if="specialConfigs.length > 0"
      title="特殊功能"
      :icon="'i-ep-magic-stick'"
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
}

/* 汇总卡片布局 */
.summary-card {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--primary-color) 2%, var(--card-bg)),
    color-mix(in srgb, var(--primary-color) 1%, var(--card-bg))
  );
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 总数区域 */
.total-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  border-bottom: 1px solid var(--border-color-light);
  padding-bottom: 16px;
}

.stat-label {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-bottom: 4px;
  font-weight: 500;
}

.total-value .number {
  font-size: 36px;
  font-weight: 700;
  color: var(--primary-color);
  font-family: "Consolas", "Monaco", monospace;
  letter-spacing: -1px;
  line-height: 1.2;
}

.estimate-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  padding: 2px 8px;
  background-color: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.tokenizer-badge {
  margin-top: 8px;
  padding: 2px 8px;
  background-color: var(--bg-color-soft);
  color: var(--text-color-secondary);
  border-radius: 4px;
  font-size: 11px;
}

.usage-info {
  width: 100%;
  margin-top: 12px;
}

.usage-text {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 11px;
  margin-bottom: 4px;
  color: var(--text-color-secondary);
}

.limit-text {
  opacity: 0.7;
}

/* 分布详情 */
.breakdown-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.breakdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.item-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}

.system-icon {
  background-color: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}
.preset-icon {
  background-color: rgba(139, 92, 246, 0.1);
  color: #8b5cf6;
}
.history-icon {
  background-color: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

.item-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0; /* 防止溢出 */
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}

.item-label {
  color: var(--text-color-secondary);
}

.item-value {
  font-weight: 600;
  color: var(--text-color);
  font-family: "Consolas", monospace;
}

.progress-bg {
  height: 4px;
  background-color: var(--border-color-light);
  border-radius: 2px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
}

.system-bar {
  background-color: #3b82f6;
}
.preset-bar {
  background-color: #8b5cf6;
}
.history-bar {
  background-color: #10b981;
}

/* 底部辅助信息 */
.stats-footer {
  display: flex;
  gap: 16px;
  margin-top: 8px;
  padding: 0 8px;
}

.footer-item {
  font-size: 11px;
  color: var(--text-color-secondary);
  display: flex;
  gap: 4px;
}

.footer-item .value {
  font-family: "Consolas", monospace;
  color: var(--text-color);
}

.limit-hint {
  color: var(--text-color-secondary);
  font-size: 11px;
}

.param-group {
  padding: 12px;
  margin-bottom: 20px;
  border-radius: 8px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
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

.param-input {
  width: 100px !important;
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
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  border-radius: 8px;
  transition: all 0.2s;
}

.rule-item.enabled {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--el-color-success) 4%, var(--container-bg)),
    color-mix(in srgb, var(--el-color-success) 2%, var(--container-bg))
  );
  backdrop-filter: blur(var(--ui-blur));
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
