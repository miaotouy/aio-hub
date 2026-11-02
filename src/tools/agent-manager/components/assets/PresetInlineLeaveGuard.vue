<script setup lang="ts">
import { ref } from "vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
type Decision = "save" | "discard" | "continue";
const open = ref(false);
let settle: ((value: Decision) => void) | undefined;
function finish(value: Decision) {
  open.value = false;
  settle?.(value);
  settle = undefined;
}
function ask(): Promise<Decision> {
  return new Promise((resolve) => {
    settle?.("continue");
    settle = resolve;
    open.value = true;
  });
}
defineExpose({ ask });
</script>
<template>
  <BaseDialog
    :model-value="open"
    title="有未保存的修改"
    width="400px"
    height="auto"
    :close-on-backdrop-click="false"
    @update:model-value="finish('continue')"
  >
    <template #content
      ><p class="leave-guard-text">
        关闭前是否保存当前修改？放弃后将恢复到上次保存的内容。
      </p></template
    >
    <template #footer>
      <div class="leave-guard-footer">
        <el-button type="danger" plain @click="finish('discard')"
          >放弃更改</el-button
        >
        <el-button @click="finish('continue')">继续编辑</el-button>
        <el-button type="primary" @click="finish('save')">保存并关闭</el-button>
      </div>
    </template>
  </BaseDialog>
</template>

<style scoped>
.leave-guard-text {
  margin: 0;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}
.leave-guard-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.leave-guard-footer .el-button {
  margin: 0;
}
.leave-guard-footer .el-button:first-child {
  margin-right: auto;
}
</style>
