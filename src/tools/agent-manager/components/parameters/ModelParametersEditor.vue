<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import type { LlmParameters } from "@/tools/llm-chat/types";
import type {
  ProviderType,
  LlmParameterSupport,
  LlmModelInfo,
} from "@/types/llm-profiles";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useLlmChatUiState } from "@/tools/llm-chat/composables/ui/useLlmChatUiState";
import type { ContextPreviewData } from "@/tools/llm-chat/types/context";
import ConfigSection from "@/tools/llm-chat/components/common/ConfigSection.vue";
import ParameterItem from "./ParameterItem.vue";
import ContextCompressionConfigPanel from "./ContextCompressionConfigPanel.vue";
import {
  ParameterConfig,
  parameterConfigs,
} from "@/tools/llm-chat/config/parameter-config";
import { DEFAULT_CONTEXT_COMPRESSION_CONFIG } from "@/tools/llm-chat/types/llm";

import {
  getParameterSettingGroup,
  isEditorParameterVisible,
  isSafetySettingsVisible,
  type ModelParameterGroup,
  type ParameterEditorPresentation,
} from "./parameterEditorConfig";

// 参数面板
import SafetySettingsPanel from "./SafetySettingsPanel.vue";
import PostProcessingPanel from "./PostProcessingPanel.vue";
import CustomParamsPanel from "./CustomParamsPanel.vue";
import ContextStatsCard from "./ContextStatsCard.vue";
import {
  Setting,
  Tools,
  Document,
  Files,
  Connection,
  MagicStick,
  CirclePlus,
} from "@element-plus/icons-vue";
import { Shield, Image } from "lucide-vue-next";

/**
 * 模型参数编辑器组件
 * 根据渠道类型和模型能力智能显示可用的参数
 */

interface Props {
  modelValue: LlmParameters;
  providerType?: ProviderType;
  modelId?: string;
  capabilities?: LlmModelInfo["capabilities"];
  /** 模型的 Token 限制信息 */
  tokenLimits?: LlmModelInfo["tokenLimits"];
  compact?: boolean;
  groups?: readonly ModelParameterGroup[];
  presentation?: ParameterEditorPresentation;
  /** 模型的上下文窗口限制（如果为 undefined 则使用默认最大值） */
  contextLengthLimit?: number;
  /** 由聊天入口传入的上下文统计数据 */
  externalStats?: ContextPreviewData["statistics"] | null;
}

