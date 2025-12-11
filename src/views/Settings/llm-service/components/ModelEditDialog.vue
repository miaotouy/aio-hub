<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { customMessage } from "@/utils/customMessage";
import { InfoFilled, MagicStick } from "@element-plus/icons-vue";
import type { LlmModelInfo } from "@/types/llm-profiles";
import { PRESET_ICONS, PRESET_ICONS_DIR } from "@/config/preset-icons";
import { MODEL_CAPABILITIES } from "@/config/model-capabilities";
import { getMatchedModelProperties } from "@/config/model-metadata";
import IconPresetSelector from "@/components/common/IconPresetSelector.vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("ModelEditDialog");

const props = defineProps<{
  visible: boolean;
  model: LlmModelInfo | null;
  isEditing: boolean; // true 表示编辑现有模型，false 表示新增
}>();

const emit = defineEmits<{
  (e: "update:visible", value: boolean): void;
  (e: "save", model: LlmModelInfo): void;
}>();

// 根据 MODEL_CAPABILITIES 动态生成一个所有功能都为 false 的对象
const createDefaultCapabilities = () => {
  const capabilities: Record<string, boolean> = {};
  for (const cap of MODEL_CAPABILITIES) {
    capabilities[cap.key] = false;
  }
  return capabilities as Required<LlmModelInfo>["capabilities"];
};

// 内部表单状态
const modelEditForm = ref<LlmModelInfo>({
  id: "",
  name: "",
  group: "",
  capabilities: createDefaultCapabilities(),
  tokenLimits: {},
  pricing: {},
});

const showPresetIconDialog = ref(false);
const jsonError = ref<string | null>(null);

// 监听外部模型变化，更新内部表单
watch(
  () => props.model,
  (newModel) => {
    if (newModel) {
      modelEditForm.value = {
        ...newModel,
        capabilities: {
          ...createDefaultCapabilities(),
          reasoningEffortOptions: [],
          ...newModel.capabilities,
        },
        tokenLimits: newModel.tokenLimits || {},
        pricing: newModel.pricing || {},
        customParameters: newModel.customParameters || {},
      };
    } else {
      // 新增模式，重置表单
      modelEditForm.value = {
        id: "",
        name: "",
        group: "",
        capabilities: {
          ...createDefaultCapabilities(),
          reasoningEffortOptions: [],
        },
        tokenLimits: {},
        pricing: {},
        customParameters: {},
      };
    }
  },
  { immediate: true }
);

// 保存模型
const handleSave = () => {
  if (!modelEditForm.value.id.trim()) {
    customMessage.error("请输入模型 ID");
    return;
  }
  if (!modelEditForm.value.name.trim()) {
    customMessage.error("请输入模型名称");
    return;
  }

  emit("save", { ...modelEditForm.value });
  handleClose();
};

// 关闭对话框
const handleClose = () => {
  emit("update:visible", false);
};

// 选择预设图标
const selectPresetIcon = (icon: any) => {
  const iconPath = `${PRESET_ICONS_DIR}/${icon.path}`;
  modelEditForm.value.icon = iconPath;
  showPresetIconDialog.value = false;
};

// 打开模型图标选择器
const openModelIconSelector = () => {
  showPresetIconDialog.value = true;
};

// 应用预设配置
const applyPreset = () => {
  const modelId = modelEditForm.value.id.trim();
  if (!modelId) {
    customMessage.warning("请先输入模型 ID");
    return;
  }

  // 从预设中获取匹配的元数据
  const properties = getMatchedModelProperties(modelId, modelEditForm.value.provider);

  if (!properties) {
    customMessage.info("未找到匹配的预设配置");
    return;
  }

  let appliedCount = 0;

  // 应用分组
  if (properties.group && !modelEditForm.value.group) {
    modelEditForm.value.group = properties.group;
    appliedCount++;
  }

  // 应用图标
  if (properties.icon && !modelEditForm.value.icon) {
    modelEditForm.value.icon = properties.icon;
    appliedCount++;
  }

  // 应用能力
  if (properties.capabilities) {
    modelEditForm.value.capabilities = {
      ...modelEditForm.value.capabilities,
      ...properties.capabilities,
    };
    appliedCount++;
  }

  // 如果没有名称，使用模型 ID 作为名称
  if (!modelEditForm.value.name) {
    modelEditForm.value.name = modelId;
    appliedCount++;
  }

  if (appliedCount > 0) {
    customMessage.success(`已应用预设配置（${appliedCount} 项）`);
  } else {
    customMessage.info("所有字段已有值，未覆盖");
  }
};

