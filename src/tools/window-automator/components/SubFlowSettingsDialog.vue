<script setup lang="ts">
/**
 * 子流程 / 自定义函数设置对话框。
 *
 * 可以编辑：
 *  - 函数名称
 *  - 形参列表（name / label / defaultValue）。可添加 / 删除。
 *  - 返回值变量名（returnVariableName）
 *
 * 提交后调用 store.updateSubFlowMeta，原子保存到 store，保持清洁的双向同步。
 */
import { computed, ref, watch } from "vue";
import { Plus, Trash2 } from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { useWindowAutomatorStore } from "../stores/windowAutomator.store";
import type { SubFlowParamDefine } from "../types";

const props = defineProps<{
  modelValue: boolean;
  /** 当前编辑的子流程 id；对话框打开时读取他的元信息 */
  subFlowId: string | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", v: boolean): void;
}>();

const store = useWindowAutomatorStore();

/** 当前正在编辑的子流程对象（从 store 实时推导） */
const editingSub = computed(() => {
  if (!props.subFlowId) return null;
  return (
    store.currentFlow?.subFlows?.find((s) => s.id === props.subFlowId) ?? null
  );
});

/** 本地草稿状态，不直接改 store，点“保存”才提交 */
const nameDraft = ref("");
const paramsDraft = ref<SubFlowParamDefine[]>([]);
const returnVarDraft = ref("");

/** 表单可以提交：名称非空 且 形参 name 唯一 */
const formValid = computed(() => {
  if (!nameDraft.value.trim()) return false;
  const names = paramsDraft.value.map((p) => p.name.trim()).filter(Boolean);
  if (new Set(names).size !== names.length) return false;
  return true;
});

/** 每行形参名重复检查 */
function isNameDuplicate(idx: number): boolean {
  const me = paramsDraft.value[idx]?.name?.trim();
  if (!me) return false;
  return paramsDraft.value.some((p, i) => i !== idx && p.name.trim() === me);
}

watch(
  () => [props.modelValue, props.subFlowId] as const,
  ([open, id]) => {
    if (!open || !id) return;
    const sub = store.currentFlow?.subFlows?.find((s) => s.id === id);
    if (!sub) return;
    nameDraft.value = sub.name;
    paramsDraft.value = (sub.params ?? []).map((p) => ({ ...p }));
    returnVarDraft.value = sub.returnVariableName ?? "";
  },
  { immediate: true }
);

function addParam() {
  // 生成一个默认不冲突的名称提议
  const used = new Set(paramsDraft.value.map((p) => p.name));
  let idx = paramsDraft.value.length + 1;
  let name = `param${idx}`;
  while (used.has(name)) {
    idx++;
    name = `param${idx}`;
  }
  paramsDraft.value.push({ name, label: "", defaultValue: "" });
}

function removeParam(idx: number) {
  paramsDraft.value.splice(idx, 1);
}

function close() {
  emit("update:modelValue", false);
}

function save() {
  if (!editingSub.value) return;
  if (!formValid.value) {
    customMessage.warning("请检查表单：函数名不能为空，形参名不能重复");
    return;
  }
  const params = paramsDraft.value
    .map((p) => ({
      name: p.name.trim(),
      label: p.label.trim() || p.name.trim(),
      defaultValue: p.defaultValue ?? "",
    }))
    .filter((p) => p.name);
  const trimmedReturn = returnVarDraft.value.trim();
  store.updateSubFlowMeta(editingSub.value.id, {
    name: nameDraft.value.trim(),
    params: params.length > 0 ? params : null,
    returnVariableName: trimmedReturn ? trimmedReturn : null,
  });
  customMessage.success("已保存函数设置");
  close();
}
</script>

<template>
  <BaseDialog
    :model-value="modelValue"
    :title="`编辑函数: ${editingSub?.name ?? ''}`"
    width="560px"
    :show-close-button="true"
    :close-on-backdrop-click="true"
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <div class="subflow-settings" v-if="editingSub">
      <div class="field-row">
        <label class="field-label">函数名称</label>
        <el-input
          v-model="nameDraft"
          placeholder="例：打坐回血"
          size="default"
        />
      </div>

      <div class="section-title">形参列表</div>
      <div class="params-hint">
        在他处调用本函数时会作为实参传入。 在函数内部可用
        <code v-pre>{{ name }}</code> 引用，也会作为局部变量在 log / goto
        等场景插值。
      </div>

      <div v-if="paramsDraft.length === 0" class="empty-hint">
        尚未定义形参。点击下方“添加形参”创建一个。
      </div>

      <div v-else class="params-list">
        <div v-for="(p, idx) in paramsDraft" :key="idx" class="param-row">
          <el-input
            v-model="p.name"
            placeholder="名称（英文 ID）"
            size="small"
            :class="{ 'name-input': true, invalid: isNameDuplicate(idx) }"
          />
          <el-input
            v-model="p.label"
            placeholder="显示名（可选）"
            size="small"
            class="label-input"
          />
          <el-input
            v-model="p.defaultValue"
            placeholder="默认值（可用 {var} 插值）"
            size="small"
            class="default-input"
          />
          <el-tooltip content="删除形参" placement="top">
            <button
              class="row-action danger"
              type="button"
              aria-label="删除形参"
              @click="removeParam(idx)"
            >
              <Trash2 :size="12" />
            </button>
          </el-tooltip>
        </div>
        <div
          v-if="paramsDraft.some((_, i) => isNameDuplicate(i))"
          class="row-warning"
        >
          存在重复的形参名，请修改后再保存。
        </div>
      </div>

      <el-button
        class="add-param-btn"
        :icon="Plus"
        size="small"
        @click="addParam"
      >
        添加形参
      </el-button>

      <div class="section-title">返回值</div>
      <div class="return-hint">
        填写一个局部变量名（例如 <code>ocr_result</code>），
        子流程跳出时会把该变量的值传回调用方。 调用方可以在 call
        步骤中配置“保存到变量”来接收。 留空表示不返回任何值。
      </div>
      <el-input
        v-model="returnVarDraft"
        placeholder="例如 ocr_result（留空则不返回）"
        size="default"
      />
    </div>

    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button type="primary" :disabled="!formValid" @click="save"
        >保存</el-button
      >
    </template>
  </BaseDialog>
</template>

<style scoped>
.subflow-settings {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.field-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.field-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 6px;
}
.params-hint,
.return-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}
.params-hint code,
.return-hint code {
  background-color: var(--el-fill-color-light);
  padding: 1px 5px;
  border-radius: 3px;
  font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
  font-size: 11px;
}
.empty-hint {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  padding: 4px 0;
}
.params-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.param-row {
  display: grid;
  grid-template-columns: 130px 1fr 1.4fr 24px;
  gap: 6px;
  align-items: center;
}
.name-input.invalid :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--el-color-danger) inset;
}
.label-input,
.default-input {
  min-width: 0;
}
.row-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: var(--border-width) solid var(--border-color);
  background-color: var(--bg-color);
  color: var(--el-text-color-secondary);
  border-radius: 4px;
  cursor: pointer;
  padding: 0;
  transition: all 0.15s;
}
.row-action:hover {
  border-color: var(--el-color-danger);
  color: var(--el-color-danger);
}
.row-warning {
  font-size: 12px;
  color: var(--el-color-danger);
  padding: 2px 4px;
}
.add-param-btn {
  align-self: flex-start;
}
</style>
