<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useMediaGenStore } from "../stores/mediaGenStore";
import { MEDIA_GENERATOR_TARGET_LANG_OPTIONS } from "../config";
import { useLlmRequest } from "@/composables/useLlmRequest";
import { parseModelCombo } from "@/utils/modelIdUtils";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@/utils/logger";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import { type MediaTaskType } from "../types";
import { Sparkles, Info } from "lucide-vue-next";

const logger = createModuleLogger("media-generator/PromptOptimizePanel");

const props = defineProps<{
  promptText: string;
}>();

const emit = defineEmits<{
  (e: "apply", value: string): void;
  (e: "cancel"): void;
}>();

const store = useMediaGenStore();
const { sendRequest } = useLlmRequest();

const MEDIA_TYPE_LABELS: Record<MediaTaskType, string> = {
  image: "图片",
  video: "视频",
  speech: "语音",
  music: "音乐",
};

const activeTypeLabel = computed(
  () => MEDIA_TYPE_LABELS[store.currentConfig.activeType] || "媒体"
);

// 提示词优化逻辑
const isOptimizing = ref(false);
const optimizedResult = ref("");
const optimizeModelId = ref("");
const optimizePrompt = ref("");
const optimizeMode = ref<"optimize" | "translate" | "optimize_translate">(
  "optimize"
);
const optimizeTargetLang = ref("");

const currentOptimizationConfig = computed(() => {
  const config = store.settings.promptOptimization;
  const activeType = store.currentConfig.activeType;

  return {
    ...config,
    prompt:
      config.promptsByType?.[activeType] ||
      config.prompt ||
      config.promptsByType?.image ||
      "",
  };
});

const targetLangOptions = computed(() => {
  const configuredList = currentOptimizationConfig.value.targetLangList?.length
    ? currentOptimizationConfig.value.targetLangList
    : MEDIA_GENERATOR_TARGET_LANG_OPTIONS.map((option) => option.value);

  return configuredList.map((value) => {
    const preset = MEDIA_GENERATOR_TARGET_LANG_OPTIONS.find(
      (option) => option.value === value
    );
    return preset || { label: value, value };
  });
});

const resolveDefaultTargetLang = () => {
  const config = currentOptimizationConfig.value;
  const fallback = "English";
  const values = targetLangOptions.value.map((option) => option.value);
  if (config.defaultTargetLang && values.includes(config.defaultTargetLang)) {
    return config.defaultTargetLang;
  }
  return values.includes(fallback) ? fallback : values[0] || fallback;
};

const resetOptimizeDraft = () => {
  optimizePrompt.value = "";
  optimizedResult.value = "";
  optimizeMode.value = "optimize";
  optimizeTargetLang.value = resolveDefaultTargetLang();
};

// 初始化优化配置
watch(
  () => [
    store.settings.promptOptimization?.modelCombo,
    store.settings.promptOptimization?.defaultTargetLang,
    store.settings.promptOptimization?.targetLangList?.join(","),
    store.currentConfig.activeType,
  ],
  () => {
    const config = store.settings.promptOptimization;
    if (config) {
      optimizeModelId.value = config.modelCombo || "";
      resetOptimizeDraft();
    }
  },
  { immediate: true }
);

const buildOptimizationPrompt = (template: string, text: string) => {
  const type = store.currentConfig.activeType;
  const typeLabel = activeTypeLabel.value;
  const hasTextPlaceholder = template.includes("{text}");
  const rendered = template
    .replace(/\{text\}/g, text)
    .replace(/\{type\}/g, type)
    .replace(/\{typeLabel\}/g, typeLabel);

  if (hasTextPlaceholder) return rendered;
  return `${rendered}\n\n## 用户输入\n${text}`;
};

const handleOptimizePrompt = async () => {
  if (!props.promptText.trim()) {
    customMessage.warning("请先输入需要处理的提示词");
    return;
  }

  const config = currentOptimizationConfig.value;
  const modelCombo = optimizeModelId.value || config.modelCombo;

  if (!modelCombo) {
    customMessage.warning("请先选择优化模型");
    return;
  }

  const [profileId, modelId] = parseModelCombo(modelCombo);
  if (!profileId || !modelId) {
    customMessage.warning("优化模型配置无效");
    return;
  }

  isOptimizing.value = true;
  optimizedResult.value = "";
  try {
    let finalPrompt = "";
    const targetLang = optimizeTargetLang.value || resolveDefaultTargetLang();

    if (optimizeMode.value === "translate") {
      // 仅翻译模式
      finalPrompt = (config.translationPrompt || "")
        .replace(/\{text\}/g, props.promptText)
        .replace(/\{targetLang\}/g, targetLang);
    } else {
      // 优化模式或优化并翻译模式
      finalPrompt = buildOptimizationPrompt(config.prompt, props.promptText);
      if (optimizeMode.value === "optimize_translate") {
        finalPrompt += `\n\n## 输出语言\n请将最终优化后的提示词输出为 ${targetLang}。如果上方模板中的输出语言要求与本要求冲突，以本要求为准。仅输出最终提示词，禁止解释。`;
      }
    }

    if (optimizePrompt.value.trim()) {
      finalPrompt += `\n\n附加要求：${optimizePrompt.value.trim()}`;
    }

    const response = await sendRequest({
      profileId,
      modelId,
      messages: [
        {
          role: "user",
          content: finalPrompt,
        },
      ],
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      inspectorContext: {
        toolName: "media-generator",
        purpose: `prompt-optimization:${store.currentConfig.activeType}`,
      },
    });

    if (response && response.content) {
      optimizedResult.value = response.content;
    }
  } catch (error) {
    logger.error("提示词优化失败", error);
    customMessage.error("提示词优化失败，请检查网络或模型配置");
  } finally {
    isOptimizing.value = false;
  }
};

