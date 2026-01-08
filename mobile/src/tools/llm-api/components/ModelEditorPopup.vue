<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { ChevronLeft, Sparkles, Trash2, Check } from "lucide-vue-next";
import type { LlmModelInfo } from "../types";
import { useModelMetadata } from "../composables/useModelMetadata";
import { MODEL_CAPABILITIES } from "../config/model-capabilities";
import { Snackbar, Dialog } from "@varlet/ui";
import DynamicIcon from "@/components/common/DynamicIcon.vue";
import IconSelector from "./IconSelector.vue";

interface Props {
  show: boolean;
  model?: LlmModelInfo | null;
}

const props = withDefaults(defineProps<Props>(), {
  model: null,
});

interface Emits {
  (e: "update:show", value: boolean): void;
  (e: "save", model: LlmModelInfo): void;
  (e: "delete", modelId: string): void;
}

const emit = defineEmits<Emits>();

const { getMatchedProperties } = useModelMetadata();

const createDefaultCapabilities = () => ({
  vision: false,
  thinking: false,
  toolUse: false,
  webSearch: false,
  codeExecution: false,
  imageGeneration: false,
  videoGeneration: false,
  musicGeneration: false,
  audio: false,
  video: false,
  document: false,
  computerUse: false,
  fileSearch: false,
  jsonOutput: false,
  fim: false,
  prefixCompletion: false,
  embedding: false,
  rerank: false,
  thinkingConfigType: "none" as const,
  reasoningEffortOptions: [],
});

const innerModel = ref<LlmModelInfo>({
  id: "",
  name: "",
  group: "",
  icon: "",
  description: "",
  capabilities: createDefaultCapabilities(),
  tokenLimits: {
    contextLength: undefined,
    output: undefined,
  },
  pricing: {
    prompt: "",
    completion: "",
    request: "",
    image: "",
  },
  provider: "",
});

const showIconSelector = ref(false);
const tokenLimitPresets = [
  { label: "4K", value: 4096 },
  { label: "8K", value: 8192 },
  { label: "16K", value: 16384 },
  { label: "32K", value: 32768 },
  { label: "64K", value: 65536 },
  { label: "128K", value: 128000 },
  { label: "200K", value: 200000 },
];

const contextLengthPresets = [
  { label: "8K", value: 8192 },
  { label: "32K", value: 32768 },
  { label: "64K", value: 65536 },
  { label: "128K", value: 128000 },
  { label: "200K", value: 200000 },
  { label: "1M", value: 1000000 },
];

watch(
  () => props.show,
  (val) => {
    if (val && props.model) {
      innerModel.value = JSON.parse(JSON.stringify(props.model));
      // 确保深层对象存在
      if (!innerModel.value.capabilities)
        innerModel.value.capabilities = createDefaultCapabilities();
      if (!innerModel.value.tokenLimits) innerModel.value.tokenLimits = {};
      if (!innerModel.value.pricing) innerModel.value.pricing = {};
    } else if (val) {
      innerModel.value = {
        id: "",
        name: "",
        group: "",
        icon: "",
        description: "",
        capabilities: createDefaultCapabilities(),
        tokenLimits: {},
        pricing: {},
        provider: "",
      };
    }
  },
  { immediate: true }
);

const isEditMode = computed(() => !!props.model);

const handleApplyPreset = () => {
  if (!innerModel.value.id) {
    Snackbar.warning("请先输入模型 ID");
    return;
  }

  const matchedProps = getMatchedProperties(innerModel.value.id, innerModel.value.provider);
  if (matchedProps) {
    if (matchedProps.icon && !innerModel.value.icon) {
      innerModel.value.icon = matchedProps.icon;
    }
    if (matchedProps.group && !innerModel.value.group) {
      innerModel.value.group = matchedProps.group;
    }
    if (matchedProps.capabilities) {
      innerModel.value.capabilities = {
        ...innerModel.value.capabilities,
        ...matchedProps.capabilities,
      };
    }
    Snackbar.success("已应用预设配置");
  } else {
    Snackbar.info("未找到匹配的预设配置");
  }
};

const handleIconSelect = (icon: any) => {
  innerModel.value.icon = icon.path;
  showIconSelector.value = false;
  Snackbar.success("已选择图标");
};

const handleSave = () => {
  if (!innerModel.value.id.trim()) {
    Snackbar.warning("请输入模型 ID");
    return;
  }
  if (!innerModel.value.name.trim()) {
    Snackbar.warning("请输入模型名称");
    return;
  }

  emit("save", innerModel.value);
  emit("update:show", false);
};

