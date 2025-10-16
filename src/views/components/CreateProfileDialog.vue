<script setup lang="ts">
import { llmPresets } from "../../config/llm-providers";
import type { LlmPreset } from "../../config/llm-providers";
import type { ProviderType } from "../../types/llm-profiles";
import { useModelMetadata } from "../../composables/useModelMetadata";
import DynamicIcon from "../../components/common/DynamicIcon.vue";

// Props
interface Props {
  visible: boolean;
}

// Emits
interface Emits {
  (e: "update:visible", value: boolean): void;
  (e: "create-from-preset", preset: LlmPreset): void;
  (e: "create-from-blank"): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();

// 使用统一的图标获取方法
const { getDisplayIconPath, getIconPath } = useModelMetadata();

// 从预设创建配置
const createFromPresetTemplate = (preset: LlmPreset) => {
  emit("create-from-preset", preset);
  emit("update:visible", false);
};

// 从空白创建
const createFromBlank = () => {
  emit("create-from-blank");
  emit("update:visible", false);
};

// 获取提供商图标
const getProviderIconForPreset = (providerType: ProviderType) => {
  const iconPath = getIconPath("", providerType);
  return iconPath ? getDisplayIconPath(iconPath) : null;
};
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="选择创建方式"
    width="800px"
    @update:model-value="(val: boolean) => emit('update:visible', val)"
  >
    <div class="preset-options">
      <div class="preset-section">
        <h4>从预设模板创建</h4>
        <p class="preset-section-desc">选择常用服务商快速创建配置</p>

