<template>
  <div class="prompt-editor">
    <el-input
      :model-value="modelValue"
      @update:model-value="(val: string) => emit('update:modelValue', val)"
      type="textarea"
      :rows="rows"
      :placeholder="placeholder"
      class="prompt-textarea"
    />
    <div class="prompt-actions">
      <el-popconfirm title="确定要重置为默认提示词吗？" @confirm="handleReset" width="200">
        <template #reference>
          <el-button type="default" plain size="small">
            <el-icon><RefreshLeft /></el-icon>
            重置
          </el-button>
        </template>
      </el-popconfirm>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElInput, ElButton, ElIcon, ElPopconfirm } from "element-plus";
import { RefreshLeft } from "@element-plus/icons-vue";
import { customMessage } from "@/utils/customMessage";

interface Props {
  modelValue: string;
  defaultValue?: string;
  placeholder?: string;
  rows?: number;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: "",
  defaultValue: "",
  placeholder: "请输入提示词",
  rows: 6,
});

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const handleReset = () => {
  if (props.modelValue === props.defaultValue) {
    return;
  }
  emit("update:modelValue", props.defaultValue);
  customMessage.success("已重置为默认提示词");
};
</script>

<style scoped>
.prompt-editor {
  display: flex;
  width: 100%;
  gap: 8px;
  align-items: flex-start;
}

.prompt-textarea {
  flex: 1;
}

.prompt-actions {
  flex-shrink: 0;
  margin-top: 2px;
}
</style>
