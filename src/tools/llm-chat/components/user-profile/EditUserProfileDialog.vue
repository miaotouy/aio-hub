<template>
  <BaseDialog
    :modelValue="visible"
    @update:modelValue="handleVisibleChange"
    title="编辑用户档案"
    width="80%"
    maxWidth="1200px"
  >
    <template #content>
      <UserProfileForm
        v-model="form"
        :required="true"
        :description-rows="8"
        :show-metadata="true"
        :showUpload="true"
        icon-placeholder="输入 emoji、路径或选择图像（可选）"
        icon-hint="可以输入 emoji、从预设选择或输入绝对路径"
      />
    </template>

    <template #footer>
      <el-button @click="handleVisibleChange(false)">取消</el-button>
      <el-button type="primary" @click="handleSave" :disabled="!isValid"> 保存 </el-button>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import UserProfileForm from "@/views/Settings/user-profile/components/UserProfileForm.vue";
import { customMessage } from "@/utils/customMessage";
import type { UserProfile } from "../../types";

interface Props {
  visible: boolean;
  profile: UserProfile | null;
}

interface Emits {
  (e: "update:visible", value: boolean): void;
  (e: "save", data: { id: string; name: string; content: string; icon?: string }): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// 表单数据
const form = ref({
  name: "",
  icon: "",
  content: "",
  createdAt: "",
  lastUsedAt: "",
});

// 监听传入的档案数据变化
watch(
  () => props.profile,
  (profile) => {
    if (profile) {
      form.value = {
        name: profile.name,
        icon: profile.icon || "",
        content: profile.content,
        createdAt: profile.createdAt,
        lastUsedAt: profile.lastUsedAt || "",
      };
    }
  },
  { immediate: true }
);

// 验证表单是否有效
const isValid = computed(() => {
  return form.value.name.trim() !== "" && form.value.content.trim() !== "";
});

// 处理对话框显示状态变化
const handleVisibleChange = (value: boolean) => {
  emit("update:visible", value);
};

// 处理保存
const handleSave = () => {
  if (!isValid.value) {
    customMessage.error("请填写所有必填字段");
    return;
  }

  if (!props.profile) {
    customMessage.error("无法保存：档案数据不存在");
    return;
  }

  emit("save", {
    id: props.profile.id,
    name: form.value.name.trim(),
    content: form.value.content.trim(),
    icon: form.value.icon?.trim() || undefined,
  });

  handleVisibleChange(false);
  customMessage.success("用户档案已更新");
};
</script>
