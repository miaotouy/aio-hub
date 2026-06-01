<template>
  <el-select
    :model-value="modelValue"
    :disabled="disabled"
    :placeholder="placeholder"
    filterable
    default-first-option
    teleported
    popper-class="translator-language-select"
    @update:model-value="handleSelectChange"
  >
    <el-option-group
      v-for="group in groupedOptions"
      :key="group.group"
      :label="getGroupLabel(group.group)"
    >
      <el-option
        v-for="option in group.options"
        :key="option.value"
        :label="option.label"
        :value="option.value"
      />
    </el-option-group>

    <!-- 永远固定在底部的"添加自定义语言"入口 -->
    <el-option
      :value="ADD_CUSTOM_SENTINEL"
      label="＋ 添加自定义语言…"
      class="add-custom-option"
    />
  </el-select>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ElMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import {
  TRANSLATOR_LANGUAGE_GROUP_LABELS,
  buildLanguageGroups,
} from "../constants";
import type { TranslatorLanguageCode } from "../types";

const ADD_CUSTOM_SENTINEL = "__translator_add_custom__";

interface Props {
  modelValue: TranslatorLanguageCode;
  customLanguages: string[];
  disabled?: boolean;
  placeholder?: string;
  /** 是否在选项中包含 auto（目标语言下拉应禁用） */
  includeAuto?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  placeholder: "选择语言",
  includeAuto: true,
});

const emit = defineEmits<{
  (e: "update:modelValue", value: TranslatorLanguageCode): void;
  (e: "add-custom", name: string): void;
}>();

const groupedOptions = computed(() => {
  const groups = buildLanguageGroups(props.customLanguages);
  if (props.includeAuto) return groups;
  return groups
    .map((g) => ({
      ...g,
      options: g.options.filter((opt) => opt.value !== "auto"),
    }))
    .filter((g) => g.options.length > 0);
});

function getGroupLabel(group: string) {
  return TRANSLATOR_LANGUAGE_GROUP_LABELS[group] ?? group;
}

async function handleSelectChange(value: TranslatorLanguageCode) {
  if (value === ADD_CUSTOM_SENTINEL) {
    await promptAddCustom();
    return;
  }
  emit("update:modelValue", value);
}

async function promptAddCustom() {
  try {
    const { value } = await ElMessageBox.prompt(
      "填入 LLM 能理解的英文名或原名，例如：Klingon、Toki Pona、Old English。",
      "添加自定义语言",
      {
        confirmButtonText: "添加",
        cancelButtonText: "取消",
        inputPlaceholder: "例如：Klingon",
        inputValidator: (input) => {
          const v = (input || "").trim();
          if (!v) return "请输入语言名称";
          if (v.length > 64) return "名称过长（≤64 字符）";
          if (props.customLanguages.includes(v)) return "该自定义语言已存在";
          return true;
        },
        lockScroll: false,
      }
    );
    const name = (value as string).trim();
    if (!name) return;
    emit("add-custom", name);
    // 添加完直接选中
    emit("update:modelValue", name as TranslatorLanguageCode);
    customMessage.success(`已添加自定义语言：${name}`);
  } catch {
    /* 用户取消 */
  }
}
</script>

<style scoped>
.add-custom-option {
  color: var(--primary-color);
  font-weight: 600;
}
</style>

<style>
.translator-language-select .el-select-group__title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-color-secondary);
}
</style>
