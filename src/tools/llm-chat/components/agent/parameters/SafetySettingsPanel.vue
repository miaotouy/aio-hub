<script setup lang="ts">
import type { GeminiSafetySetting } from "../../../types";

interface Props {
  modelValue?: GeminiSafetySetting[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "update:modelValue", value: GeminiSafetySetting[] | undefined): void;
}>();

const safetyCategories = [
  { label: "骚扰内容 (Harassment)", value: "HARM_CATEGORY_HARASSMENT" },
  { label: "仇恨言论 (Hate Speech)", value: "HARM_CATEGORY_HATE_SPEECH" },
  { label: "色情内容 (Sexually Explicit)", value: "HARM_CATEGORY_SEXUALLY_EXPLICIT" },
  { label: "危险内容 (Dangerous Content)", value: "HARM_CATEGORY_DANGEROUS_CONTENT" },
  { label: "公民诚信 (Civic Integrity)", value: "HARM_CATEGORY_CIVIC_INTEGRITY" },
] as const;

const safetyThresholds = [
  { label: "默认 (使用系统设置)", value: "SYSTEM_DEFAULT" },
  { label: "关闭拦截 (OFF)", value: "OFF" },
  { label: "不过滤 (BLOCK_NONE)", value: "BLOCK_NONE" },
  { label: "仅拦截高风险 (BLOCK_ONLY_HIGH)", value: "BLOCK_ONLY_HIGH" },
  { label: "拦截中等及以上 (BLOCK_MEDIUM_AND_ABOVE)", value: "BLOCK_MEDIUM_AND_ABOVE" },
  { label: "拦截低风险及以上 (BLOCK_LOW_AND_ABOVE)", value: "BLOCK_LOW_AND_ABOVE" },
];

const getSafetyThreshold = (category: string) => {
  const settings = props.modelValue || [];
  const setting = settings.find((s) => s.category === category);
  return setting?.threshold ?? "SYSTEM_DEFAULT";
};

const updateSafetySetting = (
  category: string,
  threshold: GeminiSafetySetting["threshold"] | "SYSTEM_DEFAULT"
) => {
  const currentSettings = props.modelValue || [];
  let newSettings: GeminiSafetySetting[];

  if (threshold === "SYSTEM_DEFAULT") {
    // 移除该类别的设置
    newSettings = currentSettings.filter((s) => s.category !== category);
  } else {
    // 更新或添加
    const existingIndex = currentSettings.findIndex((s) => s.category === category);
    if (existingIndex >= 0) {
      newSettings = [...currentSettings];
      newSettings[existingIndex] = { ...newSettings[existingIndex], threshold };
    } else {
      newSettings = [
        ...currentSettings,
        { category: category as GeminiSafetySetting["category"], threshold },
      ];
    }
  }

  // 如果数组为空，设为 undefined
  emit("update:modelValue", newSettings.length > 0 ? newSettings : undefined);
};
</script>

<template>
  <div class="safety-settings-panel">
    <div class="param-hint">
      配置 Gemini 的内容安全过滤器。设置为 OFF 或 BLOCK_NONE 可以解除大部分限制。
    </div>

    <div class="safety-settings-list">
      <div v-for="category in safetyCategories" :key="category.value" class="param-group">
        <label class="param-label">
          <span>{{ category.label }}</span>
          <el-select
            :model-value="getSafetyThreshold(category.value)"
            @update:model-value="updateSafetySetting(category.value, $event)"
            placeholder="默认"
            size="small"
            style="width: 180px"
          >
            <el-option
              v-for="threshold in safetyThresholds"
              :key="threshold.label"
              :label="threshold.label"
              :value="threshold.value"
            />
          </el-select>
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
.param-hint {
  margin-bottom: 16px;
  padding: 12px;
  background-color: var(--container-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px dashed var(--border-color);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-color-light);
  line-height: 1.5;
}

.safety-settings-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.param-group {
  padding: 12px;
  margin-bottom: 16px;
  border-radius: 8px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color-light);
  transition: all 0.3s ease;
}

.param-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0; /* Override default */
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
}
</style>
