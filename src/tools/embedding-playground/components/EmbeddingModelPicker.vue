<script setup lang="ts">
import { computed } from "vue";
import DynamicIcon from "@/components/common/DynamicIcon.vue";
import { useModelMetadata } from "@/composables/useModelMetadata";
import { useEmbeddingModelOptions } from "../composables/useEmbeddingModelOptions";

const props = withDefaults(
  defineProps<{
    modelValue: string | string[];
    multiple?: boolean;
    placeholder?: string;
    disabled?: boolean;
    maxCollapseTags?: number;
  }>(),
  {
    multiple: false,
    placeholder: "选择 Embedding 模型",
    disabled: false,
    maxCollapseTags: 4,
  }
);

const emit = defineEmits<{
  (event: "update:modelValue", value: string | string[]): void;
}>();

const { availableEmbeddingModels, modelGroups } = useEmbeddingModelOptions();
const { getModelIcon } = useModelMetadata();

const singleValue = computed({
  get: () => (typeof props.modelValue === "string" ? props.modelValue : ""),
  set: (value: string) => emit("update:modelValue", value || ""),
});

const multiValue = computed({
  get: () => (Array.isArray(props.modelValue) ? props.modelValue : []),
  set: (value: string[]) => emit("update:modelValue", value),
});

const selectedModelInfo = computed(() => {
  if (!singleValue.value) return null;
  return availableEmbeddingModels.value.find(
    (model) => model.value === singleValue.value
  );
});
</script>

<template>
  <div class="embedding-model-picker">
    <el-select
      v-if="multiple"
      v-model="multiValue"
      multiple
      collapse-tags
      collapse-tags-tooltip
      :max-collapse-tags="maxCollapseTags"
      filterable
      clearable
      :disabled="disabled || availableEmbeddingModels.length === 0"
      :placeholder="placeholder"
      class="model-select"
    >
      <el-option-group v-for="group in modelGroups" :key="group" :label="group">
        <el-option
          v-for="item in availableEmbeddingModels.filter(
            (model) => model.group === group
          )"
          :key="item.value"
          :label="item.label"
          :value="item.value"
        >
          <div class="option-item">
            <DynamicIcon
              :src="getModelIcon(item.model) || ''"
              :alt="item.label"
              class="model-icon"
              lazy
            />
            <span class="model-name">{{ item.label }}</span>
          </div>
        </el-option>
      </el-option-group>
    </el-select>

    <el-select
      v-else
      v-model="singleValue"
      filterable
      clearable
      :disabled="disabled || availableEmbeddingModels.length === 0"
      :placeholder="placeholder"
      class="model-select"
    >
      <template #prefix>
        <DynamicIcon
          v-if="selectedModelInfo"
          :src="getModelIcon(selectedModelInfo.model) || ''"
          :alt="selectedModelInfo.label"
          class="model-icon"
        />
      </template>

      <el-option-group v-for="group in modelGroups" :key="group" :label="group">
        <el-option
          v-for="item in availableEmbeddingModels.filter(
            (model) => model.group === group
          )"
          :key="item.value"
          :label="item.label"
          :value="item.value"
        >
          <div class="option-item">
            <DynamicIcon
              :src="getModelIcon(item.model) || ''"
              :alt="item.label"
              class="model-icon"
              lazy
            />
            <span class="model-name">{{ item.label }}</span>
            <el-text
              v-if="item.model.group"
              size="small"
              type="info"
              class="model-group-tag"
            >
              {{ item.model.group }}
            </el-text>
          </div>
        </el-option>
      </el-option-group>
    </el-select>

    <el-link
      v-if="availableEmbeddingModels.length === 0"
      type="warning"
      underline="never"
      class="empty-link"
    >
      请先在设置中配置具备 Embedding 能力的模型
    </el-link>
  </div>
</template>

<style scoped>
.embedding-model-picker {
  width: 100%;
}

.model-select {
  width: 100%;
}

.model-select:deep(.el-input__wrapper) {
  padding-left: 8px;
}

.option-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.model-icon {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  flex-shrink: 0;
}

.model-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-group-tag {
  margin-left: auto;
  flex-shrink: 0;
}

.empty-link {
  margin-top: 8px;
  display: block;
  cursor: default;
}
</style>
