<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { customMessage } from '@/utils/customMessage';
import { InfoFilled } from "@element-plus/icons-vue";
import type { LlmModelInfo } from "../../types/llm-profiles";
import { PRESET_ICONS, PRESET_ICONS_DIR } from "../../config/preset-icons";
import { MODEL_CAPABILITIES } from "../../config/model-capabilities";
import IconPresetSelector from "../../components/common/IconPresetSelector.vue";

const props = defineProps<{
  visible: boolean;
  model: LlmModelInfo | null;
  isEditing: boolean; // true 表示编辑现有模型，false 表示新增
}>();

const emit = defineEmits<{
  (e: "update:visible", value: boolean): void;
  (e: "save", model: LlmModelInfo): void;
}>();

// 内部表单状态
const modelEditForm = ref<LlmModelInfo>({
  id: "",
  name: "",
  group: "",
  capabilities: {
    vision: false,
    thinking: false,
    webSearch: false,
    toolUse: false,
    codeExecution: false,
    fileSearch: false,
    reasoning: false,
  },
  tokenLimits: {},
  pricing: {},
});

const showPresetIconDialog = ref(false);

// 监听外部模型变化，更新内部表单
watch(
  () => props.model,
  (newModel) => {
    if (newModel) {
      modelEditForm.value = {
        ...newModel,
        capabilities: {
          vision: false,
          thinking: false,
          webSearch: false,
          toolUse: false,
          codeExecution: false,
          fileSearch: false,
          reasoning: false,
          ...newModel.capabilities,
        },
        tokenLimits: newModel.tokenLimits || {},
        pricing: newModel.pricing || {},
      };
    } else {
      // 新增模式，重置表单
      modelEditForm.value = {
        id: "",
        name: "",
        group: "",
        capabilities: {
          vision: false,
          thinking: false,
          webSearch: false,
          toolUse: false,
          codeExecution: false,
          fileSearch: false,
          reasoning: false,
        },
        tokenLimits: {},
        pricing: {},
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

const dialogTitle = computed(() => {
  return props.isEditing ? "编辑模型" : "添加模型";
});
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="dialogTitle"
    width="75%"
    @update:model-value="handleClose"
    class="model-edit-dialog"
  >
    <div class="form-container">
      <el-form :model="modelEditForm" label-width="110px">
      <!-- 基本信息 -->
      <el-divider content-position="left">基本信息</el-divider>

      <el-form-item label="模型 ID">
        <el-input v-model="modelEditForm.id" placeholder="例如: gpt-4o" />
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
        <el-input
          v-model="modelEditForm.icon"
          placeholder="可选，自定义图标路径或选择预设"
        >
          <template #append>
            <el-button @click="openModelIconSelector">选择预设</el-button>
          </template>
        </el-input>
        <div class="form-hint">留空则使用全局规则自动匹配</div>
      </el-form-item>

      <!-- Token 限制 -->
      <el-divider content-position="left">Token 限制</el-divider>

      <el-form-item label="上下文窗口">
        <el-slider
          v-model="modelEditForm.tokenLimits!.contextLength"
          :min="0"
          :max="2000000"
          :step="1000"
          :marks="{ 0: '0', 128000: '128K', 256000: '256K', 1000000: '1M', 2000000: '2M' }"
          show-input
          :show-input-controls="false"
        />
        <div class="form-hint">模型可处理的总 token 数量（包含输入和历史消息）</div>
      </el-form-item>

      <el-form-item label="输出限制">
        <el-slider
          v-model="modelEditForm.tokenLimits!.output"
          :min="0"
          :max="65536"
          :step="1000"
          :marks="{ 0: '0', 4096: '4K', 16384: '16K', 32768: '32K', 65536: '64K' }"
          show-input
          :show-input-controls="false"
        />
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
          <el-switch
            v-model="modelEditForm.capabilities![capability.key]"
            size="small"
          />
          <span class="capability-label">{{ capability.label }}</span>
          <el-tooltip
            :content="capability.description"
            placement="top"
            effect="dark"
          >
            <el-icon class="capability-info">
              <InfoFilled />
            </el-icon>
          </el-tooltip>
        </div>
      </div>

      <!-- 价格信息 -->
      <el-divider content-position="left">价格配置</el-divider>

      <el-form-item label="输入价格">
        <el-input
          v-model="modelEditForm.pricing!.prompt"
          placeholder="例如: $0.01 / 1M tokens"
        >
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
        <el-input
          v-model="modelEditForm.pricing!.request"
          placeholder="例如: $0.001 / request"
        >
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

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" @click="handleSave">确定</el-button>
    </template>

    <!-- 预设图标选择对话框 -->
    <el-dialog v-model="showPresetIconDialog" title="选择预设图标" width="80%" top="5vh">
      <IconPresetSelector
        :icons="PRESET_ICONS"
        :get-icon-path="(path: string) => `${PRESET_ICONS_DIR}/${path}`"
        show-search
        show-categories
        @select="selectPresetIcon"
      />
    </el-dialog>
  </el-dialog>
</template>

<style scoped>
/* 对话框高度控制 */
.model-edit-dialog{
  padding: 0;
  max-height: 65vh;
  width: 75%;
  overflow: hidden;
}

/* 表单滚动容器 */
.form-container {
  max-height: 65vh;
  overflow-y: auto;
  padding: 20px 20px 10px;
}

/* 表单提示 */
.form-hint {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 8px;
}

/* 滑块项特殊处理，避免提示文字与滑块标记重叠 */
.el-form :deep(.el-form-item:has(.el-slider)) {
  margin-bottom: 32px;
}

.el-form :deep(.el-slider) {
  margin-bottom: 12px;
}

/* 能力开关网格布局 */
.capabilities-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
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

.capability-label {
  font-size: 13px;
  color: var(--text-color);
  flex: 1;
  user-select: none;
  cursor: default;
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
</style>