<template>
  <BaseDialog
    v-model="isDialogVisible"
    :title="isNew ? '添加规则' : '编辑规则'"
    width="min(90%, 1000px)"
    height="85vh"
    @close="$emit('close')"
  >
    <div v-if="localConfig" class="config-editor-container">
      <el-form :model="localConfig" label-width="100px" label-position="left">
        <!-- 匹配规则 -->
        <el-divider content-position="left">匹配规则</el-divider>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="匹配类型">
              <el-select v-model="localConfig.matchType" style="width: 100%">
                <el-option label="Provider (提供商)" value="provider" />
                <el-option label="Model (精确模型)" value="model" />
                <el-option label="Model Prefix (模型前缀)" value="modelPrefix" />
                <el-option label="Model Group (模型分组)" value="modelGroup" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="优先级">
              <el-input-number
                v-model="localConfig.priority"
                :min="0"
                :max="1000"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="匹配值">
          <el-input v-model="localConfig.matchValue" :placeholder="matchValuePlaceholder" clearable>
            <template #append v-if="canUseRegex">
              <el-checkbox v-model="localConfig.useRegex" label="正则" />
            </template>
          </el-input>
          <div class="form-hint" v-if="localConfig.useRegex">
            使用正则表达式匹配。例如：<code>^gpt-4o</code> 可匹配所有以 gpt-4o 开头的模型
          </div>
        </el-form-item>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="分组名称">
              <el-input v-model="localConfig.properties!.group" placeholder="显示的分组名称" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="启用状态">
              <el-switch v-model="localConfig.enabled" active-text="启用" inactive-text="禁用" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="规则描述">
          <el-input v-model="localConfig.description" placeholder="配置说明（可选）" />
        </el-form-item>

        <!-- 图标设置 -->
        <el-divider content-position="left">图标设置</el-divider>
        <el-form-item label="图标路径">
          <div class="icon-input-wrapper">
            <el-input v-model="localConfig.properties!.icon" placeholder="自定义图标路径或URL">
              <template #append>
                <el-button-group>
                  <el-button @click="handleSelectFile">文件</el-button>
                  <el-button @click="$emit('open-presets')">预设</el-button>
                </el-button-group>
              </template>
            </el-input>
          </div>
        </el-form-item>

        <div v-if="localConfig.properties?.icon" class="icon-preview-section">
          <div class="preview-label">预览:</div>
          <DynamicIcon
            class="preview-icon"
            :src="getDisplayIconPath(localConfig.properties.icon)"
            :alt="localConfig.matchValue || '预览'"
          />
        </div>

        <!-- 模型能力 -->
        <el-collapse v-model="activeSections">
          <el-collapse-item title="模型能力 (Capabilities)" name="capabilities">
            <div class="capabilities-grid">
              <div v-for="capability in MODEL_CAPABILITIES" :key="capability.key" class="capability-item">
                <el-switch v-model="localConfig.properties!.capabilities![capability.key]" size="small" />
                <el-icon v-if="capability.icon" class="capability-icon" :style="{ color: capability.color }">
                  <component :is="capability.icon" />
                </el-icon>
                <span class="capability-label">{{ capability.label }}</span>
                <el-tooltip :content="capability.description" placement="top">
                  <el-icon class="capability-info"><InfoFilled /></el-icon>
                </el-tooltip>
              </div>
            </div>
            <div class="section-hint">
              注：这里编辑的是元数据预设中的默认能力。模型实例的能力以渠道设置中的具体配置为准。
            </div>
          </el-collapse-item>

          <!-- 媒体生成参数规则 (条件显示) -->
          <el-collapse-item v-if="showMediaGenParams" title="媒体生成参数规则 (Media Gen Params)" name="mediaGenParams">
            <div class="placeholder-editor">
              <MediaGenParamsEditor
                v-model="localConfig.properties!.mediaGenParams"
                @update:json="handleMediaGenJsonUpdate"
              />
            </div>
          </el-collapse-item>

          <!-- 扩展属性 -->
          <el-collapse-item title="扩展属性 (Extended Properties)" name="extended">
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="上下文长度">
                  <el-input-number
                    v-model="localConfig.properties!.contextLength"
                    :min="0"
                    :step="1024"
                    controls-position="right"
                    style="width: 100%"
                  />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="分词器">
                  <el-select
                    v-model="localConfig.properties!.tokenizer"
                    placeholder="选择分词器"
                    clearable
                    style="width: 100%"
                  >
                    <el-option label="Tiktoken (OpenAI)" value="tiktoken" />
                    <el-option label="Llama (Meta)" value="llama" />
                    <el-option label="HuggingFace" value="huggingface" />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item label="推荐用途">
              <el-select
                v-model="localConfig.properties!.recommendedFor"
                multiple
                filterable
                allow-create
                default-first-option
                placeholder="输入并回车添加用途"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item label="模型描述">
              <el-input
                v-model="localConfig.properties!.description"
                type="textarea"
                :rows="2"
                placeholder="对该模型的详细描述..."
              />
            </el-form-item>
          </el-collapse-item>

          <!-- JSON 兜底 -->
          <el-collapse-item title="高级：原始 JSON 编辑" name="json">
            <div class="json-editor-wrapper">
              <RichCodeEditor
                v-model="propertiesJsonString"
                language="json"
                :line-numbers="true"
                style="height: 300px"
              />
              <div v-if="jsonError" class="json-error">{{ jsonError }}</div>
            </div>
            <div class="section-hint">⚠️ 直接编辑 properties 对象的 JSON 内容。修改后将同步到上方表单。</div>
          </el-collapse-item>
        </el-collapse>
      </el-form>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="$emit('close')">取消</el-button>
        <el-button type="primary" @click="handleSave">保存配置</el-button>
      </div>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { InfoFilled } from "@element-plus/icons-vue";