const props = withDefaults(defineProps<Props>(), {
  compact: false,
  externalStats: null,
  presentation: "sidebar",
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
  const newParams: LlmParameters = JSON.parse(JSON.stringify(params));

  // 确保 contextCompression 有默认结构并补全缺失字段
  newParams.contextCompression = {
    ...DEFAULT_CONTEXT_COMPRESSION_CONFIG,
    ...(newParams.contextCompression || {}),
  };

  if (!newParams.enabledParameters) {
    // 获取所有非 undefined 的参数键作为启用的参数
    // 这样既兼容了旧数据（有值的参数保持启用），又满足了新需求（没值的高级参数默认关闭）
    const enabledKeys = (
      Object.keys(newParams) as Array<keyof LlmParameters>
    ).filter((key) => {
      if (key === "enabledParameters" || key === "custom") return false;
      return newParams[key] !== undefined;
    });

    newParams.enabledParameters = enabledKeys as Array<
      keyof Omit<LlmParameters, "custom">
    >;
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
const updateParameter = <K extends keyof LlmParameters>(
  key: K,
  value: LlmParameters[K]
) => {
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

// 设置页独立管理展开状态，侧边栏沿用持久化的折叠偏好。
const expandedState =
  props.presentation === "sidebar"
    ? useLlmChatUiState()
    : {
        basicParamsExpanded: ref(true),
        advancedParamsExpanded: ref(true),
        contextManagementExpanded: ref(true),
        contextCompressionExpanded: ref(true),
        postProcessingExpanded: ref(true),
        safetySettingsExpanded: ref(true),
        specialFeaturesExpanded: ref(true),
        customParamsExpanded: ref(true),
      };
const {
  basicParamsExpanded,
  advancedParamsExpanded,
  contextManagementExpanded,
  contextCompressionExpanded,
  postProcessingExpanded,
  safetySettingsExpanded,
  specialFeaturesExpanded,
  customParamsExpanded,
} = expandedState;

// 图片压缩配置的折叠状态（本地，不持久化）
const imageCompressionExpanded = ref(props.presentation === "settings");
const editorRef = ref<HTMLElement | null>(null);
const expandedGroups = {
  basic: basicParamsExpanded,
  advanced: advancedParamsExpanded,
  contextManagement: contextManagementExpanded,
  contextCompression: contextCompressionExpanded,
  contextPostProcessing: postProcessingExpanded,
  imageCompression: imageCompressionExpanded,
  safetySettings: safetySettingsExpanded,
  special: specialFeaturesExpanded,
  custom: customParamsExpanded,
};
const showGroup = (group: ModelParameterGroup) =>
  !props.groups || props.groups.includes(group);
const revealSetting = async (settingId: string) => {
  const group = getParameterSettingGroup(settingId);
  if (!group || !showGroup(group)) return settingId;
  expandedGroups[group].value = true;
  await nextTick();
  const hasTarget = Array.from(
    editorRef.value?.querySelectorAll<HTMLElement>("[data-setting-id]") || []
  ).some((element) => element.dataset.settingId === settingId);
  return hasTarget ? settingId : `parameters.${group}`;
};
defineExpose({ revealSetting });

// 图片压缩配置的帮助方法
const updateImageCompression = (path: string, value: any) => {
  const current = localParams.value.imageCompression || {
    enabled: false,
    format: "original" as const,
    quality: 0.85,
  };
  const parts = path.split(".");
  const updated = { ...current, [parts[parts.length - 1]]: value };
  updateParameter("imageCompression", updated);
};

// --- 参数配置分组 ---

const basicConfigs = computed(() =>
  processedConfigs.value.filter(
    (c) => c.group === "basic" && shouldShowParameter(c.key)
  )
);

const advancedConfigs = computed(() =>
  processedConfigs.value.filter(
    (c) => c.group === "advanced" && shouldShowParameter(c.key)
  )
);

const specialConfigs = computed(() =>
  processedConfigs.value.filter(
    (c) => c.group === "special" && shouldShowParameter(c.key)
  )
);

// --- 动态参数处理 ---

// 根据 capabilities 动态处理参数配置，特别是 reasoningEffort 的选项和 maxTokens 的建议值
const processedConfigs = computed(() => {
  const cap = props.capabilities;
  const outputLimit = props.tokenLimits?.output;

  return parameterConfigs.map((config) => {
    // 动态过滤 maxTokens 的建议值，不显示超过模型输出上限的选项
    if (config.key === "maxTokens" && outputLimit && config.suggestions) {
      return {
        ...config,
        suggestions: config.suggestions.filter((s) => s.value <= outputLimit),
      };
    }

    if (
      config.key === "reasoningEffort" &&
      cap?.thinkingConfigType === "effort"
    ) {
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

const editorContext = computed(() => ({
  parameters: localParams.value,
  supportedParameters: supportedParameters.value,
  providerType: props.providerType,
  modelId: props.modelId,
  capabilities: props.capabilities,
}));
const shouldShowParameter = (key: keyof LlmParameters) =>
  isEditorParameterVisible(key, editorContext.value);

// --- 动态覆盖逻辑 ---

// 计算 maxTokens 滑块的最大值
const maxTokensLimit = computed(() => {
  // 优先级：模型显式定义的输出限制 > 上下文长度限制 > 默认硬上限
  return props.tokenLimits?.output || props.contextLengthLimit || 131072;
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

const showSafetySettings = computed(() =>
  isSafetySettingsVisible(editorContext.value)
);

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
  description:
    "截断消息时保留的开头字符数。0 表示完全删除，推荐 100-200 让消息保留简略开头。",
  group: "basic",
  supportedKey: "maxTokens",
  min: 0,
  max: 500,
  step: 10,
  defaultValue: 100,
};

// --- 上下文统计数据逻辑 ---

const contextStats = computed(() => props.externalStats ?? null);

// 计算是否有开启的后处理规则 (用于 ContextStatsCard 传递)
const hasActivePostProcessingRules = computed(() => {
  const rules = localParams.value.contextPostProcessing?.rules || [];
  return rules.some((r) => r.enabled);
});
</script>

<template>
  <div ref="editorRef" class="model-parameters-editor" :class="{ compact }">
    <!-- 基础参数分组 -->
    <ConfigSection
      v-if="showGroup('basic')"
      data-setting-id="parameters.basic"
      title="基础参数"
      :icon="Setting"
      v-model:expanded="basicParamsExpanded"
    >
      <ParameterItem
        v-for="config in basicConfigs"
        :key="config.key"
        :config="config"
        :data-setting-id="`parameters.${config.key}`"
        :model-value="localParams[config.key]"
        :enabled="isParameterEnabled(config.key)"
        @update:model-value="updateParameter(config.key, $event)"
        @update:enabled="toggleParameterEnabled(config.key, $event)"
        :overrides="overrides[config.key as keyof typeof overrides]"
      />
      <div v-if="basicConfigs.length === 0" class="empty-hint">
        此模型没有可配置的基础参数
      </div>
    </ConfigSection>

    <!-- 高级参数分组 -->
    <ConfigSection
      v-if="showGroup('advanced') && advancedConfigs.length > 0"
      data-setting-id="parameters.advanced"
      title="高级参数"
      :icon="Tools"
      v-model:expanded="advancedParamsExpanded"
    >
      <ParameterItem
        v-for="config in advancedConfigs"
        :key="config.key"
        :config="config"
        :data-setting-id="`parameters.${config.key}`"
        :model-value="localParams[config.key]"
        :enabled="isParameterEnabled(config.key)"
        @update:model-value="updateParameter(config.key, $event)"
        @update:enabled="toggleParameterEnabled(config.key, $event)"
        :overrides="overrides[config.key as keyof typeof overrides]"
      />
    </ConfigSection>

    <!-- 上下文管理分组 -->
    <ConfigSection
      v-if="showGroup('contextManagement')"
      data-setting-id="parameters.contextManagement"
      title="上下文管理"
      :icon="Document"
      v-model:expanded="contextManagementExpanded"
    >
      <!-- 当前上下文统计 -->
      <ContextStatsCard
        :stats="contextStats"
        :max-context-tokens="
          localParams.contextManagement?.maxContextTokens ?? 0
        "
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
                maxContextTokens:
                  localParams.contextManagement?.maxContextTokens ?? 128000,
                retainedCharacters:
                  localParams.contextManagement?.retainedCharacters ?? 200,
              })
            "
          />
        </label>
        <div class="param-desc">
          启用后，会在发送前截断过长的会话历史，防止超出模型上下文窗口。
        </div>
      </div>

      <!-- 最大上下文 Token 数 -->
      <ParameterItem
        v-if="localParams.contextManagement?.enabled"
        :config="maxContextTokensConfig"
        data-setting-id="parameters.contextManagement.maxContextTokens"
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
        data-setting-id="parameters.contextManagement.retainedCharacters"
        :model-value="localParams.contextManagement?.retainedCharacters"
        :enabled="
          localParams.contextManagement?.retainedCharacters !== undefined
        "
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
    <ConfigSection
      v-if="showGroup('contextCompression')"
      data-setting-id="parameters.contextCompression"
      title="上下文压缩"
      :icon="Files"
      v-model:expanded="contextCompressionExpanded"
    >
      <ContextCompressionConfigPanel
        :model-value="localParams.contextCompression || {}"
        @update:model-value="updateParameter('contextCompression', $event)"
      />
    </ConfigSection>

    <!-- 上下文后处理管道分组 -->
    <ConfigSection
      v-if="showGroup('contextPostProcessing')"
      data-setting-id="parameters.contextPostProcessing"
      title="上下文后处理"
      :icon="Connection"
      v-model:expanded="postProcessingExpanded"
    >
      <PostProcessingPanel
        :model-value="localParams.contextPostProcessing?.rules"
        @update:model-value="
          (rules: any) => updateParameter('contextPostProcessing', { rules })
        "
      />
    </ConfigSection>

    <!-- 图片压缩分组 -->
    <ConfigSection
      v-if="showGroup('imageCompression')"
      data-setting-id="parameters.imageCompression"
      title="图片压缩"
      :icon="Image"
      v-model:expanded="imageCompressionExpanded"
    >
      <div class="param-group">
        <label class="param-label">
          <span>启用图片压缩</span>
          <el-switch
            :model-value="localParams.imageCompression?.enabled ?? false"
            @update:model-value="updateImageCompression('.enabled', $event)"
          />
        </label>
        <div class="param-desc">
          开启后，发送图片给 LLM 时自动进行压缩处理，节省 Token 和带宽。
        </div>
      </div>

      <template v-if="localParams.imageCompression?.enabled">
        <!-- 目标最大尺寸 -->
        <div class="param-group">
          <label class="param-label">
            <span>目标最大尺寸</span>
            <span class="param-value"
              >{{
                localParams.imageCompression?.maxDimension || "不限"
              }}px</span
            >
          </label>
          <el-slider
            :model-value="localParams.imageCompression?.maxDimension"
            :min="256"
            :max="8192"
            :step="128"
            :show-stops="false"
            style="width: 100%"
            @update:model-value="
              updateImageCompression('.maxDimension', $event || undefined)
            "
          />
          <div class="param-desc">
            图片宽高的最大像素值。超出将等比缩小。设为 0 或清空则不额外缩小。
          </div>
          <div
            style="display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap"
          >
            <el-tag
              size="small"
              style="cursor: pointer"
              @click="updateImageCompression('.maxDimension', 1024)"
              >1024</el-tag
            >
            <el-tag
              size="small"
              style="cursor: pointer"
              @click="updateImageCompression('.maxDimension', 2048)"
              >2048</el-tag
            >
            <el-tag
              size="small"
              style="cursor: pointer"
              @click="updateImageCompression('.maxDimension', 4096)"
              >4096</el-tag
            >
          </div>
        </div>

        <!-- 输出格式 -->
        <div class="param-group">
          <label class="param-label">
            <span>输出格式</span>
          </label>
          <el-select
            :model-value="localParams.imageCompression?.format || 'original'"
            @update:model-value="updateImageCompression('.format', $event)"
            style="width: 100%"
          >
            <el-option label="保持原格式" value="original" />
            <el-option label="JPEG（有损，压缩率高）" value="jpeg" />
            <el-option label="WebP（有损，支持透明）" value="webp" />
          </el-select>
          <div class="param-desc">
            <template
              v-if="
                (localParams.imageCompression?.format || 'original') === 'jpeg'
              "
            >
              JPEG 不支持透明通道，会丢失透明度。
            </template>
            <template
              v-else-if="
                (localParams.imageCompression?.format || 'original') === 'webp'
              "
            >
              WebP 支持透明通道，兼容性良好。
            </template>
            <template v-else> 保持图片原有的格式不变，仅做尺寸缩放。 </template>
          </div>
        </div>

        <!-- 质量（仅非 original 时显示） -->
        <div
          v-if="
            (localParams.imageCompression?.format || 'original') !== 'original'
          "
          class="param-group"
        >
          <label class="param-label">
            <span>图片质量</span>
            <span class="param-value"
              >{{
                Math.round(
                  (localParams.imageCompression?.quality ?? 0.85) * 100
                )
              }}%</span
            >
          </label>
          <el-slider
            :model-value="localParams.imageCompression?.quality ?? 0.85"
            :min="0.1"
            :max="1.0"
            :step="0.05"
            style="width: 100%"
            @update:model-value="updateImageCompression('.quality', $event)"
          />
          <div class="param-desc">
            值越高画质越好，文件也越大。85% 是较好的平衡点。
          </div>
        </div>
      </template>
    </ConfigSection>

    <!-- Gemini 安全设置分组 -->
    <ConfigSection
      v-if="showGroup('safetySettings') && showSafetySettings"
      data-setting-id="parameters.safetySettings"
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
      v-if="showGroup('special') && specialConfigs.length > 0"
      data-setting-id="parameters.special"
      title="特殊功能"
      :icon="MagicStick"
      v-model:expanded="specialFeaturesExpanded"
    >
      <ParameterItem
        v-for="config in specialConfigs"
        :key="config.key"
        :config="config"
        :data-setting-id="`parameters.${config.key}`"
        :model-value="localParams[config.key]"
        :enabled="isParameterEnabled(config.key)"
        @update:model-value="updateParameter(config.key, $event)"
        @update:enabled="toggleParameterEnabled(config.key, $event)"
        :overrides="overrides[config.key as keyof typeof overrides]"
      />

      <div class="param-hint">
        其他高级功能（如 Response Format、Tools）需要通过代码配置。
      </div>
    </ConfigSection>

    <!-- 自定义参数分组 -->
    <ConfigSection
      v-if="showGroup('custom')"
      data-setting-id="parameters.custom"
      title="自定义参数"
      :icon="CirclePlus"
      v-model:expanded="customParamsExpanded"
    >
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

.param-value {
  font-size: 12px;
  color: var(--el-color-primary);
  font-weight: 600;
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
