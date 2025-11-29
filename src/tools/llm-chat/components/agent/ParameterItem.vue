<script setup lang="ts">
import { computed } from "vue";
import type { ParameterConfig } from "../../config/parameter-config";

interface Props {
  config: ParameterConfig;
  modelValue: any;
  disabled?: boolean;
  // 动态覆盖配置（例如 maxTokens 的最大值）
  overrides?: Partial<ParameterConfig>;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "update:modelValue", value: any): void;
}>();

// 合并配置
const activeConfig = computed(() => ({
  ...props.config,
  ...props.overrides,
}));

// 处理值的获取和设置
const internalValue = computed({
  get: () => {
    if (props.config.format) {
      return props.config.format(props.modelValue);
    }
    // 特殊处理 reasoningEffort 的空字符串
    if (props.config.type === 'select' && props.modelValue === undefined) {
        return "";
    }
    return props.modelValue;
  },
  set: (val: any) => {
    let finalVal = val;
    if (props.config.parse) {
      finalVal = props.config.parse(val);
    }
    // 特殊处理：如果是空字符串且是 select/number，可能需要转为 undefined
    if (val === "" && (props.config.type === 'select' || props.config.type === 'number')) {
        finalVal = undefined;
    }
    emit("update:modelValue", finalVal);
  },
});

// 处理 Slider + Input 的同步更新
const handleSliderChange = (val: number) => {
  internalValue.value = val;
};
</script>

<template>
  <div class="param-group">
    <label class="param-label" :class="{ 'param-label-single': config.type === 'text' }">
      <span>{{ activeConfig.label }}</span>
      
      <!-- Input Number (for Slider & Number types) -->
      <el-input-number
        v-if="config.type === 'slider' || config.type === 'number'"
        v-model="internalValue"
        :min="activeConfig.min"
        :max="activeConfig.max"
        :step="activeConfig.step"
        :precision="activeConfig.precision"
        :controls="true"
        :placeholder="activeConfig.placeholder"
        class="param-input"
        :disabled="disabled"
        size="small"
      />
      
      <!-- Switch -->
      <el-switch
        v-else-if="config.type === 'switch'"
        v-model="internalValue"
        :disabled="disabled"
      />
      
      <!-- Select -->
      <el-select
        v-else-if="config.type === 'select'"
        v-model="internalValue"
        :placeholder="activeConfig.placeholder"
        style="width: 130px"
        :disabled="disabled"
      >
        <el-option
          v-for="opt in activeConfig.options"
          :key="opt.value"
          :label="opt.label"
          :value="opt.value"
        />
      </el-select>
    </label>

    <!-- Slider Control -->
    <el-slider
      v-if="config.type === 'slider'"
      :model-value="internalValue"
      @update:model-value="handleSliderChange"
      :min="activeConfig.min"
      :max="activeConfig.max"
      :step="activeConfig.step"
      :show-tooltip="false"
      :disabled="disabled"
    />

    <!-- Text Input -->
    <el-input
      v-if="config.type === 'text'"
      v-model="internalValue"
      :placeholder="activeConfig.placeholder"
      :disabled="disabled"
    />

    <!-- Description -->
    <div class="param-desc">
      {{ activeConfig.description }}
      <slot name="description-suffix"></slot>
    </div>
  </div>
</template>

<style scoped>
.param-group {
  padding: 12px;
  margin-bottom: 20px;
  border-radius: 8px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
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

.param-label-single {
  justify-content: flex-start;
}

.param-input {
  width: 100px !important;
}

.param-desc {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-color-light);
  line-height: 1.4;
}

/* Element Plus overrides */
:deep(.el-slider__runway) {
  background-color: var(--container-bg);
  border: 1px solid var(--border-color);
}

:deep(.el-slider__bar) {
  background-color: var(--primary-color);
}

:deep(.el-slider__button) {
  border-color: var(--primary-color);
  background-color: var(--primary-color);
}

:deep(.el-select .el-input__wrapper) {
  background-color: var(--container-bg);
}

:deep(.el-switch__core) {
  background-color: var(--border-color);
}

:deep(.el-switch.is-checked .el-switch__core) {
  background-color: var(--primary-color);
}

:deep(.el-input__inner) {
  text-align: left;
}
</style>