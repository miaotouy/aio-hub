<template>
  <el-form :model="formData" label-width="80px" label-position="left">
    <el-form-item label="名称" :required="required">
      <el-input
        v-model="formData.name"
        placeholder="例如: 魔法少年"
        maxlength="50"
        show-word-limit
        @input="handleInput"
      />
    </el-form-item>

    <el-form-item label="头像">
      <IconEditor
        :model-value="formData.icon || ''"
        @update:icon="handleIconUpdate"
        :mode="formData.iconMode === 'builtin' ? 'upload' : 'path'"
        :entity-id="profileId"
        profile-type="user"
        show-mode-switch
        :name-for-fallback="formData.name"
        @update:mode="
          (newMode) => {
            formData.iconMode = newMode === 'upload' ? 'builtin' : 'path';
            handleInput();
          }
        "
      />
      <div class="form-hint">上传的头像将与该档案绑定存储，删除档案时会一并清除。</div>
    </el-form-item>

    <el-form-item label="描述" :required="required">
      <el-input
        v-model="formData.content"
        type="textarea"
        :rows="descriptionRows"
        placeholder="请输入用户角色描述，如：我是一个资深魔法少年，来自xxxx家族..."
        maxlength="20000"
        show-word-limit
        @input="handleInput"
      />
      <div class="form-hint">此描述将作为用户角色在对话中的身份信息</div>
    </el-form-item>

    <!-- 可选的元数据显示 -->
    <template v-if="showMetadata">
      <el-divider />

      <el-form-item label="创建时间">
        <div class="info-text">{{ formatDateTime(formData.createdAt) }}</div>
      </el-form-item>

      <el-form-item v-if="formData.lastUsedAt" label="最后使用">
        <div class="info-text">{{ formatDateTime(formData.lastUsedAt) }}</div>
      </el-form-item>
    </template>
  </el-form>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import IconEditor from "@/components/common/IconEditor.vue";

import type { IconMode } from "@/tools/llm-chat/types";
import type { IconUpdatePayload } from "@/components/common/IconEditor.vue";

interface UserProfileFormData {
  id?: string; // 允许ID传入
  name: string;
  icon?: string;
  iconMode?: IconMode;
  content: string;
  createdAt?: string;
  lastUsedAt?: string;
}

interface Props {
  /** 表单数据 */
  modelValue: UserProfileFormData;
  /** 档案ID，用于上传头像等操作 */
  profileId?: string;
  /** 是否显示上传按钮 */
  showUpload?: boolean;
  /** 是否显示清除按钮 */
  showClear?: boolean;
  /** 是否显示元数据（创建时间等） */
  showMetadata?: boolean;
  /** 是否必填 */
  required?: boolean;
  /** 描述框行数 */
  descriptionRows?: number;
  /** 图标输入框提示文本 */
  iconPlaceholder?: string;
  /** 图标输入框提示信息 */
  iconHint?: string;
}

const props = withDefaults(defineProps<Props>(), {
  showUpload: true,
  showClear: false,
  showMetadata: false,
  required: false,
  descriptionRows: 12,
  iconPlaceholder: "输入 emoji、路径或选择图像（可选）",
  iconHint: "可以输入 emoji、从预设选择、上传图像或输入绝对路径",
  profileId: undefined,
});

const emit = defineEmits<{
  "update:modelValue": [value: UserProfileFormData];
}>();

// 内部表单数据
const formData = ref<UserProfileFormData>({ ...props.modelValue });

// 监听外部数据变化
watch(
  () => props.modelValue,
  (newValue) => {
    formData.value = { ...newValue };
  },
  { deep: true }
);

// 处理输入变化
const handleInput = () => {
  emit("update:modelValue", { ...formData.value });
};

const handleIconUpdate = (payload: IconUpdatePayload) => {
  formData.value.icon = payload.value;
  if (payload.source === "upload") {
    formData.value.iconMode = "builtin";
  } else {
    formData.value.iconMode = "path";
  }
  handleInput();
};

// 格式化日期时间（完整格式）
const formatDateTime = (dateStr?: string) => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleString("zh-CN");
};
</script>

<style scoped>
/* 表单提示 */
.form-hint {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 4px;
}

/* 信息文本 */
.info-text {
  font-size: 14px;
  color: var(--text-color);
}
</style>