import type { ModelMetadataRule, ModelMetadataProperties } from "@/types/model-metadata";
import { MODEL_CAPABILITIES } from "@/config/model-capabilities";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { customMessage } from "@/utils/customMessage";
import BaseDialog from "@/components/common/BaseDialog.vue";
import DynamicIcon from "@/components/common/DynamicIcon.vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import MediaGenParamsEditor from "./MediaGenParamsEditor.vue";

interface Props {
  modelValue: Partial<ModelMetadataRule> | null;
  isNew: boolean;
}

interface Emits {
  (e: "update:modelValue", value: Partial<ModelMetadataRule> | null): void;
  (e: "save", config: Partial<ModelMetadataRule>): void;
  (e: "close"): void;
  (e: "open-presets"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const errorHandler = createModuleErrorHandler("ModelMetadataConfigEditor");
const activeSections = ref(["capabilities"]);
const jsonError = ref<string | null>(null);

const isDialogVisible = computed({
  get: () => !!props.modelValue,
  set: (value) => {
    if (!value) {
      emit("update:modelValue", null);
      emit("close");
    }
  },
});

// 使用 ref 维护本地状态，避免 computed 直接修改 props 导致的警告或同步延迟
const localConfig = ref<Partial<ModelMetadataRule>>({});

// 深度监听 props 变化并同步到本地
watch(
  () => props.modelValue,
  (newVal) => {
    if (newVal) {
      // 确保 properties 和 capabilities 存在
      const config = JSON.parse(JSON.stringify(newVal));
      if (!config.properties) config.properties = {};
      if (!config.properties.capabilities) config.properties.capabilities = {};

      // 确保所有能力键都有值（默认为 false）
      MODEL_CAPABILITIES.forEach((cap) => {
        if (config.properties.capabilities[cap.key] === undefined) {
          config.properties.capabilities[cap.key] = false;
        }
      });

      localConfig.value = config;
    }
  },
  { immediate: true, deep: true },
);

const canUseRegex = computed(() => {
  return localConfig.value.matchType !== "provider" && localConfig.value.matchType !== "modelGroup";
});

const matchValuePlaceholder = computed(() => {
  if (localConfig.value.useRegex) return "正则表达式，例如: ^gpt-4o(-.*)?$";

  switch (localConfig.value.matchType) {
    case "provider":
      return "提供商 ID，例如: openai, anthropic";
    case "model":
      return "完整模型 ID，例如: gpt-4o-2024-08-06";
    case "modelPrefix":
      return "模型 ID 前缀，例如: gpt-4o, claude-3-5";
    case "modelGroup":
      return "模型分组名称";
    default:
      return "匹配值";
  }
});

const showMediaGenParams = computed(() => {
  return localConfig.value.properties?.capabilities?.imageGeneration === true;
});

// JSON 字符串的双向绑定
const propertiesJsonString = computed({
  get: () => {
    try {
      return JSON.stringify(localConfig.value.properties || {}, null, 2);
    } catch (e) {
      return "{}";
    }
  },
  set: (val) => {
    if (!val.trim()) return;
    try {
      const parsed = JSON.parse(val);
      localConfig.value.properties = parsed;
      jsonError.value = null;
    } catch (e: any) {
      jsonError.value = `JSON 语法错误: ${e.message}`;
    }
  },
});

function handleMediaGenJsonUpdate() {
  // 当子组件内部触发了复杂的 JSON 变更时，可以调用此方法强制刷新
}

function handleSave() {
  if (!localConfig.value.matchValue) {
    customMessage.warning("请填写匹配值");
    return;
  }

  // 清理数据
  const configToSave = JSON.parse(JSON.stringify(localConfig.value));
  configToSave.properties = cleanProperties(configToSave.properties);

  emit("save", configToSave);
}

function cleanProperties(props: ModelMetadataProperties): ModelMetadataProperties {
  const cleaned = { ...props };

  // 移除空的 capabilities (如果全是 false)
  if (cleaned.capabilities) {
    const hasActive = Object.values(cleaned.capabilities).some((v) => v === true);
    if (!hasActive) delete cleaned.capabilities;
  }

  // 移除空字符串和 undefined
  if (!cleaned.icon) delete cleaned.icon;
  if (!cleaned.group) delete cleaned.group;
  if (!cleaned.tokenizer) delete cleaned.tokenizer;
  if (cleaned.contextLength === undefined || cleaned.contextLength === null) delete cleaned.contextLength;

  if (Array.isArray(cleaned.recommendedFor) && cleaned.recommendedFor.length === 0) {
    delete cleaned.recommendedFor;
  }

  return cleaned;
}

async function handleSelectFile() {
  try {
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "svg", "webp", "ico"],
        },
      ],
    });
    if (typeof selected === "string") {
      if (!localConfig.value.properties) localConfig.value.properties = {};
      localConfig.value.properties.icon = selected;
    }
  } catch (error) {
    errorHandler.error(error as Error, "选择本地图标文件失败");
  }
}

