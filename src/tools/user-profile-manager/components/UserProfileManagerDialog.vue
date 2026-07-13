<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<script setup lang="ts">
import BaseDialog from "@/components/common/BaseDialog.vue";
import UserProfileManager from "../UserProfileManager.vue";

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
        <UserProfileManager />
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