        <!-- OpenAI 兼容格式 -->
        <div class="preset-type-group">
          <div class="preset-type-header">
            <span class="preset-type-badge">OpenAI 兼容</span>
            <span class="preset-type-desc">支持 OpenAI、DeepSeek、Kimi 等兼容接口</span>
          </div>
          <div class="preset-grid">
            <div
              v-for="preset in llmPresets.filter((p) => p.type === 'openai')"
              :key="preset.name"
              class="preset-card"
              @click="createFromPresetTemplate(preset)"
            >
              <div class="preset-icon">
                <DynamicIcon v-if="preset.logoUrl" :src="preset.logoUrl" :alt="preset.name" />
                <DynamicIcon
                  v-else-if="getProviderIconForPreset(preset.type)"
                  :src="getProviderIconForPreset(preset.type)!"
                  :alt="preset.name"
                />
                <div v-else class="preset-placeholder">{{ preset.name.charAt(0) }}</div>
              </div>
              <div class="preset-info">
                <div class="preset-name">{{ preset.name }}</div>
                <div class="preset-desc">{{ preset.description }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Google Gemini 格式 -->
        <div class="preset-type-group">
          <div class="preset-type-header">
            <span class="preset-type-badge gemini">Gemini</span>
            <span class="preset-type-desc">Google Gemini 专用接口</span>
          </div>
          <div class="preset-grid">
            <div
              v-for="preset in llmPresets.filter((p) => p.type === 'gemini')"
              :key="preset.name"
              class="preset-card"
              @click="createFromPresetTemplate(preset)"
            >
              <div class="preset-icon">
                <DynamicIcon v-if="preset.logoUrl" :src="preset.logoUrl" :alt="preset.name" />
                <DynamicIcon
                  v-else-if="getProviderIconForPreset(preset.type)"
                  :src="getProviderIconForPreset(preset.type)!"
                  :alt="preset.name"
                />
                <div v-else class="preset-placeholder">{{ preset.name.charAt(0) }}</div>
              </div>
              <div class="preset-info">
                <div class="preset-name">{{ preset.name }}</div>
                <div class="preset-desc">{{ preset.description }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- OpenAI Responses 格式 -->
        <div class="preset-type-group">
          <div class="preset-type-header">
            <span class="preset-type-badge openai-responses">OpenAI Responses</span>
            <span class="preset-type-desc">OpenAI 新一代有状态交互接口</span>
          </div>
          <div class="preset-grid">
            <div
              v-for="preset in llmPresets.filter((p) => p.type === 'openai-responses')"
              :key="preset.name"
              class="preset-card"
              @click="createFromPresetTemplate(preset)"
            >
              <div class="preset-icon">
                <DynamicIcon v-if="preset.logoUrl" :src="preset.logoUrl" :alt="preset.name" />
                <DynamicIcon
                  v-else-if="getProviderIconForPreset(preset.type)"
                  :src="getProviderIconForPreset(preset.type)!"
                  :alt="preset.name"
                />
                <div v-else class="preset-placeholder">{{ preset.name.charAt(0) }}</div>
              </div>
              <div class="preset-info">
                <div class="preset-name">{{ preset.name }}</div>
                <div class="preset-desc">{{ preset.description }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Anthropic Claude 格式 -->
        <div class="preset-type-group">
          <div class="preset-type-header">
            <span class="preset-type-badge claude">Claude</span>
            <span class="preset-type-desc">Anthropic Claude 专用接口</span>
          </div>
          <div class="preset-grid">
            <div
              v-for="preset in llmPresets.filter((p) => p.type === 'claude')"
              :key="preset.name"
              class="preset-card"
              @click="createFromPresetTemplate(preset)"
            >
              <div class="preset-icon">
                <DynamicIcon v-if="preset.logoUrl" :src="preset.logoUrl" :alt="preset.name" />
                <DynamicIcon
                  v-else-if="getProviderIconForPreset(preset.type)"
                  :src="getProviderIconForPreset(preset.type)!"
                  :alt="preset.name"
                />
                <div v-else class="preset-placeholder">{{ preset.name.charAt(0) }}</div>
              </div>
              <div class="preset-info">
                <div class="preset-name">{{ preset.name }}</div>
                <div class="preset-desc">{{ preset.description }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Cohere 格式 -->
        <div class="preset-type-group">
          <div class="preset-type-header">
            <span class="preset-type-badge cohere">Cohere</span>
            <span class="preset-type-desc">Cohere API v2 企业级服务</span>
          </div>
          <div class="preset-grid">
            <div
              v-for="preset in llmPresets.filter((p) => p.type === 'cohere')"
              :key="preset.name"
              class="preset-card"
              @click="createFromPresetTemplate(preset)"
            >
              <div class="preset-icon">
                <DynamicIcon v-if="preset.logoUrl" :src="preset.logoUrl" :alt="preset.name" />
                <DynamicIcon
                  v-else-if="getProviderIconForPreset(preset.type)"
                  :src="getProviderIconForPreset(preset.type)!"
                  :alt="preset.name"
                />
                <div v-else class="preset-placeholder">{{ preset.name.charAt(0) }}</div>
              </div>
              <div class="preset-info">
                <div class="preset-name">{{ preset.name }}</div>
                <div class="preset-desc">{{ preset.description }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Vertex AI 格式 -->
        <div class="preset-type-group">
          <div class="preset-type-header">
            <span class="preset-type-badge vertexai">Vertex AI</span>
            <span class="preset-type-desc">Google Cloud Vertex AI 企业级服务</span>
          </div>
          <div class="preset-grid">
            <div
              v-for="preset in llmPresets.filter((p) => p.type === 'vertexai')"
              :key="preset.name"
              class="preset-card"
              @click="createFromPresetTemplate(preset)"
            >
              <div class="preset-icon">
                <DynamicIcon v-if="preset.logoUrl" :src="preset.logoUrl" :alt="preset.name" />
                <DynamicIcon
                  v-else-if="getProviderIconForPreset(preset.type)"
                  :src="getProviderIconForPreset(preset.type)!"
                  :alt="preset.name"
                />
                <div v-else class="preset-placeholder">{{ preset.name.charAt(0) }}</div>
              </div>
              <div class="preset-info">
                <div class="preset-name">{{ preset.name }}</div>
                <div class="preset-desc">{{ preset.description }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <el-divider />

      <div class="preset-section">
        <h4>自定义配置</h4>
        <el-button style="width: 100%" @click="createFromBlank"> 从空白创建 </el-button>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
/* 预设选择对话框 */
.preset-options {
  padding: 10px 0;
  max-height: 70vh;
  overflow-y: auto;
}

.preset-section {
  margin-bottom: 20px;
}

.preset-section h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.preset-section-desc {
  margin: 0 0 16px 0;
  font-size: 13px;
  color: var(--text-color-secondary);
}

.preset-type-group {
  margin-bottom: 20px;
}

.preset-type-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.preset-type-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 500;
  background: var(--el-color-primary-light-8);
  color: var(--el-color-primary);
  border-radius: 4px;
  border: 1px solid var(--el-color-primary-light-5);
}

.preset-type-badge.gemini {
  background: var(--el-color-success-light-8);
  color: var(--el-color-success);
  border-color: var(--el-color-success-light-5);
}

.preset-type-badge.claude {
  background: var(--el-color-warning-light-8);
  color: var(--el-color-warning);
  border-color: var(--el-color-warning-light-5);
}

.preset-type-badge.openai-responses {
  background: var(--el-color-info-light-8);
  color: var(--el-color-info);
  border-color: var(--el-color-info-light-5);
}

.preset-type-badge.cohere {
  background: var(--el-color-danger-light-8);
  color: var(--el-color-danger);
  border-color: var(--el-color-danger-light-5);
}

.preset-type-badge.vertexai {
  background: var(--el-color-success-light-8);
  color: var(--el-color-success);
  border-color: var(--el-color-success-light-5);
}

.preset-type-desc {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.preset-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.preset-card:hover {
  border-color: var(--primary-color);
  background: rgba(var(--primary-color-rgb), 0.05);
}

.preset-icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  overflow: hidden;
}

.preset-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.preset-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--primary-color);
  color: white;
  font-size: 18px;
  font-weight: bold;
}

.preset-info {
  flex: 1;
  min-width: 0;
}

.preset-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
  margin-bottom: 4px;
}

.preset-desc {
  font-size: 12px;
  color: var(--text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