const handleDelete = async () => {
  if (!innerModel.value.id) return;

  const confirm = await Dialog({
    title: "确认删除",
    message: `确定要删除模型 "${innerModel.value.name}" 吗？`,
    confirmButtonText: "确定",
    cancelButtonText: "取消",
  });

  if (confirm === "confirm") {
    emit("delete", innerModel.value.id);
    emit("update:show", false);
  }
};

const toggleCapability = (key: string) => {
  if (!innerModel.value.capabilities) {
    innerModel.value.capabilities = {};
  }
  const current = innerModel.value.capabilities[key as any];
  const newValue = !current;
  innerModel.value.capabilities[key as any] = newValue;

  // 如果是切换思考能力，同步更新思考配置模式
  if (key === "thinking") {
    innerModel.value.capabilities.thinkingConfigType = newValue ? "switch" : "none";
  }
};

const isCapabilityActive = (key: string): boolean => {
  return !!innerModel.value.capabilities?.[key as any];
};

const setTokenLimit = (
  field: keyof NonNullable<LlmModelInfo["tokenLimits"]>,
  value: string | number
) => {
  const numValue = typeof value === "number" ? value : parseInt(value, 10);
  if (!innerModel.value.tokenLimits) {
    innerModel.value.tokenLimits = {};
  }

  if (isNaN(numValue)) {
    delete innerModel.value.tokenLimits[field];
  } else {
    innerModel.value.tokenLimits[field] = numValue;
  }
};
</script>

