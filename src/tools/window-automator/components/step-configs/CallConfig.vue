<script setup lang="ts">
/**
 * 调用步骤配置：选择目标子流程 / 自定义函数
 *
 * §8 参数传递：选完函数后动态渲染形参输入表单，支持 {var} 插值。
 * §9 返回值：暴露 saveResultToVariable 输入框。
 */
import { computed } from "vue";
import { useWindowAutomatorStore } from "../../stores/windowAutomator.store";
import type { CallStepParams, SubFlowParamDefine } from "../../types";

const props = defineProps<{
  params: CallStepParams;
}>();
const emit = defineEmits<{
  (e: "update:params", value: CallStepParams): void;
}>();

const store = useWindowAutomatorStore();

/** 当前方案下的所有子流程 */
const subFlows = computed(() => store.currentFlow?.subFlows ?? []);

/** 当前选中的目标子流程对象（用于读取形参定义） */
const selectedSub = computed(() => {
  if (!props.params.targetSubFlowId) return null;
  return (
    subFlows.value.find((s) => s.id === props.params.targetSubFlowId) ?? null
  );
});

/** 当前选中函数的形参列表 */
const selectedParams = computed<SubFlowParamDefine[]>(() => {
  return selectedSub.value?.params ?? [];
});

function update(patch: Partial<CallStepParams>) {
  emit("update:params", { ...props.params, ...patch });
}

/** 更新某个实参的值 */
function updateArg(name: string, value: string) {
  const args = { ...(props.params.arguments ?? {}) };
  if (value) {
    args[name] = value;
  } else {
    delete args[name];
  }
  update({ arguments: Object.keys(args).length > 0 ? args : undefined });
}

/** 获取某个形参当前的实参值 */
function getArg(name: string): string {
  return props.params.arguments?.[name] ?? "";
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

    <!-- §8 形参输入表单 -->
    <div v-if="selectedSub && selectedParams.length > 0" class="params-section">
      <div class="section-label">实参</div>
      <div v-for="p in selectedParams" :key="p.name" class="param-row">
        <label class="param-label" :title="p.name">
          {{ p.label || p.name }}
        </label>
        <el-input
          :model-value="getArg(p.name)"
          :placeholder="`默认: ${p.defaultValue || '(空)'}`"
          size="small"
          @update:model-value="
            (v: string | number) => updateArg(p.name, String(v ?? ''))
          "
        />
      </div>
      <div class="param-hint">
        支持 <code v-pre>{var}</code> 插值，留空则使用函数定义的默认值
      </div>
    </div>

    <!-- §9 返回值绑定 -->
    <div v-if="selectedSub" class="return-section">
      <div class="section-label">返回值</div>
      <div class="return-row">
        <el-input
          :model-value="params.saveResultToVariable ?? ''"
          placeholder="保存到变量名（留空丢弃返回值）"
          size="small"
          @update:model-value="
            (v: string | number) =>
              update({ saveResultToVariable: String(v ?? '') || undefined })
          "
        />
      </div>
      <div v-if="selectedSub.returnVariableName" class="return-hint">
        函数 <code>{{ selectedSub.name }}</code> 会返回
        <code>{{ selectedSub.returnVariableName }}</code> 的值
      </div>
      <div v-else class="return-hint muted">该函数未配置返回值</div>
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