const dialogTitle = computed(() => {
  return props.isEditing ? "编辑模型" : "添加模型";
});

// Token 预设值
const contextLengthPresets = [
  { label: "1K", value: 1024 },
  { label: "2K", value: 2048 },
  { label: "4K", value: 4096 },
  { label: "8K", value: 8192 },
  { label: "16K", value: 16384 },
  { label: "32K", value: 32768 },
  { label: "64K", value: 64000 },
  { label: "128K", value: 128000 },
  { label: "200K", value: 200000 },
  { label: "256K", value: 262144 },
  { label: "500K", value: 500000 },
  { label: "1M", value: 1000000 },
  { label: "2M", value: 2000000 },
  { label: "4M", value: 4000000 },
  { label: "10M", value: 10000000 },
  { label: "20M", value: 20000000 },
  { label: "50M", value: 50000000 },
];

const outputLimitPresets = [
  { label: "2K", value: 2048 },
  { label: "4K", value: 4096 },
  { label: "8K", value: 8192 },
  { label: "16K", value: 16384 },
  { label: "32K", value: 32768 },
  { label: "64K", value: 65536 },
  { label: "128K", value: 131072 },
  { label: "256K", value: 262144 },
];

// 应用预设值
const applyContextPreset = (value: number) => {
  if (!modelEditForm.value.tokenLimits) {
    modelEditForm.value.tokenLimits = {};
  }
  modelEditForm.value.tokenLimits.contextLength = value;
};

const applyOutputPreset = (value: number) => {
  if (!modelEditForm.value.tokenLimits) {
    modelEditForm.value.tokenLimits = {};
  }
  modelEditForm.value.tokenLimits.output = value;
};

// 自定义参数的 JSON 字符串计算属性
const customParametersJsonString = computed({
  get: () => {
    if (
      !modelEditForm.value.customParameters ||
      Object.keys(modelEditForm.value.customParameters).length === 0
    ) {
      return "";
    }
    try {
      return JSON.stringify(modelEditForm.value.customParameters, null, 2);
    } catch (e) {
      logger.error("Failed to stringify custom parameters", e);
      return "{}"; // 返回一个空对象字符串作为回退
    }
  },
  set: (value) => {
    if (!value.trim()) {
      modelEditForm.value.customParameters = {};
      jsonError.value = null;
      return;
    }
    try {
      modelEditForm.value.customParameters = JSON.parse(value);
      jsonError.value = null;
    } catch (e) {
      // 解析失败时，设置错误提示，并且不更新数据
      jsonError.value = "JSON 格式无效，请检查语法。";
      logger.warn("Invalid JSON for custom parameters", e);
    }
  },
});
</script>

