<template>
  <el-form-item
    :label="resolvedLabel"
    :data-setting-id="item.id"
    style="padding-left: 26px"
    :class="{ 'setting-item-highlight': isHighlighted }"
  >
    <!-- Block layout (default) -->
    <template v-if="item.layout !== 'inline'">
      <div class="setting-item-content">
        <!-- Collapsible Component Template -->
        <div v-if="item.collapsible" class="full-width" style="width: 100%">
          <el-collapse v-model="activeCollapseNames">
            <el-collapse-item :title="item.collapsible.title" :name="item.collapsible.name">
              <div :style="item.collapsible.style">
                <component
                  v-if="isComponentLoaded"
                  :is="resolvedComponent"
                  :model-value="modelValue"
                  @update:model-value="handleUpdate"
                  @change="handleChange"
                  v-bind="resolvedProps"
                  :loading="isLoading"
                />
              </div>
            </el-collapse-item>
          </el-collapse>
        </div>

        <!-- FileSelector Component -->
        <el-input
          v-else-if="item.component === 'FileSelector'"
          :model-value="modelValue"
          @update:model-value="handleUpdate"
          v-bind="resolvedProps"
          class="full-width"
        >
          <template #append>
            <el-button @click="handleAction" title="选择文件" style="padding: 8px">
              <el-icon><FolderOpened /></el-icon>
            </el-button>
          </template>
        </el-input>

        <!-- Standard Component -->
        <component
          v-else-if="item.component !== 'SliderWithInput'"
          :is="resolvedComponent"
          :class="componentClasses"
          :model-value="modelValue"
          @update:model-value="handleUpdate"
          v-bind="resolvedProps"
        >
          <!-- RadioGroup options -->
          <template v-if="item.component === 'ElRadioGroup' && resolvedOptions">
            <el-radio
              v-for="option in resolvedOptions"
              :key="option.value.toString()"
              :value="option.value"
            >
              {{ option.label }}
            </el-radio>
          </template>
          <!-- Select options -->
          <template v-if="item.component === 'ElSelect' && resolvedOptions">
            <el-option
              v-for="option in resolvedOptions"
              :key="option.value.toString()"
              :label="option.label"
              :value="option.value"
              :title="option.description"
            >
              <div class="select-option-with-tags">
                <span>{{ option.label }}</span>
                <div v-if="option.tags && option.tags.length > 0" class="tags-container">
                  <el-tag
                    v-for="tag in option.tags"
                    :key="tag"
                    size="small"
                    :type="tag === '基础' ? 'success' : tag === '高级' ? 'warning' : 'info'"
                    class="option-tag"
                  >
                    {{ tag }}
                  </el-tag>
                </div>
              </div>
            </el-option>
          </template>
        </component>

        <!-- SliderWithInput Custom Composite Component -->
        <div v-if="item.component === 'SliderWithInput'" class="slider-with-input">
          <el-slider
            :model-value="modelValue"
            @update:model-value="handleUpdate"
            v-bind="resolvedProps"
            class="slider-part"
          />
          <el-input-number
            :model-value="modelValue"
            @update:model-value="handleUpdate"
            v-bind="resolvedProps"
            class="input-part"
            :controls="true"
          />
        </div>

        <div v-if="item.slots?.append" class="append-slot" @click="handleAction">
          <component :is="item.slots.append" />
        </div>
      </div>

      <div v-if="item.hint" class="form-hint" v-html="resolvedHint"></div>

      <!-- 选项详情显示 - 仅显示当前选中的 -->
      <div v-if="selectedOptionDescription" class="form-hint">
        {{ selectedOptionDescription }}
      </div>
    </template>

    <!-- Inline layout -->
    <template v-else>
      <div class="setting-item-content-inline">
        <component
          :is="resolvedComponent"
          :class="componentClasses"
          :model-value="modelValue"
          @update:model-value="handleUpdate"
          v-bind="resolvedProps"
        />
        <div v-if="item.hint" class="form-hint-inline" v-html="resolvedHint"></div>
      </div>
    </template>
  </el-form-item>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  ElCollapse,
  ElCollapseItem,
  ElSlider,
  ElInputNumber,
  ElRadio,
  ElOption,
  ElTag,
  ElFormItem,
  ElSwitch,
  ElRadioGroup,
  ElInput,
  ElSelect,
  ElIcon,
  ElButton,
} from "element-plus";
import { FolderOpened } from "@element-plus/icons-vue";
import { get, set } from "lodash-es";
import PromptEditor from "@/components/common/PromptEditor.vue";
import type { SettingItem } from "@/types/settings-renderer";
import type { Component } from "vue";

const props = defineProps<{
  item: SettingItem<any>;
  settings: any;
  isHighlighted?: boolean;
  customComponents?: Record<string, Component>;
}>();

const emit = defineEmits<{
  (e: "update:settings", value: any): void;
  (e: "action", actionName: string): void;
}>();

