<template>
  <BaseDialog
    v-model="visible"
    title="正在生成向量"
    width="400px"
    :close-on-backdrop-click="false"
    :show-close-button="false"
  >
    <div class="progress-container">
      <el-progress
        type="circle"
        :percentage="percentage"
        :status="status"
        :stroke-width="10"
      />
      <div class="progress-info">
        <div class="status-text">{{ statusText }}</div>
        <div class="count-text">{{ current }} / {{ total }}</div>
      </div>
    </div>
    <template #footer>
      <el-button v-if="status === 'exception'" type="primary" @click="visible = false">关闭</el-button>
      <el-button v-else-if="percentage === 100" type="primary" @click="visible = false">完成</el-button>
      <el-button v-else @click="cancel">取消</el-button>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import BaseDialog from "@/components/common/BaseDialog.vue";

const visible = ref(false);
const total = ref(0);
const current = ref(0);
const status = ref<"" | "success" | "warning" | "exception">("");
const statusText = ref("准备中...");

const percentage = computed(() => {
  if (total.value === 0) return 0;
  return Math.round((current.value / total.value) * 100);
});

const show = (totalCount: number) => {
  total.value = totalCount;
  current.value = 0;
  status.value = "";
  statusText.value = "正在生成向量...";
  visible.value = true;
};

const update = (count: number, text?: string) => {
  current.value = count;
  if (text) statusText.value = text;
  if (current.value === total.value) {
    status.value = "success";
    statusText.value = "生成完成";
  }
};

const setError = (msg: string) => {
  status.value = "exception";
  statusText.value = msg;
};

const cancel = () => {
  // 这里可以触发中止逻辑
  visible.value = false;
};

defineExpose({
  show,
  update,
  setError,
});
</script>

<style scoped>
.progress-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 20px 0;
}

.progress-info {
  text-align: center;
}

.status-text {
  font-weight: bold;
  margin-bottom: 4px;
}

.count-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>