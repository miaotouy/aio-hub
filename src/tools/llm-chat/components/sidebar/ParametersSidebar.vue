<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { useAgentStore } from "../../agentStore";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import { customMessage } from "@/utils/customMessage";

const agentStore = useAgentStore();
const { enabledProfiles, getSupportedParameters } = useLlmProfiles();

// 获取当前智能体（从 store 读取）
const currentAgent = computed(() => {
  if (!agentStore.currentAgentId) return null;
  return agentStore.getAgentById(agentStore.currentAgentId);
});

// 获取当前选中的 profile
const currentProfile = computed(() => {
  if (!currentAgent.value) return null;
  return enabledProfiles.value.find((p) => p.id === currentAgent.value!.profileId);
});

// 获取当前渠道类型
const currentProviderType = computed(() => currentProfile.value?.type);

// 当前选中的模型组合值
const selectedModelCombo = computed({
  get: () => {
    const agent = currentAgent.value;
    if (!agent) return "";
    return `${agent.profileId}:${agent.modelId}`;
  },
  set: (value: string) => {
    if (!value || !currentAgent.value || !agentStore.currentAgentId) return;
    const [profileId, modelId] = value.split(":");
    // 直接更新 Agent 的模型配置
    agentStore.updateAgent(agentStore.currentAgentId, { profileId, modelId });
    customMessage.success("模型已更新");
  },
});

// 本地状态 - 直接从 Agent 读取
const localTemp = ref(currentAgent.value?.parameters.temperature ?? 0.7);
const localMaxTokens = ref(currentAgent.value?.parameters.maxTokens ?? 4096);

// 监听 Agent 变化同步到本地
watch(
  () => currentAgent.value?.parameters.temperature,
  (val) => {
    if (val !== undefined) localTemp.value = val;
  }
);

watch(
  () => currentAgent.value?.parameters.maxTokens,
  (val) => {
    if (val !== undefined) localMaxTokens.value = val;
  }
);

// 更新参数 - 直接保存到 Agent
const updateTemperature = () => {
  if (!currentAgent.value || !agentStore.currentAgentId) return;
  agentStore.updateAgent(agentStore.currentAgentId, {
    parameters: {
      ...currentAgent.value.parameters,
      temperature: localTemp.value,
    },
  });
};

const updateMaxTokens = () => {
  if (!currentAgent.value || !agentStore.currentAgentId) return;
  agentStore.updateAgent(agentStore.currentAgentId, {
    parameters: {
      ...currentAgent.value.parameters,
      maxTokens: localMaxTokens.value,
    },
  });
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

// 扩展的本地状态 - 直接从 Agent 读取
const localTopP = ref(currentAgent.value?.parameters.topP ?? 0.9);
const localTopK = ref(currentAgent.value?.parameters.topK ?? 40);
const localFrequencyPenalty = ref(currentAgent.value?.parameters.frequencyPenalty ?? 0);
const localPresencePenalty = ref(currentAgent.value?.parameters.presencePenalty ?? 0);

// 监听 Agent 变化同步到本地
watch(
  () => currentAgent.value?.parameters.topP,
  (val) => {
    if (val !== undefined) localTopP.value = val;
  }
);

watch(
  () => currentAgent.value?.parameters.topK,
  (val) => {
    if (val !== undefined) localTopK.value = val;
  }
);

watch(
  () => currentAgent.value?.parameters.frequencyPenalty,
  (val) => {
    if (val !== undefined) localFrequencyPenalty.value = val;
  }
);

watch(
  () => currentAgent.value?.parameters.presencePenalty,
  (val) => {
    if (val !== undefined) localPresencePenalty.value = val;
  }
);

// 更新扩展参数 - 直接保存到 Agent
const updateTopP = () => {
  if (!currentAgent.value || !agentStore.currentAgentId) return;
  agentStore.updateAgent(agentStore.currentAgentId, {
    parameters: {
      ...currentAgent.value.parameters,
      topP: localTopP.value,
    },
  });
};

const updateTopK = () => {
  if (!currentAgent.value || !agentStore.currentAgentId) return;
  agentStore.updateAgent(agentStore.currentAgentId, {
    parameters: {
      ...currentAgent.value.parameters,
      topK: localTopK.value,
    },
  });
};

const updateFrequencyPenalty = () => {
  if (!currentAgent.value || !agentStore.currentAgentId) return;
  agentStore.updateAgent(agentStore.currentAgentId, {
    parameters: {
      ...currentAgent.value.parameters,
      frequencyPenalty: localFrequencyPenalty.value,
    },
  });
};

const updatePresencePenalty = () => {
  if (!currentAgent.value || !agentStore.currentAgentId) return;
  agentStore.updateAgent(agentStore.currentAgentId, {
    parameters: {
      ...currentAgent.value.parameters,
      presencePenalty: localPresencePenalty.value,
    },
  });
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
        <LlmModelSelector v-model="selectedModelCombo" />
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
              <span>Temperature</span>
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
              <span>Max Tokens</span>
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
              <span>Top P</span>
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
              <span>Top K</span>
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
              <span>Frequency Penalty</span>
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
              <span>Presence Penalty</span>
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

      <!-- TODO: 会话临时调整功能 -->
      <!-- 未来将在输入框工具区添加一个图标入口，打开小弹窗用于临时调整模型和参数 -->
      <!-- 这个调整会是全局的，不绑定特定会话 -->
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