<template>
  <BaseDialog
    :model-value="visible"
    @update:model-value="handleClose"
    :title="dialogTitle"
    width="75%"
    height="75vh"
  >
    <template #content>
      <div class="form-container">
        <el-form :model="modelEditForm" label-width="110px">
          <!-- 基本信息 -->
          <el-divider content-position="left">基本信息</el-divider>

          <el-form-item label="模型 ID">
            <el-input v-model="modelEditForm.id" placeholder="例如: gpt-4o">
              <template #append>
                <el-button
                  :icon="MagicStick"
                  @click="applyPreset"
                  title="根据模型 ID 自动应用预设配置"
                >
                  应用预设
                </el-button>
              </template>
            </el-input>
            <div class="form-hint">
              输入模型 ID 后可点击"应用预设"自动填充名称、分组、图标和能力
            </div>
          </el-form-item>

          <el-form-item label="显示名称">
            <el-input v-model="modelEditForm.name" placeholder="例如: GPT-4o" />
          </el-form-item>

          <el-form-item label="分组">
            <el-input v-model="modelEditForm.group" placeholder="可选，例如: GPT-4 系列" />
          </el-form-item>

          <el-form-item label="描述">
            <el-input
              v-model="modelEditForm.description"
              type="textarea"
              :rows="2"
              placeholder="可选，模型描述信息"
            />
          </el-form-item>

          <el-form-item label="模型图标">
            <el-input v-model="modelEditForm.icon" placeholder="可选，自定义图标路径或选择预设">
              <template #append>
                <el-button @click="openModelIconSelector">选择预设</el-button>
              </template>
            </el-input>
            <div class="form-hint">留空则使用全局规则自动匹配</div>
          </el-form-item>

          <!-- Token 限制 -->
          <el-divider content-position="left">Token 限制</el-divider>

          <el-form-item label="上下文窗口">
            <div class="token-input-group">
              <el-select
                :model-value="modelEditForm.tokenLimits?.contextLength"
                @update:model-value="applyContextPreset"
                placeholder="选择预设"
                clearable
                class="preset-selector"
              >
                <el-option
                  v-for="preset in contextLengthPresets"
                  :key="preset.value"
                  :label="preset.label"
                  :value="preset.value"
                />
              </el-select>
              <el-input-number
                v-model="modelEditForm.tokenLimits!.contextLength"
                :min="0"
                :max="10000000"
                :step="1000"
                controls-position="right"
                class="token-input"
              />
            </div>
            <div class="form-hint">模型可处理的总 token 数量（包含输入和历史消息）</div>
          </el-form-item>

          <el-form-item label="输出限制">
            <div class="token-input-group">
              <el-select
                :model-value="modelEditForm.tokenLimits?.output"
                @update:model-value="applyOutputPreset"
                placeholder="选择预设"
                clearable
                class="preset-selector"
              >
                <el-option
                  v-for="preset in outputLimitPresets"
                  :key="preset.value"
                  :label="preset.label"
                  :value="preset.value"
                />
              </el-select>
              <el-input-number
                v-model="modelEditForm.tokenLimits!.output"
                :min="0"
                :max="1000000"
                :step="1000"
                controls-position="right"
                class="token-input"
              />
            </div>
            <div class="form-hint">单次响应最大输出 token 数（包含推理 token）</div>
          </el-form-item>

          <!-- 模型能力 -->
          <el-divider content-position="left">模型能力</el-divider>

          <div class="capabilities-grid">
            <div
              v-for="capability in MODEL_CAPABILITIES"
              :key="capability.key"
              class="capability-item"
            >
              <el-switch v-model="modelEditForm.capabilities![capability.key]" size="small" />
              <el-icon
                v-if="capability.icon"
                class="capability-icon"
                :style="{ color: capability.color }"
              >
                <component :is="capability.icon" />
              </el-icon>
              <span class="capability-label">{{ capability.label }}</span>
              <el-tooltip :content="capability.description" placement="top" effect="dark">
                <el-icon class="capability-info">
                  <InfoFilled />
                </el-icon>
              </el-tooltip>
            </div>
          </div>

          <!-- 思考能力配置 -->
          <el-divider content-position="left">思考能力配置</el-divider>

          <el-form-item label="配置模式">
            <div style="width: 100%">
              <el-radio-group v-model="modelEditForm.capabilities!.thinkingConfigType">
                <el-radio value="none">无</el-radio>
                <el-radio value="switch">开关模式</el-radio>
                <el-radio value="budget">预算模式</el-radio>
                <el-radio value="effort">等级模式</el-radio>
              </el-radio-group>
              <div class="form-hint">决定了在 Agent 参数面板中如何配置该模型的思考/推理能力。</div>
            </div>
          </el-form-item>

          <el-form-item
            v-if="modelEditForm.capabilities?.thinkingConfigType === 'effort'"
            label="可用等级"
          >
            <el-select
              v-model="modelEditForm.capabilities!.reasoningEffortOptions"
              multiple
              filterable
              allow-create
              default-first-option
              :reserve-keyword="false"
              placeholder="选择或输入等级，回车添加"
              style="width: 100%"
            >
              <el-option label="low" value="low" />
              <el-option label="medium" value="medium" />
              <el-option label="high" value="high" />
            </el-select>
            <div class="form-hint">
              当配置模式为“等级模式”时，在此处定义可用的等级选项。支持手动输入自定义等级。
            </div>
          </el-form-item>

          <!-- 默认后处理规则 -->
          <el-divider content-position="left">默认配置</el-divider>

          <el-form-item label="默认后处理规则">
            <el-select
              v-model="modelEditForm.defaultPostProcessingRules"
              multiple
              placeholder="选择该模型的默认后处理规则"
              style="width: 100%"
            >
              <el-option label="合并 System 消息到头部" value="merge-system-to-head" />
              <el-option label="合并连续相同角色" value="merge-consecutive-roles" />
              <el-option label="转换 System 为 User" value="convert-system-to-user" />
              <el-option label="确保角色交替" value="ensure-alternating-roles" />
            </el-select>
            <div class="form-hint">
              该模型的默认后处理规则。这些规则会与智能体配置的规则合并使用。
            </div>
          </el-form-item>

          <!-- 自定义参数 -->
          <el-divider content-position="left">自定义参数</el-divider>
          <el-form-item label="模型专属参数" :error="jsonError">
            <div class="code-editor-wrapper">
              <RichCodeEditor
                v-model="customParametersJsonString"
                language="json"
                :line-numbers="true"
                :word-wrap="true"
                style="height: 220px"
              />
            </div>
            <div class="form-hint">
              为该模型指定非标准的、专属的 API
              参数。请输入合法的JSON格式。这些参数将与标准请求参数合并。
            </div>
          </el-form-item>

          <!-- 价格信息 -->
          <el-divider content-position="left">价格配置</el-divider>

          <el-form-item label="输入价格">
            <el-input v-model="modelEditForm.pricing!.prompt" placeholder="例如: $0.01 / 1M tokens">
              <template #prepend>$</template>
            </el-input>
            <div class="form-hint">每百万 token 的输入价格</div>
          </el-form-item>

          <el-form-item label="输出价格">
            <el-input
              v-model="modelEditForm.pricing!.completion"
              placeholder="例如: $0.03 / 1M tokens"
            >
              <template #prepend>$</template>
            </el-input>
            <div class="form-hint">每百万 token 的输出价格</div>
          </el-form-item>

          <el-form-item label="请求价格">
            <el-input v-model="modelEditForm.pricing!.request" placeholder="例如: $0.001 / request">
              <template #prepend>$</template>
            </el-input>
            <div class="form-hint">每次请求的固定价格（可选）</div>
          </el-form-item>

          <el-form-item label="图像价格">
            <el-input v-model="modelEditForm.pricing!.image" placeholder="例如: $0.005 / image">
              <template #prepend>$</template>
            </el-input>
            <div class="form-hint">每张图像的处理价格（可选）</div>
          </el-form-item>
        </el-form>
      </div>
    </template>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" @click="handleSave">确定</el-button>
    </template>

    <!-- 预设图标选择对话框 -->
    <BaseDialog v-model="showPresetIconDialog" title="选择预设图标" width="80%">
      <template #content>
        <IconPresetSelector
          :icons="PRESET_ICONS"
          :get-icon-path="(path: string) => `${PRESET_ICONS_DIR}/${path}`"
          show-search
          show-categories
          @select="selectPresetIcon"
        />
      </template>
    </BaseDialog>
  </BaseDialog>
