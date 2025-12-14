<script setup lang="ts">
import { computed } from "vue";
import { RefreshLeft } from "@element-plus/icons-vue";
import type { ParameterConfig } from "../../config/parameter-config";

interface Props {
  config: ParameterConfig;
  modelValue: any;
  disabled?: boolean;
  // 动态覆盖配置（例如 maxTokens 的最大值）
  overrides?: Partial<ParameterConfig>;
  // 是否启用配置
  enabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  enabled: true, // 默认为 true，兼容旧代码
});

const emit = defineEmits<{
  (e: "update:modelValue", value: any): void;
  (e: "update:enabled", value: boolean): void;
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
    if (props.config.type === "select" && props.modelValue === undefined) {
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
    if (val === "" && (props.config.type === "select" || props.config.type === "number")) {
      finalVal = undefined;
    }
    emit("update:modelValue", finalVal);
  },
});

// 处理 Slider + Input 的同步更新
const handleSliderChange = (val: number) => {
  internalValue.value = val;
};

// 处理启用状态切换
const handleEnabledChange = (val: boolean) => {
  emit("update:enabled", val);
  // 如果启用且当前值为 undefined，尝试设置默认值
  if (val && props.modelValue === undefined) {
    const defaultVal = activeConfig.value.defaultValue ?? activeConfig.value.min ?? 0;
    emit("update:modelValue", defaultVal);
  }
};

// 处理重置
const handleReset = () => {
  if (activeConfig.value.defaultValue !== undefined) {
    emit("update:modelValue", activeConfig.value.defaultValue);
  }
};

// 判断是否显示重置按钮（仅在启用且值不等于默认值时显示）
const showReset = computed(() => {
  if (!props.enabled) return false;
  if (activeConfig.value.defaultValue === undefined) return false;

  // 简单比较，对于对象类型可能需要深度比较，但这里参数大多是基本类型
  // 对于 thinking 这种对象类型，需要特殊处理
  if (typeof activeConfig.value.defaultValue === "object") {
    return JSON.stringify(props.modelValue) !== JSON.stringify(activeConfig.value.defaultValue);
  }

  return props.modelValue !== activeConfig.value.defaultValue;
});
</script>

<template>
  <div class="param-group" :class="{ disabled: !enabled }">
    <!-- Header: Label + Controls -->
    <div class="param-header">
      <span class="param-label">{{ activeConfig.label }}</span>
      <div class="param-controls">
        <!-- Reset Button -->
        <el-popconfirm
          v-if="showReset"
          title="确定要重置为默认值吗？"
          @confirm="handleReset"
          width="200"
        >
          <template #reference>
            <el-button link size="small" type="info" class="reset-btn" :icon="RefreshLeft">
              重置
            </el-button>
          </template>
        </el-popconfirm>

        <!-- Enable Switch -->
        <el-switch
          v-if="!activeConfig.hideSwitch"
          :model-value="enabled"
          @update:model-value="handleEnabledChange"
          :disabled="disabled"
          size="small"
        />
      </div>
    </div>

    <!-- Body: Input Controls (Only if enabled) -->
    <div v-if="enabled" class="param-body">
      <!-- Slider Type -->
      <template v-if="config.type === 'slider'">
        <el-select
          v-if="activeConfig.suggestions"
          v-model.number="internalValue"
          filterable
          allow-create
          default-first-option
          :placeholder="activeConfig.placeholder"
          class="param-input full-width"
          :disabled="disabled"
          size="small"
        >
          <el-option
            v-for="item in activeConfig.suggestions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          >
            <div class="suggestion-item">
              <span class="label">{{ item.label }}</span>
              <span class="value">{{ item.value }}</span>
            </div>
          </el-option>
        </el-select>
        <el-input-number
          v-else
          v-model="internalValue"
          :min="activeConfig.min"
          :max="activeConfig.max"
          :step="activeConfig.step"
          :precision="activeConfig.precision"
          :controls="true"
          :placeholder="activeConfig.placeholder"
          class="param-input full-width"
          :disabled="disabled"
          size="small"
        />
        <el-slider
          :model-value="internalValue"
          @update:model-value="handleSliderChange"
          :min="activeConfig.min"
          :max="activeConfig.max"
          :step="activeConfig.step"
          :show-tooltip="false"
          :disabled="disabled"
          class="param-slider"
        />
      </template>

      <!-- Number Type -->
      <template v-else-if="config.type === 'number'">
        <el-select
          v-if="activeConfig.suggestions"
          v-model.number="internalValue"
          filterable
          allow-create
          default-first-option
          :placeholder="activeConfig.placeholder"
          class="param-input full-width"
          :disabled="disabled"
          size="small"
        >
          <el-option
            v-for="item in activeConfig.suggestions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          >
            <div class="suggestion-item">
              <span class="label">{{ item.label }}</span>
              <span class="value">{{ item.value }}</span>
            </div>
          </el-option>
        </el-select>
        <el-input-number
          v-else
          v-model="internalValue"
          :min="activeConfig.min"
          :max="activeConfig.max"
          :step="activeConfig.step"
          :precision="activeConfig.precision"
          :controls="true"
          :placeholder="activeConfig.placeholder"
          class="param-input full-width"
          :disabled="disabled"
          size="small"
        />
      </template>

      <!-- Switch Type (Content) -->
      <template v-else-if="config.type === 'switch'">
        <div class="switch-container">
          <span class="switch-label">{{ activeConfig.description }}</span>
          <el-switch v-model="internalValue" :disabled="disabled" />
        </div>
      </template>

      <!-- Select Type -->
      <template v-else-if="config.type === 'select'">
        <el-select
          v-model="internalValue"
          :placeholder="activeConfig.placeholder"
          class="full-width"
          :disabled="disabled"
        >
          <el-option
            v-for="opt in activeConfig.options"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </template>

      <!-- Text Type -->
      <template v-else-if="config.type === 'text'">
        <el-input
          v-model="internalValue"
          :placeholder="activeConfig.placeholder"
          :disabled="disabled"
          class="full-width"
        />
      </template>

      <!-- Description (for non-switch types, switch description is inline) -->
      <div v-if="config.type !== 'switch'" class="param-desc">
        {{ activeConfig.description }}
        <slot name="description-suffix"></slot>
      </div>
    </div>

    <!-- Disabled State Description Hint -->
    <div v-else class="param-desc disabled-hint">
      {{ activeConfig.description }} (使用模型默认值)
    </div>
  </div>
</template>

<style scoped>
.param-group {
  padding: 12px;
  margin-bottom: 16px;
  border-radius: 8px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color-light);
  transition: all 0.3s ease;
}

.param-group.disabled {
  opacity: 0.7;
  background-color: var(--bg-color-soft);
}

.param-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.param-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
}

.param-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.reset-btn {
  padding: 0 4px;
  height: 20px;
  font-size: 12px;
}

.param-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.full-width {
  width: 100% !important;
}

.param-slider {
  margin-bottom: 0; /* Remove default margin */
  padding: 0 6px;
}

.switch-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.switch-label {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.param-desc {
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-color-light);
  line-height: 1.4;
}

.disabled-hint {
  margin-top: 0;
  font-style: italic;
}

.suggestion-item {
  display: flex;
  justify-content: space-between;
  width: 100%;
}

.suggestion-item .value {
  font-size: 12px;
  color: var(--text-color-secondary);
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

:deep(.el-input-number .el-input__wrapper) {
  background-color: var(--container-bg);
}

:deep(.el-input .el-input__wrapper) {
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
