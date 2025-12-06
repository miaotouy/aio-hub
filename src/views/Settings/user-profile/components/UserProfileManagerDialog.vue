<script setup lang="ts">
import BaseDialog from "@/components/common/BaseDialog.vue";
import UserProfileSettings from "../UserProfileSettings.vue";

interface Props {
  visible: boolean;
}

defineProps<Props>();

interface Emits {
  (e: "update:visible", value: boolean): void;
}

const emit = defineEmits<Emits>();

const handleClose = () => {
  emit("update:visible", false);
};
</script>

<template>
  <BaseDialog
    :model-value="visible"
    @update:model-value="handleClose"
    title="管理用户档案"
    width="90%"
    max-width="1400px"
    :show-footer="false"
  >
    <template #content>
      <div class="dialog-content-wrapper">
        <UserProfileSettings />
      </div>
    </template>
  </BaseDialog>
</template>

<style scoped>
.dialog-content-wrapper {
  height: 80vh;
  display: flex;
  flex-direction: column;
}

/* 移除 UserProfileSettings 组件的根元素 padding，避免与 BaseDialog 的 padding 重叠 */
:deep(.user-profile-settings-page) {
  padding: 0;
}

/* 移除内部组件的模糊效果，防止与 BaseDialog 的模糊重叠 */
:deep(.profile-sidebar),
:deep(.profile-editor) {
  backdrop-filter: none;
}
</style>