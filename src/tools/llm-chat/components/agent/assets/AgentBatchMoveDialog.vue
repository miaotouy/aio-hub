<script setup lang="ts">
import { ref, watch } from "vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import type { AssetGroup } from "../../../types";

interface Props {
  modelValue: boolean;
  sortedGroups: AssetGroup[];
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "confirm", targetGroup: string): void;
}>();

const targetGroup = ref("");

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      targetGroup.value = "";
    }
  }
);

const handleConfirm = () => {
  emit("confirm", targetGroup.value);
};
</script>

<template>
  <BaseDialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    title="批量移动到分组"
    width="400px"
  >
    <el-form label-width="80px">
      <el-form-item label="目标分组">
        <el-select
          v-model="targetGroup"
          placeholder="选择分组"
          style="width: 100%"
          filterable
        >
          <el-option label="未分组" value="default" />
          <el-option
            v-for="group in sortedGroups"
            :key="group.id"
            :label="group.displayName"
            :value="group.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item v-if="sortedGroups.length === 0">
        <div class="form-tip">暂无自定义分组，请先在侧边栏创建分组</div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" @click="handleConfirm">确定移动</el-button>
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