</template>

<style scoped>
/* 表单滚动容器 */
.form-container {
  padding: 20px 20px 10px;
}

/* 表单提示 */
.form-hint {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 8px;
}

/* Token 输入组合 */
.token-input-group {
  display: flex;
  gap: 12px;
  width: 100%;
}

.preset-selector {
  width: 140px;
  flex-shrink: 0;
}

.token-input {
  flex: 1;
  min-width: 0;
}

.token-input :deep(.el-input-number__decrease),
.token-input :deep(.el-input-number__increase) {
  width: 32px;
}

/* 能力开关网格布局 */
.capabilities-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 16px 12px;
  padding: 8px 0 0 28px;
}

.capability-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--el-fill-color-lighter);
  transition: all 0.2s;
}

.capability-item:hover {
  background: var(--el-fill-color-light);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.capability-icon {
  margin: 0 2px 0 4px;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.capability-label {
  font-size: 13px;
  color: var(--text-color);
  flex: 1;
  user-select: none;
  cursor: default;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.capability-info {
  font-size: 14px;
  color: var(--el-color-info);
  cursor: help;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.capability-info:hover {
  opacity: 1;
  color: var(--el-color-primary);
}

.code-editor-wrapper {
  width: 100%;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  overflow: hidden;
}

pre {
  background-color: var(--el-fill-color-light);
  padding: 8px;
  border-radius: 4px;
  font-family: "Courier New", Courier, monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  margin-top: 8px;
}
</style>