const applyOptimizedPrompt = () => {
  if (optimizedResult.value) {
    emit("apply", optimizedResult.value);
    resetOptimizeDraft();
  }
};

const cancelOptimize = () => {
  emit("cancel");
  resetOptimizeDraft();
};

defineExpose({
  isOptimizing,
  resetOptimizeDraft,
});
</script>

<template>
  <div class="optimize-form">
    <div class="form-header">
      <el-icon><Sparkles /></el-icon>
      <span>{{ activeTypeLabel }}提示词优化助手</span>
    </div>

    <div class="form-item model-form-item">
      <label>优化模型</label>
      <LlmModelSelector
        v-model="optimizeModelId"
        placeholder="选择优化模型"
        :capabilities="{ embedding: false, rerank: false }"
        :teleported="false"
        popper-class="optimize-model-popper"
      />
    </div>

    <div
      v-if="optimizeMode !== 'optimize'"
      class="form-item language-form-item"
    >
      <label>目标语言</label>
      <el-select
        v-model="optimizeTargetLang"
        class="translation-select"
        size="small"
        placeholder="选择目标语言"
        :teleported="false"
        popper-class="optimize-language-popper"
      >
        <el-option
          v-for="option in targetLangOptions"
          :key="option.value"
          :label="option.label"
          :value="option.value"
        />
      </el-select>
    </div>

    <div class="form-item">
      <label>附加要求 (可选)</label>
      <el-input
        v-model="optimizePrompt"
        type="textarea"
        :rows="3"
        placeholder="输入额外的指令，例如：'增加赛博朋克风格' 或 '强调光影对比'..."
      />
    </div>

    <div v-if="optimizedResult" class="optimize-result">
      <label>优化结果</label>
      <div class="result-content">
        {{ optimizedResult }}
      </div>
    </div>

    <div class="form-item">
      <label>处理模式</label>
      <el-radio-group
        v-model="optimizeMode"
        size="small"
        class="mode-radio-group"
      >
        <el-radio-button value="optimize">仅优化</el-radio-button>
        <el-radio-button value="translate">仅翻译</el-radio-button>
        <el-radio-button value="optimize_translate">优化并翻译</el-radio-button>
      </el-radio-group>
    </div>

    <div class="form-tip">
      <el-icon><Info /></el-icon>
      <div class="tip-content">
        <p>优化将基于当前输入框中的内容进行扩展</p>
      </div>
    </div>

    <div class="form-actions">
      <template v-if="!optimizedResult">
        <el-button size="small" @click="cancelOptimize">取消</el-button>
        <el-button
          size="small"
          type="primary"
          :loading="isOptimizing"
          @click="handleOptimizePrompt"
        >
          开始优化
        </el-button>
      </template>
      <template v-else>
        <el-button size="small" @click="optimizedResult = ''"
          >重新生成</el-button
        >
        <el-button size="small" type="primary" @click="applyOptimizedPrompt">
          确认并应用
        </el-button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.optimize-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  /* 确保内部下拉菜单的 z-index 能够生效，且不被父级容器轻易裁剪 */
  position: relative;
  z-index: 10;
}

.form-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 15px;
  color: var(--el-color-primary);
  margin-bottom: 4px;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.model-form-item {
  position: relative;
  z-index: 30;
}

.language-form-item {
  position: relative;
  z-index: 20;
}

.form-item label {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-regular);
}

.optimize-result {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background-color: var(--el-fill-color-lighter);
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
}

.optimize-result label {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-color-success);
}

.result-content {
  font-size: 14px;
  line-height: 1.6;
  color: var(--el-text-color-primary);
  max-height: 180px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.form-tip {
  display: flex;
  gap: 8px;
  padding: 4px;
  border-radius: 8px;
  color: var(--el-text-color-secondary);
}

.form-tip .el-icon {
  font-size: 16px;
  margin-top: 2px;
}

.tip-content p {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 4px;
}

:deep(.el-radio-group) {
  background-color: transparent !important;
  backdrop-filter: none !important;
}

/* 非 teleported 下拉会留在 popover 内部，需要显式压过后续表单内容。 */
:deep(.el-select__popper),
:global(.el-popper.optimize-model-popper),
:global(.el-popper.optimize-language-popper) {
  z-index: calc(var(--z-index-popover) + 2) !important;
  background-color: var(--card-bg) !important;
  border: 1px solid var(--border-color) !important;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.24) !important;
  backdrop-filter: none !important;
}
</style>
