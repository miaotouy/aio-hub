<script setup lang="ts">
import { defineAsyncComponent } from "vue";
import BaseDialog from "@/components/common/BaseDialog.vue";

const QuickActionFullManager = defineAsyncComponent(() => import("./QuickActionFullManager.vue"));

interface Props {
  visible: boolean;
}

defineProps<Props>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
}>();

const handleClose = () => {
  emit("update:visible", false);
};
</script>

<template>
  <BaseDialog
    :model-value="visible"
    @update:model-value="emit('update:visible', $event)"
    title="快捷操作管理"
    width="90%"
    height="85vh"
    destroy-on-close
  >
    <QuickActionFullManager />

    <template #footer>
      <el-button @click="handleClose">关闭</el-button>
    </template>
  </BaseDialog>
</template>