<template>
  <var-popup
    :show="show"
    @update:show="(val) => emit('update:show', val)"
    position="right"
    style="width: 100%; height: 100%"
  >
    <div class="editor-popup">
      <var-app-bar :title="isEditMode ? '编辑模型' : '添加模型'" fixed safe-area>
        <template #left>
          <var-button round text @click="emit('update:show', false)">
            <ChevronLeft :size="24" />
          </var-button>
        </template>
        <template #right>
          <var-button type="primary" @click="handleSave">保存</var-button>
        </template>
      </var-app-bar>

      <div class="editor-content">
        <div class="section-header">基本信息</div>
        <div class="config-card">
          <!-- 图标选择区域 -->
          <div class="avatar-select-section">
            <div class="avatar-preview-large" v-ripple @click="showIconSelector = true">
              <DynamicIcon :src="innerModel.icon || ''" :alt="innerModel.name" />
            </div>
            <div class="avatar-info">
              <div class="avatar-label">模型图标</div>
              <div class="avatar-hint">点击图标选择预设</div>
            </div>
          </div>

          <div class="form-item">
            <div class="native-input-group">
              <label class="native-input-label">模型 ID *</label>
              <div class="native-input-with-action">
                <input
                  v-model="innerModel.id"
                  type="text"
                  class="native-input mono"
                  placeholder="例如: gpt-4o"
                />
                <button class="input-action-btn" @click="handleApplyPreset">
                  <Sparkles :size="18" />
                </button>
              </div>
              <div class="input-hint">输入 ID 后点击 ✨ 自动填充预设配置</div>
            </div>
          </div>

          <div class="form-item">
            <div class="native-input-group">
              <label class="native-input-label">显示名称 *</label>
              <input
                v-model="innerModel.name"
                type="text"
                class="native-input"
                placeholder="例如: GPT-4o"
              />
            </div>
          </div>

          <div class="form-item">
            <div class="native-input-group">
              <label class="native-input-label">分组</label>
              <input
                v-model="innerModel.group"
                type="text"
                class="native-input"
                placeholder="例如: GPT-4 系列"
              />
            </div>
          </div>

          <div class="form-item">
            <div class="native-input-group">
              <label class="native-input-label">图标路径/URL</label>
              <div class="native-input-with-action">
                <input
                  v-model="innerModel.icon"
                  type="text"
                  class="native-input"
                  placeholder="输入图标路径或URL"
                />
                <button class="input-action-btn" @click="showIconSelector = true">
                  <Sparkles :size="18" />
                </button>
              </div>
            </div>
          </div>

          <div class="form-item">
            <div class="native-input-group">
              <label class="native-input-label">描述</label>
              <input
                v-model="innerModel.description"
                type="text"
                class="native-input"
                placeholder="模型的用途或特性"
              />
            </div>
          </div>
        </div>

        <div class="section-header">Token 限制</div>
        <div class="config-card">
          <div class="form-item">
            <div class="native-input-group">
              <label class="native-input-label">上下文窗口</label>
              <div class="preset-input-row">
                <input
                  :value="innerModel.tokenLimits?.contextLength || ''"
                  type="number"
                  class="native-input mono"
                  placeholder="例如: 128000"
                  @input="(e: any) => setTokenLimit('contextLength', e.target.value)"
                />
                <div class="preset-chips">
                  <var-chip
                    v-for="preset in contextLengthPresets"
                    :key="preset.value"
                    size="small"
                    :type="
                      innerModel.tokenLimits?.contextLength === preset.value ? 'primary' : 'default'
                    "
                    @click="setTokenLimit('contextLength', preset.value.toString())"
                  >
                    {{ preset.label }}
                  </var-chip>
                </div>
              </div>
            </div>
          </div>

          <div class="form-item">
            <div class="native-input-group">
              <label class="native-input-label">输出限制</label>
              <div class="preset-input-row">
                <input
                  :value="innerModel.tokenLimits?.output || ''"
                  type="number"
                  class="native-input mono"
                  placeholder="例如: 16384"
                  @input="(e: any) => setTokenLimit('output', e.target.value)"
                />
                <div class="preset-chips">
                  <var-chip
                    v-for="preset in tokenLimitPresets"
                    :key="preset.value"
                    size="small"
                    :type="innerModel.tokenLimits?.output === preset.value ? 'primary' : 'default'"
                    @click="setTokenLimit('output', preset.value.toString())"
                  >
                    {{ preset.label }}
                  </var-chip>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="section-header">模型能力</div>
        <div class="config-card">
          <div class="capabilities-grid" v-if="innerModel.capabilities">
            <div
              v-for="cap in MODEL_CAPABILITIES.filter(
                (c) => !['embedding', 'rerank'].includes(String(c.key))
              )"
              :key="String(cap.key)"
              class="capability-toggle"
              :class="{
                active: isCapabilityActive(String(cap.key)),
              }"
              :style="{
                '--cap-color': cap.color,
                '--cap-bg': isCapabilityActive(String(cap.key)) ? `${cap.color}15` : 'transparent',
              }"
              @click="toggleCapability(String(cap.key))"
            >
              <component :is="cap.icon" :size="18" />
              <span>{{ cap.label }}</span>
              <Check v-if="isCapabilityActive(String(cap.key))" :size="16" class="check-icon" />
            </div>
          </div>
        </div>

        <div class="section-header">思考配置</div>
        <div class="config-card" v-if="innerModel.capabilities">
          <div class="form-item">
            <div class="native-input-group">
              <label class="native-input-label">配置模式</label>
              <var-select
                v-model="innerModel.capabilities.thinkingConfigType"
                variant="outlined"
                placeholder="请选择配置模式"
                :hint="false"
                :line="false"
                class="custom-var-select"
                @update:model-value="
                  (val: any) => {
                    if (innerModel.capabilities) {
                      innerModel.capabilities.thinking = val !== 'none';
                    }
                  }
                "
              >
                <var-option label="无思考能力" value="none" />
                <var-option label="简单开关 (DeepSeek)" value="switch" />
                <var-option label="预算模式 (Claude)" value="budget" />
                <var-option label="等级模式 (OpenAI o1/o3)" value="effort" />
              </var-select>
            </div>
          </div>
          <div v-if="innerModel.capabilities.thinkingConfigType === 'effort'" class="form-item">
            <div class="native-input-group">
              <label class="native-input-label">可用推理等级</label>
              <div class="preset-chips">
                <var-chip
                  v-for="effort in ['low', 'medium', 'high']"
                  :key="effort"
                  size="small"
                  :type="
                    innerModel.capabilities.reasoningEffortOptions?.includes(effort)
                      ? 'primary'
                      : 'default'
                  "
                  @click="
                    () => {
                      if (!innerModel.capabilities) return;
                      const options = new Set(innerModel.capabilities.reasoningEffortOptions || []);
                      if (options.has(effort)) {
                        options.delete(effort);
                      } else {
                        options.add(effort);
                      }
                      innerModel.capabilities.reasoningEffortOptions = Array.from(options);
                    }
                  "
                >
                  {{ effort }}
                </var-chip>
              </div>
            </div>
          </div>
        </div>

        <div class="section-header">价格配置（待实现）</div>
        <div class="config-card" v-if="innerModel.pricing">
          <div class="pricing-grid">
            <div class="native-input-group">
              <label class="native-input-label">输入 ($/1M)</label>
              <input
                v-model="innerModel.pricing.prompt"
                type="text"
                class="native-input mono"
                placeholder="0.00"
              />
            </div>
            <div class="native-input-group">
              <label class="native-input-label">输出 ($/1M)</label>
              <input
                v-model="innerModel.pricing.completion"
                type="text"
                class="native-input mono"
                placeholder="0.00"
              />
            </div>
            <div class="native-input-group">
              <label class="native-input-label">请求 ($/次)</label>
              <input
                v-model="innerModel.pricing.request"
                type="text"
                class="native-input mono"
                placeholder="0.00"
              />
            </div>
            <div class="native-input-group">
              <label class="native-input-label">图片 ($/1K)</label>
              <input
                v-model="innerModel.pricing.image"
                type="text"
                class="native-input mono"
                placeholder="0.00"
              />
            </div>
          </div>
        </div>

        <div v-if="isEditMode" class="danger-zone">
          <var-button block type="danger" outline @click="handleDelete">
            <Trash2 :size="18" /> 删除此模型
          </var-button>
        </div>
      </div>
    </div>

    <IconSelector v-model:show="showIconSelector" @select="handleIconSelect" />
  </var-popup>