// --- 解析逻辑 ---

const modelValue = computed({
  get: () => {
    if (!props.item.modelPath) return undefined;
    const val = get(props.settings, props.item.modelPath);
    // 如果值为 undefined，尝试使用配置中的默认值
    if (val === undefined && props.item.defaultValue !== undefined) {
      return props.item.defaultValue;
    }
    return val;
  },
  set: (val) => {
    if (!props.item.modelPath) return;
    const newSettings = { ...props.settings };
    set(newSettings, props.item.modelPath, val);
    emit("update:settings", newSettings);
  },
});

const handleUpdate = (val: any) => {
  modelValue.value = val;
};

const handleChange = () => {
  // 即使没有具体的 modelPath 修改，也触发一次更新，强制父组件感知
  // 这对于像 PipelineConfig 这样自己管理状态的组件很有用
  emit("update:settings", { ...props.settings });
};

// 基础组件映射表
const baseComponentMap: Record<string, any> = {
  ElSwitch,
  ElSlider,
  ElRadioGroup,
  ElInputNumber,
  ElInput,
  ElSelect,
  PromptEditor,
};

const resolvedComponent = computed(() => {
  const comp = props.item.component;
  if (typeof comp === "string") {
    return baseComponentMap[comp] || comp;
  }
  return comp;
});

const resolvedProps = computed(() => {
  if (typeof props.item.props === "function") {
    return props.item.props(props.settings);
  }
  return props.item.props || {};
});

const resolvedOptions = computed(() => {
  if (typeof props.item.options === "function") {
    return props.item.options(props.settings);
  }
  return props.item.options;
});

const selectedOptionDescription = computed(() => {
  if (props.item.component === "ElSelect" && resolvedOptions.value) {
    const option = resolvedOptions.value.find((opt: any) => opt.value === modelValue.value);
    return option?.description;
  }
  return undefined;
});

// 模板字符串替换 helper
const renderTemplate = (tpl: string) => {
  return tpl.replace(/\{\{ (.*?) \}\}/g, (_, expression) => {
    try {
      // eslint-disable-next-line no-new-func
      return new Function("localSettings", `return ${expression}`)(props.settings);
    } catch (e) {
      return `{{ ${expression} }}`;
    }
  });
};

const resolvedLabel = computed(() => renderTemplate(props.item.label));
const resolvedHint = computed(() => renderTemplate(props.item.hint));

const componentClasses = computed(() => {
  const classes: string[] = [];
  const p = resolvedProps.value;
  if (
    props.item.component === "ElSlider" ||
    (props.item.component === "ElInput" && p?.type === "textarea") ||
    props.item.component === "SliderWithInput" ||
    props.item.component === "FileSelector"
  ) {
    classes.push("full-width");
  }
  return classes;
});

const handleAction = () => {
  if (props.item.action) {
    emit("action", props.item.action);
  }
};

// --- Collapsible 懒加载逻辑 ---
const activeCollapseNames = ref<string[]>([]);
const isComponentLoaded = ref(false);
const isLoading = ref(false);

watch(
  activeCollapseNames,
  (newNames) => {
    if (
      props.item.collapsible &&
      newNames.includes(props.item.collapsible.name) &&
      !isComponentLoaded.value
    ) {
      if (props.item.collapsible.useLoading) {
        isLoading.value = true;
        setTimeout(() => {
          isLoading.value = false;
        }, 500);
      }
      isComponentLoaded.value = true;
    }
  },
  { immediate: true }
);

if (!props.item.collapsible) {
  isComponentLoaded.value = true;
}
</script>

<style scoped>
.full-width {
  flex: 1;
}

.setting-item-content {
  display: flex;
  width: 100%;
  gap: 8px;
  align-items: flex-start;
}

.setting-item-content-inline {
  display: flex;
  align-items: center;
}

.setting-item-content > :deep(.full-width) {
  flex: 1;
}

.append-slot {
  flex-shrink: 0;
  margin-top: 2px;
  cursor: pointer;
}

.form-hint {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 4px;
  padding-left: 8px;
  line-height: 1.4;
  width: 100%;
}

.form-hint-inline {
  font-size: 12px;
  color: var(--text-color-secondary);
  line-height: 1.4;
  margin-left: 12px;
}

.select-option-with-tags {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.tags-container {
  display: flex;
  gap: 4px;
}

.slider-with-input {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 16px;
}

.slider-with-input .slider-part {
  flex: 1;
  margin-right: 0;
}

.slider-with-input .input-part {
  width: 140px;
}

.slider-with-input .input-part :deep(input) {
  text-align: center;
}

/* 高亮样式 */
.setting-item-highlight {
  background-color: var(--el-color-primary-light-9);
  border-radius: 4px;
  transition: background-color 0.3s ease-in-out;
  padding: 4px 8px;
  margin: -4px -8px;
}
</style>