function getDisplayIconPath(iconPath: string): string {
  if (!iconPath) return "";
  const isWindowsAbsolutePath = /^[A-Za-z]:[\\/]/.test(iconPath);
  const isUnixAbsolutePath = iconPath.startsWith("/") && !iconPath.startsWith("/model-icons");
  if (isWindowsAbsolutePath || isUnixAbsolutePath) {
    return convertFileSrc(iconPath);
  }
  return iconPath;
}
</script>

<style scoped>
.config-editor-container {
  padding: 10px 20px;
}

.form-hint {
  font-size: 12px;
  color: var(--text-color-light);
  margin-top: 4px;
  line-height: 1.4;
}

.form-hint code {
  background: rgba(0, 0, 0, 0.1);
  padding: 0 4px;
  border-radius: 2px;
  font-family: monospace;
}

.icon-input-wrapper {
  display: flex;
  width: 100%;
}

.icon-preview-section {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: -10px;
  margin-bottom: 20px;
  margin-left: 100px;
  padding: 8px;
  background: var(--input-bg);
  border-radius: 6px;
}

.preview-label {
  font-size: 12px;
  color: var(--text-color-light);
}

.preview-icon {
  width: 48px;
  height: 48px;
  object-fit: contain;
}

/* 能力开关网格布局 */
.capabilities-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  padding: 10px 0;
}

.capability-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  transition: all 0.2s;
}

.capability-item:hover {
  border-color: var(--primary-color);
  background: var(--input-bg);
}

.capability-icon {
  font-size: 16px;
  display: flex;
  align-items: center;
}

.capability-label {
  font-size: 13px;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.capability-info {
  font-size: 14px;
  color: var(--text-color-light);
  cursor: help;
  opacity: 0.6;
}

.section-hint {
  font-size: 12px;
  color: var(--text-color-light);
  margin-top: 12px;
  font-style: italic;
}

.json-editor-wrapper {
  margin-top: 10px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  overflow: hidden;
}

.json-error {
  padding: 8px;
  background: #fff2f0;
  border-top: 1px solid #ffccc7;
  color: #ff4d4f;
  font-size: 12px;
}

.placeholder-editor {
  padding: 20px;
  text-align: center;
  background: var(--input-bg);
  border-radius: 8px;
  border: 1px dashed var(--border-color);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

:deep(.el-collapse) {
  border: none;
  margin-top: 20px;
}

:deep(.el-collapse-item__header) {
  font-weight: bold;
  font-size: 14px;
  color: var(--primary-color);
  background: transparent;
}

:deep(.el-collapse-item__content) {
  padding-bottom: 20px;
}
</style>
