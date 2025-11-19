<template>
  <div class="style-item-editor">
    <el-form label-position="top" size="small">
      <el-row :gutter="16">
        <el-col :xs="24" :sm="12">
          <el-form-item label="文本颜色">
            <div class="color-picker-row">
              <el-color-picker v-model="localValue.color" show-alpha size="small" />
              <el-input v-model="localValue.color" placeholder="继承默认" size="small" clearable />
            </div>
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12">
          <el-form-item label="背景颜色">
            <div class="color-picker-row">
              <el-color-picker v-model="localValue.backgroundColor" show-alpha size="small" />
              <el-input
                v-model="localValue.backgroundColor"
                placeholder="无背景"
                size="small"
                clearable
              />
            </div>
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="16">
        <el-col :xs="24" :sm="12">
          <el-form-item label="字体粗细">
            <el-select v-model="localValue.fontWeight" placeholder="默认" clearable size="small">
              <el-option label="默认" value="" />
              <el-option label="正常 (400)" value="400" />
              <el-option label="粗体 (600)" value="600" />
              <el-option label="特粗 (800)" value="800" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12">
          <el-form-item label="字体样式">
            <el-select v-model="localValue.fontStyle" placeholder="默认" clearable size="small">
              <el-option label="默认" value="" />
              <el-option label="正常" value="normal" />
              <el-option label="斜体" value="italic" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="16">
        <el-col :xs="24" :sm="12">
          <el-form-item label="文本装饰">
            <el-select
              v-model="localValue.textDecoration"
              placeholder="默认"
              clearable
              size="small"
            >
              <el-option label="默认" value="" />
              <el-option label="无" value="none" />
              <el-option label="下划线" value="underline" />
              <el-option label="删除线" value="line-through" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12">
          <el-form-item label="文本发光 (Text Shadow)">
            <el-input
              v-model="localValue.textShadow"
              placeholder="e.g. 0 0 5px rgba(0,0,0,0.5)"
              size="small"
              clearable
            />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="16">
        <el-col :xs="24" :sm="12">
          <el-form-item label="边框颜色">
            <div class="color-picker-row">
              <el-color-picker v-model="localValue.borderColor" show-alpha size="small" />
              <el-input
                v-model="localValue.borderColor"
                placeholder="无边框"
                size="small"
                clearable
              />
            </div>
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12">
          <el-form-item label="圆角 (Border Radius)">
            <el-input
              v-model="localValue.borderRadius"
              placeholder="e.g. 4px"
              size="small"
              clearable
            />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="16">
        <el-col :xs="24" :sm="24">
          <el-form-item label="盒阴影 (Box Shadow)">
            <el-input
              v-model="localValue.boxShadow"
              placeholder="e.g. 0 2px 4px rgba(0,0,0,0.1)"
              size="small"
              clearable
            />
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { watch, reactive } from "vue";
import type { MarkdownStyleOption } from "../../types";

const props = defineProps<{
  modelValue?: MarkdownStyleOption;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: MarkdownStyleOption): void;
}>();

const localValue = reactive<MarkdownStyleOption>({});

watch(
  () => props.modelValue,
  (newVal) => {
    const safeNewVal = newVal || {};

    // 1. 找出需要删除的 key
    const keysToRemove = Object.keys(localValue).filter(
      (key) => !(key in safeNewVal)
    );

    // 2. 找出需要更新的 key
    const keysToUpdate = Object.keys(safeNewVal).filter(
      (key) => (localValue as any)[key] !== (safeNewVal as any)[key]
    );

    // 如果没有变化，直接返回，打断循环
    if (keysToRemove.length === 0 && keysToUpdate.length === 0) {
      return;
    }

    // 执行更新
    keysToRemove.forEach((key) => delete (localValue as any)[key]);
    keysToUpdate.forEach(
      (key) => ((localValue as any)[key] = (safeNewVal as any)[key])
    );
  },
  { immediate: true, deep: true }
);

watch(
  localValue,
  (newVal) => {
    // 过滤空值
    const cleanVal: MarkdownStyleOption = {};
    if (newVal.color) cleanVal.color = newVal.color;
    if (newVal.backgroundColor) cleanVal.backgroundColor = newVal.backgroundColor;
    if (newVal.textShadow) cleanVal.textShadow = newVal.textShadow;
    if (newVal.fontWeight) cleanVal.fontWeight = newVal.fontWeight;
    if (newVal.fontStyle) cleanVal.fontStyle = newVal.fontStyle;
    if (newVal.textDecoration) cleanVal.textDecoration = newVal.textDecoration;
    if (newVal.borderColor) cleanVal.borderColor = newVal.borderColor;
    if (newVal.borderRadius) cleanVal.borderRadius = newVal.borderRadius;
    if (newVal.boxShadow) cleanVal.boxShadow = newVal.boxShadow;

    emit("update:modelValue", cleanVal);
  },
  { deep: true }
);
</script>

<style scoped>
/* .style-item-editor {
  No specific container style needed as el-form handles it
} 
*/
.color-picker-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.color-picker-row .el-input {
  flex: 1;
}
</style>
