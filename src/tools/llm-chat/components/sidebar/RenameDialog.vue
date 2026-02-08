<script setup lang="ts">
import { ref, watch } from "vue";
import { customMessage } from "@/utils/customMessage";

interface Props {
  modelValue: boolean;
  initialName: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "confirm", newName: string): void;
}>();

const newSessionName = ref(props.initialName);

watch(
  () => props.initialName,
  (val) => {
    newSessionName.value = val;
  }
);

const handleConfirm = () => {
  const trimmedName = newSessionName.value.trim();
  if (!trimmedName) {
    customMessage.warning("会话名称不能为空");
    return;
  }
  emit("confirm", trimmedName);
  emit("update:modelValue", false);
};

const handleCancel = () => {
  emit("update:modelValue", false);
};
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    title="重命名会话"
    width="400px"
    @close="handleCancel"
  >
    <el-input
      v-model="newSessionName"
      placeholder="请输入新的会话名称"
      maxlength="100"
      show-word-limit
      @keyup.enter="handleConfirm"
      autofocus
    />
    <template #footer>
      <el-button @click="handleCancel">取消</el-button>
      <el-button type="primary" @click="handleConfirm">确定</el-button>
    </template>
  </el-dialog>
</template>
