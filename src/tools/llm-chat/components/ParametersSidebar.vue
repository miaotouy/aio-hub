<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { useAgentStore } from "../agentStore";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useModelMetadata } from "@/composables/useModelMetadata";
import type { LlmParameters } from "../types";
import type { LlmProfile, LlmModelInfo } from "@/types/llm-profiles";
import DynamicIcon from "@/components/common/DynamicIcon.vue";

interface Props {
  currentAgentId: string;
  parameterOverrides?: Partial<LlmParameters>;
  systemPromptOverride?: string;
}

interface Emits {
  (e: "update:parameterOverrides", overrides: Partial<LlmParameters> | undefined): void;
  (e: "update:systemPromptOverride", override: string | undefined): void;
  (e: "update:profileId", profileId: string): void;
  (e: "update:modelId", modelId: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const agentStore = useAgentStore();
const { enabledProfiles, getSupportedParameters } = useLlmProfiles();
const { getModelIcon } = useModelMetadata();

// 获取当前智能体
const currentAgent = computed(() => agentStore.getAgentById(props.currentAgentId));

// 获取当前选中的 profile
const currentProfile = computed(() => {
  if (!currentAgent.value) return null;
  return enabledProfiles.value.find((p) => p.id === currentAgent.value!.profileId);
});

// 获取当前渠道类型
const currentProviderType = computed(() => currentProfile.value?.type);

// 获取所有可用的模型（按 profile 分组）
const availableModels = computed(() => {
  const models: Array<{
    value: string; // 格式: profileId:modelId
    label: string;
    group: string;
    profile: LlmProfile;
    model: LlmModelInfo;
  }> = [];

  enabledProfiles.value.forEach((profile: LlmProfile) => {
    profile.models.forEach((model: LlmModelInfo) => {
      models.push({
        value: `${profile.id}:${model.id}`,
        label: model.name,
        group: `${profile.name} (${profile.type})`,
        profile,
        model,
      });
    });
  });

  return models;
});

// 当前选中的模型组合值
const selectedModelCombo = computed({
  get: () => {
    const agent = currentAgent.value;
    if (!agent) return "";
    return `${agent.profileId}:${agent.modelId}`;
  },
  set: (value: string) => {
    if (!value) return;
    const [profileId, modelId] = value.split(":");
    emit("update:profileId", profileId);
    emit("update:modelId", modelId);
  },
});

// 计算有效参数（覆盖或默认）
const effectiveTemp = computed(
  () => props.parameterOverrides?.temperature ?? currentAgent.value?.parameters.temperature ?? 0.7
);

const effectiveMaxTokens = computed(
  () => props.parameterOverrides?.maxTokens ?? currentAgent.value?.parameters.maxTokens ?? 4096
);

const effectiveSystemPrompt = computed(
  () => props.systemPromptOverride ?? currentAgent.value?.systemPrompt ?? ""
);

// 本地状态
const localTemp = ref(effectiveTemp.value);
const localMaxTokens = ref(effectiveMaxTokens.value);
const localSystemPrompt = ref(effectiveSystemPrompt.value);

// 监听有效值变化同步到本地
watch(effectiveTemp, (val) => {
  localTemp.value = val;
});

watch(effectiveMaxTokens, (val) => {
  localMaxTokens.value = val;
});

watch(effectiveSystemPrompt, (val) => {
  localSystemPrompt.value = val;
});

// 检查是否有覆盖
const hasTempOverride = computed(() => props.parameterOverrides?.temperature !== undefined);
const hasMaxTokensOverride = computed(() => props.parameterOverrides?.maxTokens !== undefined);
const hasSystemPromptOverride = computed(() => props.systemPromptOverride !== undefined);

// 更新参数
const updateTemperature = () => {
  const defaultValue = currentAgent.value?.parameters.temperature ?? 0.7;
  if (localTemp.value === defaultValue) {
    // 如果等于默认值，移除覆盖
    const newOverrides = { ...props.parameterOverrides };
    delete newOverrides.temperature;
    emit(
      "update:parameterOverrides",
      Object.keys(newOverrides).length > 0 ? newOverrides : undefined
    );
  } else {
    // 设置覆盖
    emit("update:parameterOverrides", {
      ...props.parameterOverrides,
      temperature: localTemp.value,
    });
  }
};

const updateMaxTokens = () => {
  const defaultValue = currentAgent.value?.parameters.maxTokens ?? 4096;
  if (localMaxTokens.value === defaultValue) {
    // 如果等于默认值，移除覆盖
    const newOverrides = { ...props.parameterOverrides };
    delete newOverrides.maxTokens;
    emit(
      "update:parameterOverrides",
      Object.keys(newOverrides).length > 0 ? newOverrides : undefined
    );
  } else {
    // 设置覆盖
    emit("update:parameterOverrides", {
      ...props.parameterOverrides,
      maxTokens: localMaxTokens.value,
    });
  }
};

const updateSystemPrompt = () => {
  const defaultValue = currentAgent.value?.systemPrompt ?? "";
  if (localSystemPrompt.value === defaultValue) {
    // 如果等于默认值，移除覆盖
    emit("update:systemPromptOverride", undefined);
  } else {
    // 设置覆盖
    emit("update:systemPromptOverride", localSystemPrompt.value);
  }
};

// 根据渠道类型获取支持的参数
const supportedParameters = computed(() => {
  const type = currentProviderType.value;
  if (!type) {
    // 默认支持基本参数
    return {
      temperature: true,
      maxTokens: true,
    };
  }
  return getSupportedParameters(type);
});

// 扩展的本地状态
const localTopP = ref(0.9);
const localTopK = ref(40);
const localFrequencyPenalty = ref(0);
const localPresencePenalty = ref(0);

// 监听扩展参数的变化
const effectiveTopP = computed(
  () => props.parameterOverrides?.topP ?? currentAgent.value?.parameters.topP ?? 0.9
);

const effectiveTopK = computed(
  () => props.parameterOverrides?.topK ?? currentAgent.value?.parameters.topK ?? 40
);

const effectiveFrequencyPenalty = computed(
  () =>
    props.parameterOverrides?.frequencyPenalty ??
    currentAgent.value?.parameters.frequencyPenalty ??
    0
);

const effectivePresencePenalty = computed(
  () =>
    props.parameterOverrides?.presencePenalty ?? currentAgent.value?.parameters.presencePenalty ?? 0
);

// 监听有效值变化同步到本地
watch(effectiveTopP, (val) => {
  localTopP.value = val;
});

watch(effectiveTopK, (val) => {
  localTopK.value = val;
});

watch(effectiveFrequencyPenalty, (val) => {
  localFrequencyPenalty.value = val;
});

watch(effectivePresencePenalty, (val) => {
  localPresencePenalty.value = val;
});

// 检查是否有覆盖
const hasTopPOverride = computed(() => props.parameterOverrides?.topP !== undefined);
const hasTopKOverride = computed(() => props.parameterOverrides?.topK !== undefined);
const hasFrequencyPenaltyOverride = computed(
  () => props.parameterOverrides?.frequencyPenalty !== undefined
);
const hasPresencePenaltyOverride = computed(
  () => props.parameterOverrides?.presencePenalty !== undefined
);

// 更新扩展参数的函数
const updateTopP = () => {
  const defaultValue = currentAgent.value?.parameters.topP ?? 0.9;
  if (localTopP.value === defaultValue) {
    const newOverrides = { ...props.parameterOverrides };
    delete newOverrides.topP;
    emit(
      "update:parameterOverrides",
      Object.keys(newOverrides).length > 0 ? newOverrides : undefined
    );
  } else {
    emit("update:parameterOverrides", { ...props.parameterOverrides, topP: localTopP.value });
  }
};

const updateTopK = () => {
  const defaultValue = currentAgent.value?.parameters.topK ?? 40;
  if (localTopK.value === defaultValue) {
    const newOverrides = { ...props.parameterOverrides };
    delete newOverrides.topK;
    emit(
      "update:parameterOverrides",
      Object.keys(newOverrides).length > 0 ? newOverrides : undefined
    );
  } else {
    emit("update:parameterOverrides", { ...props.parameterOverrides, topK: localTopK.value });
  }
};

const updateFrequencyPenalty = () => {
  const defaultValue = currentAgent.value?.parameters.frequencyPenalty ?? 0;
  if (localFrequencyPenalty.value === defaultValue) {
    const newOverrides = { ...props.parameterOverrides };
    delete newOverrides.frequencyPenalty;
    emit(
      "update:parameterOverrides",
      Object.keys(newOverrides).length > 0 ? newOverrides : undefined
    );
  } else {
    emit("update:parameterOverrides", {
      ...props.parameterOverrides,
      frequencyPenalty: localFrequencyPenalty.value,
    });
  }
};

const updatePresencePenalty = () => {
  const defaultValue = currentAgent.value?.parameters.presencePenalty ?? 0;
  if (localPresencePenalty.value === defaultValue) {
    const newOverrides = { ...props.parameterOverrides };
    delete newOverrides.presencePenalty;
    emit(
      "update:parameterOverrides",
      Object.keys(newOverrides).length > 0 ? newOverrides : undefined
    );
  } else {
    emit("update:parameterOverrides", {
      ...props.parameterOverrides,
      presencePenalty: localPresencePenalty.value,
    });
  }
};

// 折叠状态管理
const modelParamsSectionExpanded = ref(true);
const systemPromptSectionExpanded = ref(true);

// 切换分组展开/折叠状态
const toggleSection = (section: "modelParams" | "systemPrompt") => {
  if (section === "modelParams") {
    modelParamsSectionExpanded.value = !modelParamsSectionExpanded.value;
  } else {
    systemPromptSectionExpanded.value = !systemPromptSectionExpanded.value;
  }
};
</script>

<template>
  <div class="parameters-sidebar-content">
    <div class="section-header">
      <h4 v-if="currentAgent">{{ currentAgent.icon }} {{ currentAgent.name }}</h4>
      <h4 v-else>⚙️ 参数配置</h4>
    </div>

    <div v-if="!currentAgent" class="empty-state">
      <p>请先选择智能体</p>
    </div>

    <div v-else class="parameters-form">
      <!-- 模型选择 -->
      <div class="param-group">
        <label class="param-label">
          <span>模型</span>
        </label>
        <el-select
          v-model="selectedModelCombo"
          placeholder="选择模型"
          style="width: 100%"
          :disabled="availableModels.length === 0"
        >
          <el-option-group
            v-for="group in [...new Set(availableModels.map((m) => m.group))]"
            :key="group"
            :label="group"
          >
            <el-option
              v-for="item in availableModels.filter((m) => m.group === group)"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            >
              <div style="display: flex; align-items: center; gap: 8px">
                <!-- 模型图标 -->
                <DynamicIcon
                  v-if="getModelIcon(item.model)"
                  :src="getModelIcon(item.model)!"
                  :alt="item.label"
                  style="width: 20px; height: 20px; object-fit: contain"
                />
                <div
                  v-else
                  style="
                    width: 20px;
                    height: 20px;
                    border-radius: 4px;
                    background: var(--el-color-primary-light-5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 10px;
                    font-weight: 600;
                    color: var(--el-color-primary);
                  "
                >
                  {{ item.model.name.substring(0, 2).toUpperCase() }}
                </div>
                <!-- 模型名称 -->
                <span style="flex: 1">{{ item.label }}</span>
                <!-- 模型分组 -->
                <el-text v-if="item.model.group" size="small" type="info" style="margin-left: auto">
                  {{ item.model.group }}
                </el-text>
              </div>
            </el-option>
          </el-option-group>
        </el-select>
        <el-text
          v-if="availableModels.length === 0"
          size="small"
          type="warning"
          style="margin-top: 8px; display: block"
        >
          请先在设置中配置 LLM 服务并添加模型
        </el-text>
      </div>

      <!-- 模型参数分组 -->
      <div class="param-section">
        <div
          class="param-section-header clickable"
          @click="toggleSection('modelParams')"
          :title="modelParamsSectionExpanded ? '点击折叠' : '点击展开'"
        >
          <span class="param-section-title">🎛️ 模型参数</span>
          <span class="collapse-icon">{{ modelParamsSectionExpanded ? "▼" : "▶" }}</span>
        </div>

        <div class="param-section-content" :class="{ collapsed: !modelParamsSectionExpanded }">
          <!-- Temperature -->
          <div v-if="supportedParameters.temperature" class="param-group">
            <label class="param-label">
              <span>
                Temperature
                <span v-if="hasTempOverride" class="override-badge">已覆盖</span>
              </span>
              <span class="param-value">{{ localTemp.toFixed(2) }}</span>
            </label>
            <input
              v-model.number="localTemp"
              type="range"
              min="0"
              max="2"
              step="0.01"
              class="param-slider"
              @change="updateTemperature"
            />
            <div class="param-desc">
              控制输出的随机性。默认:
              {{ currentAgent.parameters.temperature?.toFixed(2) ?? "0.70" }}
            </div>
          </div>

          <!-- Max Tokens -->
          <div v-if="supportedParameters.maxTokens" class="param-group">
            <label class="param-label">
              <span>
                Max Tokens
                <span v-if="hasMaxTokensOverride" class="override-badge">已覆盖</span>
              </span>
              <span class="param-value">{{ localMaxTokens }}</span>
            </label>
            <input
              v-model.number="localMaxTokens"
              type="range"
              min="256"
              max="32768"
              step="256"
              class="param-slider"
              @change="updateMaxTokens"
            />
            <div class="param-desc">
              单次响应的最大 token 数量。默认: {{ currentAgent.parameters.maxTokens ?? 4096 }}
            </div>
          </div>

          <!-- Top P -->
          <div v-if="supportedParameters.topP" class="param-group">
            <label class="param-label">
              <span>
                Top P
                <span v-if="hasTopPOverride" class="override-badge">已覆盖</span>
              </span>
              <span class="param-value">{{ localTopP.toFixed(2) }}</span>
            </label>
            <input
              v-model.number="localTopP"
              type="range"
              min="0"
              max="1"
              step="0.01"
              class="param-slider"
              @change="updateTopP"
            />
            <div class="param-desc">
              核采样概率，控制候选词的多样性。默认:
              {{ currentAgent.parameters.topP?.toFixed(2) ?? "0.90" }}
            </div>
          </div>

          <!-- Top K -->
          <div v-if="supportedParameters.topK" class="param-group">
            <label class="param-label">
              <span>
                Top K
                <span v-if="hasTopKOverride" class="override-badge">已覆盖</span>
              </span>
              <span class="param-value">{{ localTopK }}</span>
            </label>
            <input
              v-model.number="localTopK"
              type="range"
              min="1"
              max="100"
              step="1"
              class="param-slider"
              @change="updateTopK"
            />
            <div class="param-desc">
              保留概率最高的 K 个候选词。默认: {{ currentAgent.parameters.topK ?? 40 }}
            </div>
          </div>

          <!-- Frequency Penalty -->
          <div v-if="supportedParameters.frequencyPenalty" class="param-group">
            <label class="param-label">
              <span>
                Frequency Penalty
                <span v-if="hasFrequencyPenaltyOverride" class="override-badge">已覆盖</span>
              </span>
              <span class="param-value">{{ localFrequencyPenalty.toFixed(2) }}</span>
            </label>
            <input
              v-model.number="localFrequencyPenalty"
              type="range"
              min="-2"
              max="2"
              step="0.01"
              class="param-slider"
              @change="updateFrequencyPenalty"
            />
            <div class="param-desc">
              降低重复词汇的出现频率。默认:
              {{ currentAgent.parameters.frequencyPenalty?.toFixed(2) ?? "0.00" }}
            </div>
          </div>

          <!-- Presence Penalty -->
          <div v-if="supportedParameters.presencePenalty" class="param-group">
            <label class="param-label">
              <span>
                Presence Penalty
                <span v-if="hasPresencePenaltyOverride" class="override-badge">已覆盖</span>
              </span>
              <span class="param-value">{{ localPresencePenalty.toFixed(2) }}</span>
            </label>
            <input
              v-model.number="localPresencePenalty"
              type="range"
              min="-2"
              max="2"
              step="0.01"
              class="param-slider"
              @change="updatePresencePenalty"
            />
            <div class="param-desc">
              鼓励模型谈论新话题。默认:
              {{ currentAgent.parameters.presencePenalty?.toFixed(2) ?? "0.00" }}
            </div>
          </div>
        </div>
      </div>

      <!-- 系统提示词分组 -->
      <div class="param-section">
        <div
          class="param-section-header clickable"
          @click="toggleSection('systemPrompt')"
          :title="systemPromptSectionExpanded ? '点击折叠' : '点击展开'"
        >
          <span class="param-section-title">📝 系统提示词</span>
          <span class="collapse-icon">{{ systemPromptSectionExpanded ? "▼" : "▶" }}</span>
        </div>

        <div class="param-section-content" :class="{ collapsed: !systemPromptSectionExpanded }">
          <div class="param-group">
            <label class="param-label">
              <span>
                System Prompt
                <span v-if="hasSystemPromptOverride" class="override-badge">已覆盖</span>
              </span>
            </label>
            <textarea
              v-model="localSystemPrompt"
              class="param-textarea"
              placeholder="输入系统提示词，用于定义助手的行为和角色..."
              rows="6"
              @blur="updateSystemPrompt"
            />
            <div class="param-desc">
              系统提示词会在每次对话开始时发送。当前智能体默认:
              {{ currentAgent.systemPrompt || "（无）" }}
            </div>
          </div>

          <!-- 预设模板 -->
          <div class="param-group">
            <label class="param-label">
              <span>快速预设</span>
            </label>
            <div class="preset-buttons">
              <el-button
                @click="
                  localSystemPrompt = '你是一个专业的编程助手，擅长解答技术问题和编写代码。';
                  updateSystemPrompt();
                "
                size="small"
              >
                💻 编程助手
              </el-button>
              <el-button
                @click="
                  localSystemPrompt = '你是一个富有创意的写作助手，善于讲故事和创作内容。';
                  updateSystemPrompt();
                "
                size="small"
              >
                ✍️ 写作助手
              </el-button>
              <el-button
                @click="
                  localSystemPrompt = '你是一个专业的翻译助手，提供准确、流畅的翻译服务。';
                  updateSystemPrompt();
                "
                size="small"
              >
                🌐 翻译助手
              </el-button>
              <el-button
                @click="
                  localSystemPrompt = currentAgent.systemPrompt || '';
                  updateSystemPrompt();
                "
                size="small"
              >
                🔄 恢复默认
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.parameters-sidebar-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.section-header {
  display: flex;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--container-bg);
}

.section-header h4 {
  margin: 0;
  font-size: 16px;
  color: var(--text-color);
  font-weight: 600;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-color-light);
}

.empty-state p {
  margin: 0;
}

.parameters-form {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.param-section {
  margin-bottom: 16px;
}

.param-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
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
  margin-bottom: 24px;
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

.override-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: normal;
  background-color: var(--primary-color);
  color: white;
  border-radius: 3px;
}

.param-value {
  font-family: "Consolas", "Monaco", monospace;
  color: var(--primary-color);
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

.param-desc {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-color-light);
  line-height: 1.4;
}

.param-textarea {
  width: 100%;
  padding: 10px;
  font-size: 13px;
  line-height: 1.5;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background-color: var(--container-bg);
  color: var(--text-color);
  resize: vertical;
  font-family: inherit;
  transition: border-color 0.2s;
}

.param-textarea:focus {
  outline: none;
  border-color: var(--primary-color);
}

.param-textarea::placeholder {
  color: var(--text-color-light);
}

.preset-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

/* 滚动条样式 */
.parameters-form::-webkit-scrollbar {
  width: 6px;
}

.parameters-form::-webkit-scrollbar-track {
  background: transparent;
}

.parameters-form::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb-color);
  border-radius: 3px;
}

.parameters-form::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover-color);
}
</style>
