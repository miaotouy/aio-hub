<template>
  <BaseDialog
    :model-value="modelValue"
    title="管理色系"
    width="800px"
    :close-on-backdrop-click="false"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="rules-editor">
      <p class="rules-hint">
        按从上到下的优先级匹配，命中第一条即停止；未命中归入“未分类”。展示色不参与匹配。
      </p>
      <p class="rules-hint">
        H 为色相，起点大于终点表示跨 0°；S 为饱和度，L 为 HSL
        明度（不是图片亮度）。范围包含下限、不含上限，S/L 的 100% 包含端点。
      </p>
      <div class="rules-actions">
        <el-button @click="addRule">新增色系</el-button>
        <el-button
          @click="
            draft = createDefaultColorRules();
            error = '';
          "
          >恢复默认</el-button
        >
      </div>
      <p v-if="!draft.length" class="rules-hint">
        没有色系规则，所有图片将进入“未分类”。
      </p>
      <section
        v-for="(rule, index) in draft"
        :key="rule.id"
        class="rule-card"
        :aria-label="`色系 ${index + 1}`"
      >
        <div class="rule-heading">
          <span class="rule-order">{{ index + 1 }}</span>
          <el-input
            v-model="rule.name"
            aria-label="色系名称"
            placeholder="色系名称（也是归档目录名）"
          />
          <el-color-picker
            v-model="rule.displayColor"
            color-format="hex"
            :show-alpha="false"
            aria-label="展示色"
          />
          <el-button
            :disabled="index === 0"
            :aria-label="`上移 ${rule.name}`"
            @click="move(index, -1)"
            >上移</el-button
          >
          <el-button
            :disabled="index === draft.length - 1"
            :aria-label="`下移 ${rule.name}`"
            @click="move(index, 1)"
            >下移</el-button
          >
          <el-button type="danger" text @click="draft.splice(index, 1)"
            >删除</el-button
          >
        </div>
        <div class="rule-range">
          <span>H 色相</span>
          <el-input-number
            v-model="rule.hue.start"
            :min="0"
            :max="359.99"
            :precision="2"
            :disabled="rule.hue.all"
            aria-label="色相起点"
          />
          <span>至</span>
          <el-input-number
            v-model="rule.hue.end"
            :min="0"
            :max="360"
            :precision="2"
            :disabled="rule.hue.all"
            aria-label="色相终点"
          />
          <el-checkbox v-model="rule.hue.all">全部色相</el-checkbox>
        </div>
        <div
          v-for="dimension in dimensions"
          :key="dimension.key"
          class="rule-range"
        >
          <span>{{ dimension.label }}</span>
          <el-input-number
            :model-value="rule[dimension.key][0] * 100"
            :min="0"
            :max="100"
            :precision="2"
            :aria-label="`${dimension.label}下限`"
            @update:model-value="setRange(rule, dimension.key, 0, $event)"
          />
          <span>至</span>
          <el-input-number
            :model-value="rule[dimension.key][1] * 100"
            :min="0"
            :max="100"
            :precision="2"
            :aria-label="`${dimension.label}上限`"
            @update:model-value="setRange(rule, dimension.key, 1, $event)"
          />
          <span>%</span>
        </div>
      </section>
      <p v-if="error" class="rules-error" role="alert">{{ error }}</p>
    </div>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" @click="apply">应用</el-button>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import {
  createDefaultColorRules,
  validateColorRules,
  type ColorFamilyRule,
} from "../colorFamilyRules";
const props = defineProps<{ modelValue: boolean; rules: ColorFamilyRule[] }>();
const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "apply", rules: ColorFamilyRule[]): void;
}>();
const draft = ref<ColorFamilyRule[]>([]);
const error = ref("");
const dimensions = [
  { key: "saturation", label: "S 饱和度" },
  { key: "lightness", label: "L 明度" },
] as const;
watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      draft.value =
        validateColorRules(props.rules).rules ?? createDefaultColorRules();
      error.value = "";
    }
  },
  { immediate: true }
);
function addRule() {
  draft.value.push({
    id: crypto.randomUUID(),
    name: "",
    displayColor: "#808080",
    hue: { all: true, start: 0, end: 360 },
    saturation: [0, 1],
    lightness: [0, 1],
  });
}
function move(index: number, offset: number) {
  const [rule] = draft.value.splice(index, 1);
  draft.value.splice(index + offset, 0, rule);
}
function setRange(
  rule: ColorFamilyRule,
  key: "saturation" | "lightness",
  index: 0 | 1,
  value: number | undefined
) {
  rule[key][index] = value === undefined ? NaN : value / 100;
}
function apply() {
  const result = validateColorRules(draft.value);
  if (!result.rules) {
    error.value = result.error ?? "规则无效";
    return;
  }
  emit("apply", result.rules);
  emit("update:modelValue", false);
}
</script>

<style scoped>
.rules-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.rules-hint {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.6;
}
.rules-actions,
.rule-heading,
.rule-range {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.rule-card {
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--card-bg);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.rule-heading .el-input {
  flex: 1;
  min-width: 150px;
}
.rule-order {
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}
.rule-range > span:first-child {
  width: 70px;
  color: var(--text-color);
  font-size: 13px;
}
.rule-range .el-input-number {
  width: 135px;
}
.rules-error {
  color: var(--el-color-danger);
  margin: 0;
}
</style>
