<script setup lang="ts">
/**
 * 调用步骤配置：选择目标子流程 / 自定义函数
 */
import { computed } from "vue";
import { useWindowAutomatorStore } from "../../stores/windowAutomator.store";
import type { CallStepParams } from "../../types";

const props = defineProps<{
  params: CallStepParams;
}>();
const emit = defineEmits<{
  (e: "update:params", value: CallStepParams): void;
}>();

const store = useWindowAutomatorStore();

/** 当前方案下的所有子流程 */
const subFlows = computed(() => store.currentFlow?.subFlows ?? []);

function update(patch: Partial<CallStepParams>) {
  emit("update:params", { ...props.params, ...patch });
}
</script>

<template>
  <div class="call-config">
    <div class="row">
      <div class="field grow">
        <label>目标函数 / 子流程</label>
        <el-select
          :model-value="params.targetSubFlowId"
          placeholder="选择函数"
          clearable
          @update:model-value="
            (v: string | number | null | undefined) =>
              update({ targetSubFlowId: String(v ?? '') })
          "
        >
          <el-option
            v-for="sub in subFlows"
            :key="sub.id"
            :label="sub.name"
            :value="sub.id"
          >
            <span class="opt-name">{{ sub.name }}</span>
            <span class="opt-meta">{{ sub.steps.length }} 步</span>
          </el-option>
        </el-select>
      </div>
    </div>
    <div v-if="subFlows.length === 0" class="empty-hint">
      暂无自定义函数，请先在左侧工具箱"函数库"中创建函数
    </div>
    <div v-else-if="!params.targetSubFlowId" class="empty-hint warn">
      请选择要调用的目标函数
    </div>
  </div>
</template>

<style scoped>
.call-config {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.row {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 220px;
}
.field.grow {
  flex: 1;
}
.field label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.opt-name {
  font-weight: 500;
}
.opt-meta {
  float: right;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.empty-hint {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  padding: 2px 4px;
}
.empty-hint.warn {
  color: var(--el-color-warning);
}
</style>