</template>

<style scoped>
.editor-popup {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-surface);
}

.editor-content {
  flex: 1;
  overflow-y: auto;
  padding: 78px 24px 24px;
}

.section-header {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--color-primary);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.config-card {
  background: var(--color-surface-container);
  border-radius: 20px;
  padding: 20px;
  margin-bottom: 32px;
}

.form-item {
  margin-bottom: 20px;
}

.form-item:last-child {
  margin-bottom: 0;
}

.native-input-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}

.native-input-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-on-surface);
}

.native-input {
  width: 100%;
  padding: 14px 16px;
  font-size: 16px;
  line-height: 1.5;
  color: var(--color-on-surface);
  background: var(--color-surface-container);
  border: 1.5px solid var(--color-outline);
  border-radius: 12px;
  outline: none;
  transition: all 0.2s ease;
  -webkit-appearance: none;
  appearance: none;
  box-sizing: border-box;
}

.native-input::placeholder {
  color: var(--color-on-surface);
  opacity: 0.4;
}

.native-input:focus {
  border-color: var(--color-primary);
  background: var(--color-surface-container-high);
  box-shadow: 0 0 0 3px var(--color-primary-container);
}

/* 自定义 VarSelect 样式以匹配 native-input */
.custom-var-select {
  --select-border-radius: 12px;
  --select-padding: 14px 16px;
  --select-font-size: 16px;
  --field-decorator-outlined-border-color: var(--color-outline);
  --field-decorator-focus-color: var(--color-primary);
  --field-decorator-text-color: var(--color-on-surface);
  --field-decorator-placeholder-color: rgba(var(--color-on-surface), 0.4);
}

:deep(.custom-var-select .var-field-decorator--outlined) {
  border-width: 1.5px;
  background: var(--color-surface-container);
  transition: all 0.2s ease;
}

:deep(.custom-var-select .var-field-decorator--focus) {
  background: var(--color-surface-container-high);
  box-shadow: 0 0 0 3px var(--color-primary-container);
}

.native-input.mono {
  font-family: "SF Mono", "Monaco", "Inconsolata", "Roboto Mono", monospace;
  font-size: 14px;
}

.native-input-with-action {
  display: flex;
  align-items: stretch;
  gap: 0;
  background: var(--color-surface-container);
  border: 1.5px solid var(--color-outline);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.2s ease;
}

.native-input-with-action:focus-within {
  border-color: var(--color-primary);
  background: var(--color-surface-container-high);
  box-shadow: 0 0 0 3px var(--color-primary-container);
}

.native-input-with-action .native-input {
  flex: 1;
  border: none;
  border-radius: 0;
  background: transparent;
}

.native-input-with-action .native-input:focus {
  box-shadow: none;
}

.input-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  background: transparent;
  border: none;
  color: var(--color-on-surface);
  opacity: 0.6;
  cursor: pointer;
  transition:
    opacity 0.2s,
    background 0.2s;
}

.input-action-btn:hover {
  opacity: 1;
  background: var(--color-surface-container-highest);
}

.input-action-btn:active {
  background: var(--color-surface-container);
}

.avatar-select-section {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 24px;
  padding: 4px;
}

.avatar-preview-large {
  position: relative;
  width: 80px;
  height: 80px;
  background: var(--color-surface-container-high);
  border-radius: 20px;
  padding: 16px;
  border: 1.5px solid var(--color-outline);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.avatar-info {
  flex: 1;
}

.avatar-label {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
}

.avatar-hint {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.input-hint {
  font-size: 11px;
  color: var(--color-on-surface-variant);
  opacity: 0.6;
  margin-top: 4px;
}

.preset-input-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preset-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.capabilities-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.capability-toggle {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px 8px;
  border-radius: 10px;
  border: 1.5px solid var(--color-outline-variant);
  background: var(--color-surface);
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.capability-toggle.active {
  border-color: var(--cap-color, var(--color-primary));
  background: var(--cap-bg, var(--color-primary-container));
  color: var(--cap-color, var(--color-on-primary-container));
}

.capability-toggle span {
  font-size: 12px;
  font-weight: 500;
  text-align: center;
}

.check-icon {
  position: absolute;
  top: 6px;
  right: 6px;
  color: var(--cap-color, var(--color-primary));
}

.pricing-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.danger-zone {
  margin-top: 16px;
  padding-bottom: 48px;
}
</style>
