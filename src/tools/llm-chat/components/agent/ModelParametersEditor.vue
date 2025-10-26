<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { LlmParameters } from '../../types';
import type { ProviderType, LlmParameterSupport } from '@/types/llm-profiles';
import { useLlmProfiles } from '@/composables/useLlmProfiles';

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

// 折叠状态管理
const basicParamsExpanded = ref(true);
const advancedParamsExpanded = ref(false);
const specialFeaturesExpanded = ref(false);

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
        <span class="param-section-title">🎯 基础参数</span>
        <span class="collapse-icon">{{ basicParamsExpanded ? "▼" : "▶" }}</span>
      </div>

      <div class="param-section-content" :class="{ collapsed: !basicParamsExpanded }">
        <!-- Temperature -->
        <div v-if="supportedParameters.temperature" class="param-group">
          <label class="param-label">
            <span>Temperature</span>
            <span class="param-value">{{ localParams.temperature.toFixed(2) }}</span>
          </label>
          <input
            :value="localParams.temperature"
            @input="updateParameter('temperature', Number(($event.target as HTMLInputElement).value))"
            type="range"
            min="0"
            max="2"
            step="0.01"
            class="param-slider"
          />
          <div class="param-desc">控制输出的随机性（0-2）。值越高，输出越随机；值越低，输出越确定。</div>
        </div>

        <!-- Max Tokens -->
        <div v-if="supportedParameters.maxTokens" class="param-group">
          <label class="param-label">
            <span>Max Tokens</span>
            <span class="param-value">{{ localParams.maxTokens }}</span>
          </label>
          <input
            :value="localParams.maxTokens"
            @input="updateParameter('maxTokens', Number(($event.target as HTMLInputElement).value))"
            type="range"
            min="256"
            :max="maxTokensLimit"
            step="256"
            class="param-slider"
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
            <span class="param-value">{{ (localParams.topP ?? 0.9).toFixed(2) }}</span>
          </label>
          <input
            :value="localParams.topP ?? 0.9"
            @input="updateParameter('topP', Number(($event.target as HTMLInputElement).value))"
            type="range"
            min="0"
            max="1"
            step="0.01"
            class="param-slider"
          />
          <div class="param-desc">核采样概率（0-1）。控制候选词的多样性。</div>
        </div>

        <!-- Top K -->
        <div v-if="supportedParameters.topK" class="param-group">
          <label class="param-label">
            <span>Top K</span>
            <span class="param-value">{{ localParams.topK ?? 40 }}</span>
          </label>
          <input
            :value="localParams.topK ?? 40"
            @input="updateParameter('topK', Number(($event.target as HTMLInputElement).value))"
            type="range"
            min="1"
            max="100"
            step="1"
            class="param-slider"
          />
          <div class="param-desc">保留概率最高的 K 个候选词。</div>
        </div>

        <!-- Frequency Penalty -->
        <div v-if="supportedParameters.frequencyPenalty" class="param-group">
          <label class="param-label">
            <span>Frequency Penalty</span>
            <span class="param-value">{{ (localParams.frequencyPenalty ?? 0).toFixed(2) }}</span>
          </label>
          <input
            :value="localParams.frequencyPenalty ?? 0"
            @input="updateParameter('frequencyPenalty', Number(($event.target as HTMLInputElement).value))"
            type="range"
            min="-2"
            max="2"
            step="0.01"
            class="param-slider"
          />
          <div class="param-desc">降低重复词汇的出现频率（-2.0 到 2.0）。</div>
        </div>

        <!-- Presence Penalty -->
        <div v-if="supportedParameters.presencePenalty" class="param-group">
          <label class="param-label">
            <span>Presence Penalty</span>
            <span class="param-value">{{ (localParams.presencePenalty ?? 0).toFixed(2) }}</span>
          </label>
          <input
            :value="localParams.presencePenalty ?? 0"
            @input="updateParameter('presencePenalty', Number(($event.target as HTMLInputElement).value))"
            type="range"
            min="-2"
            max="2"
            step="0.01"
            class="param-slider"
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
        <span class="param-section-title">⚙️ 高级参数</span>
        <span class="collapse-icon">{{ advancedParamsExpanded ? "▼" : "▶" }}</span>
      </div>

      <div class="param-section-content" :class="{ collapsed: !advancedParamsExpanded }">
        <!-- Seed -->
        <div v-if="supportedParameters.seed" class="param-group">
          <label class="param-label">
            <span>Seed</span>
            <span class="param-value">{{ localParams.seed ?? '未设置' }}</span>
          </label>
          <input
            :value="localParams.seed ?? ''"
            @input="updateParameter('seed', ($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : undefined)"
            type="number"
            placeholder="留空表示随机"
            class="param-input"
          />
          <div class="param-desc">随机种子，用于确定性采样。设置相同的种子可以获得相同的输出。</div>
        </div>

        <!-- Stop Sequences -->
        <div v-if="supportedParameters.stop" class="param-group">
          <label class="param-label">
            <span>Stop Sequences</span>
          </label>
          <input
            :value="Array.isArray(localParams.stop) ? localParams.stop.join(', ') : (localParams.stop ?? '')"
            @input="updateParameter('stop', ($event.target as HTMLInputElement).value ? ($event.target as HTMLInputElement).value.split(',').map(s => s.trim()) : undefined)"
            type="text"
            placeholder="用逗号分隔多个序列"
            class="param-input"
          />
          <div class="param-desc">停止序列，模型遇到这些文本时会停止生成。</div>
        </div>

        <!-- Max Completion Tokens -->
        <div v-if="supportedParameters.maxCompletionTokens" class="param-group">
          <label class="param-label">
            <span>Max Completion Tokens</span>
            <span class="param-value">{{ localParams.maxCompletionTokens ?? '未设置' }}</span>
          </label>
          <input
            :value="localParams.maxCompletionTokens ?? ''"
            @input="updateParameter('maxCompletionTokens', ($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : undefined)"
            type="number"
            min="1"
            max="128000"
            placeholder="留空使用 Max Tokens"
            class="param-input"
          />
          <div class="param-desc">补全中可生成的最大标记数。优先级高于 Max Tokens。</div>
        </div>

        <!-- Reasoning Effort -->
        <div v-if="supportedParameters.reasoningEffort" class="param-group">
          <label class="param-label">
            <span>Reasoning Effort</span>
          </label>
          <select
            :value="localParams.reasoningEffort ?? ''"
            @change="updateParameter('reasoningEffort', ($event.target as HTMLSelectElement).value as any || undefined)"
            class="param-select"
          >
            <option value="">默认</option>
            <option value="low">Low（低）</option>
            <option value="medium">Medium（中）</option>
            <option value="high">High（高）</option>
          </select>
          <div class="param-desc">推理工作约束（OpenAI o1 系列模型）。</div>
        </div>

        <!-- Logprobs -->
        <div v-if="supportedParameters.logprobs" class="param-group">
          <label class="param-label">
            <span>Logprobs</span>
            <input
              type="checkbox"
              :checked="localParams.logprobs ?? false"
              @change="updateParameter('logprobs', ($event.target as HTMLInputElement).checked)"
              class="param-checkbox"
            />
          </label>
          <div class="param-desc">是否返回 logprobs（对数概率）。</div>
        </div>

        <!-- Top Logprobs -->
        <div v-if="supportedParameters.topLogprobs && localParams.logprobs" class="param-group">
          <label class="param-label">
            <span>Top Logprobs</span>
            <span class="param-value">{{ localParams.topLogprobs ?? 0 }}</span>
          </label>
          <input
            :value="localParams.topLogprobs ?? 0"
            @input="updateParameter('topLogprobs', Number(($event.target as HTMLInputElement).value))"
            type="range"
            min="0"
            max="20"
            step="1"
            class="param-slider"
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
        <span class="param-section-title">✨ 特殊功能</span>
        <span class="collapse-icon">{{ specialFeaturesExpanded ? "▼" : "▶" }}</span>
      </div>

      <div class="param-section-content" :class="{ collapsed: !specialFeaturesExpanded }">
        <!-- Claude Thinking Mode -->
        <div v-if="supportedParameters.thinking" class="param-group">
          <label class="param-label">
            <span>Thinking Mode (Claude)</span>
            <input
              type="checkbox"
              :checked="localParams.thinking?.type === 'enabled'"
              @change="updateParameter('thinking', ($event.target as HTMLInputElement).checked ? { type: 'enabled' } : { type: 'disabled' })"
              class="param-checkbox"
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
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color-light);
  border-radius: 6px;
  transition: all 0.2s;
}

.param-section-header.clickable {
  cursor: pointer;
  user-select: none;
}

.param-section-header.clickable:hover {
  background-color: var(--container-bg);
  border-bottom-color: var(--primary-color);
}

.param-section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color-secondary);
}

.collapse-icon {
  font-size: 12px;
  color: var(--text-color-light);
  transition: transform 0.2s;
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

.param-value {
  font-family: "Consolas", "Monaco", monospace;
  color: var(--primary-color);
  font-size: 12px;
}

.param-slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
  background: var(--container-bg);
  border: 1px solid var(--border-color);
}

.param-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--primary-color);
  cursor: pointer;
  transition: all 0.2s;
}

.param-slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

.param-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--primary-color);
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.param-slider::-moz-range-thumb:hover {
  transform: scale(1.2);
}

.param-input,
.param-select {
  width: 100%;
  padding: 8px 12px;
  font-size: 13px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background-color: var(--container-bg);
  color: var(--text-color);
  transition: border-color 0.2s;
}

.param-input:focus,
.param-select:focus {
  outline: none;
  border-color: var(--primary-color);
}

.param-checkbox {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: var(--primary-color);
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
</style>