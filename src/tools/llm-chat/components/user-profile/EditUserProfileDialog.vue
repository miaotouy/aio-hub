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
import { type UserProfile, type UserProfileUpdateData, createDefaultUserProfileConfig } from "../../types";

interface Props {
  visible: boolean;
  profile: UserProfile | null;
}

interface Emits {
  (e: "update:visible", value: boolean): void;
  (e: "save", data: UserProfileUpdateData): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// 表单数据类型 - 排除 id，其他字段都应该在表单中维护
// 使用 Omit 可以确保当 UserProfile 增加新字段时，这里会自动包含（虽然可能需要更新初始值）
type FormState = Omit<UserProfile, "id">;

// 使用默认配置初始化表单，但需要补充 FormState 中必须但 createDefaultUserProfileConfig 中没有的字段（如 createdAt）
// 实际上 createDefaultUserProfileConfig 返回的是 UserProfileEditData，不包含 createdAt/lastUsedAt
// 这里我们初始化一个空状态，具体值会由 watch 填充
const form = ref<FormState>({
  ...createDefaultUserProfileConfig(),
  createdAt: "",
  lastUsedAt: "",
});

// 监听传入的档案数据变化
watch(
  () => props.profile,
  (profile) => {
    if (profile) {
      const defaults = createDefaultUserProfileConfig();
      // 使用解构赋值，自动包含所有字段
      // 对于 undefined 的可选字段，给予默认值
      form.value = {
        ...defaults, // 先应用默认值
        ...profile,  // 再应用实际值
        // 确保可选字段不为 undefined/null，虽然 defaults 已经处理了，但 profile 中的 null/undefined 可能会覆盖 defaults
        displayName: profile.displayName ?? defaults.displayName,
        icon: profile.icon ?? defaults.icon,
        richTextStyleOptions: profile.richTextStyleOptions ?? defaults.richTextStyleOptions,
        richTextStyleBehavior: profile.richTextStyleBehavior ?? defaults.richTextStyleBehavior,
        regexConfig: profile.regexConfig ?? defaults.regexConfig,
        worldbookIds: profile.worldbookIds ?? defaults.worldbookIds ?? [],
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

  // 1. 提取不需要保存的系统字段
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { createdAt, lastUsedAt, ...rest } = form.value;

  // 2. 构造保存数据
  // 使用展开运算符自动包含所有字段，这样新增字段时不需要修改这里
  const saveData: UserProfileUpdateData = {
    ...rest,
    id: props.profile.id,
    // 3. 覆盖需要特殊处理的字段 (trim, empty string to undefined)
    name: form.value.name.trim(),
    displayName: form.value.displayName?.trim() || undefined,
    content: form.value.content.trim(),
    icon: form.value.icon?.trim() || undefined,
  };

  emit("save", saveData);

  handleVisibleChange(false);
  customMessage.success("用户档案已更新");
};
</script>
