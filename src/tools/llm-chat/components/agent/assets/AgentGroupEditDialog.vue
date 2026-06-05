<script setup lang="ts">
import { ref, watch } from "vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import type { AssetGroup } from "../../../types";

interface Props {
  modelValue: boolean;
  group: AssetGroup | null; // null = 创建模式
  defaultSortOrder?: number;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (
    e: "save",
    form: {
      id: string;
      displayName: string;
      description: string;
      icon: string;
      sortOrder: number;
    },
    isEdit: boolean
  ): void;
}>();

const form = ref({
  id: "",
  displayName: "",
  description: "",
  icon: "📁",
  sortOrder: 0,
});

watch(
  () => props.group,
  (group) => {
    if (group) {
      form.value = {
        id: group.id,
        displayName: group.displayName,
        description: group.description || "",
        icon: group.icon || "📁",
        sortOrder: group.sortOrder ?? 0,
      };
    } else {
      form.value = {
        id: "",
        displayName: "",
        description: "",
        icon: "📁",
        sortOrder: props.defaultSortOrder ?? 0,
      };
    }
  },
  { immediate: true }
);

const handleSave = () => {
  emit("save", { ...form.value }, !!props.group);
};
</script>

<template>
  <BaseDialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    :title="group ? '编辑分组' : '创建分组'"
    width="400px"
  >
    <el-form :model="form" label-width="80px" @submit.prevent="handleSave">
      <el-form-item label="ID" required>
        <el-input
          v-model="form.id"
          placeholder="分组唯一标识 (英文)"
          :disabled="!!group"
        />
        <div class="form-tip" v-if="!group">
          创建后 ID 不可修改，只能包含字母、数字、下划线和连字符
        </div>
      </el-form-item>
      <el-form-item label="名称" required>
        <el-input v-model="form.displayName" placeholder="显示名称" />
      </el-form-item>
      <el-form-item label="图标">
        <el-input
          v-model="form.icon"
          placeholder="Emoji 或图标字符"
          style="width: 100px"
        />
      </el-form-item>
      <el-form-item label="排序">
        <el-input-number
          v-model="form.sortOrder"
          :min="0"
          :step="1"
          controls-position="right"
        />
      </el-form-item>
      <el-form-item label="描述">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="2"
          placeholder="分组描述（可选）"
        /> </el-form-item
    ></el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" @click="handleSave">保存</el-button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.form-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  line-height: 1.4;
}
</style>
