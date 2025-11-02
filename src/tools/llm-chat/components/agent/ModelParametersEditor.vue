<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { LlmParameters } from '../../types';
import type { ProviderType, LlmParameterSupport } from '@/types/llm-profiles';
import { useLlmProfiles } from '@/composables/useLlmProfiles';
import { useLlmChatUiState } from '../../composables/useLlmChatUiState';

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
  (e: 'update:modelValue', value: LlmParameters): void;
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
watch(() => props.modelValue, (newVal) => {
  localParams.value = { ...newVal };
}, { deep: true });

// 更新参数的通用方法
const updateParameter = <K extends keyof LlmParameters>(key: K, value: LlmParameters[K]) => {
  localParams.value = {
    ...localParams.value,
    [key]: value,
  };
  emit('update:modelValue', localParams.value);
};
// 折叠状态管理 - 使用 useLlmChatUiState
const {
  basicParamsExpanded,
  advancedParamsExpanded,
  specialFeaturesExpanded
} = useLlmChatUiState();

// 切换折叠状态
const toggleSection = (section: 'basic' | 'advanced' | 'special') => {
  if (section === 'basic') {
    basicParamsExpanded.value = !basicParamsExpanded.value;
  } else if (section === 'advanced') {
    advancedParamsExpanded.value = !advancedParamsExpanded.value;
  } else if (section === 'special') {
    specialFeaturesExpanded.value = !specialFeaturesExpanded.value;
  }
};

// 检查是否有高级参数
const hasAdvancedParams = computed(() => {
  return supportedParameters.value.seed ||
    supportedParameters.value.stop ||
    supportedParameters.value.maxCompletionTokens ||
    supportedParameters.value.reasoningEffort ||
    supportedParameters.value.logprobs ||
    supportedParameters.value.topLogprobs;
});

// 检查是否有特殊功能
const hasSpecialFeatures = computed(() => {
  return supportedParameters.value.thinking ||
    supportedParameters.value.webSearch ||
    supportedParameters.value.tools ||
    supportedParameters.value.responseFormat;
});

// 计算 maxTokens 滑块的最大值
// 如果模型定义了上下文窗口限制，使用它；否则使用默认值 32768
const maxTokensLimit = computed(() => {
  return props.contextLengthLimit || 32768;
});

// 监听上下文限制变化，自动调整 maxTokens 值
watch(() => props.contextLengthLimit, (newLimit) => {
  if (newLimit && localParams.value.maxTokens > newLimit) {
    // 如果当前值超过了新的限制，自动调整到最大值
    updateParameter('maxTokens', newLimit);
  }
});
</script>

<template>
  <div class="model-parameters-editor" :class="{ compact }">
    <!-- 基础参数分组 -->
    <div class="param-section">
      <div
        class="param-section-header clickable"
        @click="toggleSection('basic')"
        :title="basicParamsExpanded ? '点击折叠' : '点击展开'"
      >
        <div class="section-title-wrapper">
          <i-ep-setting class="section-icon" />
          <span class="param-section-title">基础参数</span>
        </div>
        <i-ep-arrow-down class="collapse-icon" :class="{ expanded: basicParamsExpanded }" />
      </div>

      <div class="param-section-content" :class="{ collapsed: !basicParamsExpanded }">
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
          <div class="param-desc">控制输出的随机性（0-2）。值越高，输出越随机；值越低，输出越确定。</div>
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
            <span v-if="contextLengthLimit" class="limit-hint">（受模型上下文窗口限制: {{ contextLengthLimit.toLocaleString() }}）</span>
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
      </div>
    </div>

    <!-- 高级参数分组 -->
    <div v-if="hasAdvancedParams" class="param-section">
      <div
        class="param-section-header clickable"
        @click="toggleSection('advanced')"
        :title="advancedParamsExpanded ? '点击折叠' : '点击展开'"
      >
        <div class="section-title-wrapper">
          <i-ep-tools class="section-icon" />
          <span class="param-section-title">高级参数</span>
        </div>
        <i-ep-arrow-down class="collapse-icon" :class="{ expanded: advancedParamsExpanded }" />
      </div>

      <div class="param-section-content" :class="{ collapsed: !advancedParamsExpanded }">
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
            :model-value="Array.isArray(localParams.stop) ? localParams.stop.join(', ') : (localParams.stop ?? '')"
            @update:model-value="updateParameter('stop', $event ? $event.split(',').map((s: string) => s.trim()) : undefined)"
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
      </div>
    </div>

    <!-- 特殊功能分组 -->
    <div v-if="hasSpecialFeatures" class="param-section">
      <div
        class="param-section-header clickable"
        @click="toggleSection('special')"
        :title="specialFeaturesExpanded ? '点击折叠' : '点击展开'"
      >
        <div class="section-title-wrapper">
          <i-ep-magic-stick class="section-icon" />
          <span class="param-section-title">特殊功能</span>
        </div>
        <i-ep-arrow-down class="collapse-icon" :class="{ expanded: specialFeaturesExpanded }" />
      </div>

      <div class="param-section-content" :class="{ collapsed: !specialFeaturesExpanded }">
        <!-- Claude Thinking Mode -->
        <div v-if="supportedParameters.thinking" class="param-group">
          <label class="param-label">
            <span>Thinking Mode (Claude)</span>
            <el-switch
              :model-value="localParams.thinking?.type === 'enabled'"
              @update:model-value="updateParameter('thinking', $event ? { type: 'enabled' } : { type: 'disabled' })"
            />
          </label>
          <div class="param-desc">启用 Claude 的思考模式，模型会先思考再回答。</div>
        </div>

        <div class="param-hint">
          其他高级功能（如 Response Format、Tools、Web Search）需要通过代码配置。
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.model-parameters-editor {
  width: 100%;
}

.model-parameters-editor.compact {
  font-size: 12px;
}

.param-section {
  margin-bottom: 16px;
}

.param-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding: 10px 14px;
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--primary-color) 3%, transparent),
    color-mix(in srgb, var(--primary-color) 1%, transparent)
  );
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.param-section-header::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--primary-color);
  opacity: 0;
  transition: opacity 0.25s;
}

.param-section-header.clickable {
  cursor: pointer;
  user-select: none;
}

.param-section-header.clickable:hover {
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--primary-color) 8%, transparent),
    color-mix(in srgb, var(--primary-color) 4%, transparent)
  );
  border-color: var(--primary-color);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--primary-color) 15%, transparent);
  transform: translateY(-1px);
}

.param-section-header.clickable:hover::before {
  opacity: 1;
}

.param-section-header.clickable:active {
  transform: translateY(0);
}

.section-title-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.section-icon {
  font-size: 16px;
  color: var(--primary-color);
  transition: transform 0.25s;
  flex-shrink: 0;
}

.param-section-header:hover .section-icon {
  transform: scale(1.1);
}

.param-section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
  letter-spacing: 0.3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.collapse-icon {
  font-size: 14px;
  color: var(--text-color-light);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
}

.collapse-icon.expanded {
  transform: rotate(180deg);
  color: var(--primary-color);
}

.param-section-header:hover .collapse-icon {
  color: var(--primary-color);
}

.param-section-content {
  max-height: 2000px;
  overflow: hidden;
  transition:
    max-height 0.3s ease-in-out,
    opacity 0.3s ease-in-out;
  opacity: 1;
}

.param-section-content.collapsed {
  max-height: 0;
  opacity: 0;
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
</style>