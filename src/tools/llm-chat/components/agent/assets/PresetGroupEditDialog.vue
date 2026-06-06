<template>
  <BaseDialog
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    :title="group ? '编辑预设消息组' : '新建预设消息组'"
    width="440px"
    height="auto"
    :close-on-backdrop-click="false"
  >
    <template #content>
      <div class="group-edit-form">
        <div class="form-row">
          <span class="form-label">组名称 <span class="required">*</span></span>
          <el-input
            v-model="form.name"
            placeholder="如：说话风格、当前场景"
            @keyup.enter="handleSave"
          />
        </div>
        <div class="form-row">
          <span class="form-label">描述</span>
          <el-input
            v-model="form.description"
            placeholder="可选，描述此组的用途"
          />
        </div>
        <div class="form-row mode-row">
          <span class="form-label">选择模式</span>
          <div class="mode-cards">
            <div
              class="mode-card"
              :class="{ active: form.selectionMode === 'checkbox' }"
              @click="selectMode('checkbox')"
            >
              <div class="mode-card-header">
                <span class="mode-name">多选</span>
                <div class="mode-indicator"></div>
              </div>
              <span class="mode-hint">组内消息独立启用/禁用</span>
            </div>
            <div
              class="mode-card"
              :class="{ active: form.selectionMode === 'radio' }"
              @click="selectMode('radio')"
            >
              <div class="mode-card-header">
                <span class="mode-name">单选</span>
                <div class="mode-indicator"></div>
              </div>
              <span class="mode-hint">同时只能启用一条消息</span>
            </div>
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button type="primary" @click="handleSave">
        {{ group ? "保存" : "创建" }}
      </el-button>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import type { PresetMessageGroup } from "../../../types/agent";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { customMessage } from "@/utils/customMessage";

interface Props {
  visible: boolean;
  group?: PresetMessageGroup | null;
}

interface Emits {
  (e: "update:visible", value: boolean): void;
  (e: "save", group: Omit<PresetMessageGroup, "id"> & { id?: string }): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const form = ref({
  name: "",
  description: "",
  selectionMode: "checkbox" as "checkbox" | "radio",
  enabled: true,
});

watch(
  () => [props.visible, props.group] as const,
  () => {
    if (props.visible) {
      form.value = {
        name: props.group?.name ?? "",
        description: props.group?.description ?? "",
        selectionMode: props.group?.selectionMode ?? "checkbox",
        enabled: props.group?.enabled ?? true,
      };
    }
  },
  { immediate: true }
);

function selectMode(mode: "checkbox" | "radio") {
  form.value.selectionMode = mode;
}

function handleSave() {
  if (!form.value.name.trim()) {
    customMessage.warning("组名称不能为空");
    return;
  }
  emit("save", {
    id: props.group?.id,
    name: form.value.name.trim(),
    description: form.value.description.trim() || undefined,
    selectionMode: form.value.selectionMode,
    enabled: form.value.enabled,
  });
  emit("update:visible", false);
}
</script>

<style scoped>
.group-edit-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px 0;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.form-label {
  width: 72px;
  flex-shrink: 0;
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.required {
  color: var(--el-color-danger);
}

.mode-row {
  align-items: flex-start;
}

.mode-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
}

.mode-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background-color: var(--input-bg);
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.mode-card:hover {
  border-color: var(--el-color-primary-light-5);
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.02)
  );
}

.mode-card.active {
  border-color: var(--el-color-primary);
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.05)
  );
}

.mode-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.mode-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.mode-card.active .mode-name {
  color: var(--el-color-primary);
}

.mode-indicator {
  width: 14px;
  height: 14px;
  border: 1.5px solid var(--el-text-color-placeholder);
  border-radius: 50%;
  position: relative;
  transition: all 0.2s ease;
}

.mode-card:hover .mode-indicator {
  border-color: var(--el-color-primary-light-3);
}

.mode-card.active .mode-indicator {
  border-color: var(--el-color-primary);
  background-color: var(--el-color-primary);
}

.mode-card.active .mode-indicator::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 5px;
  height: 5px;
  background-color: #fff;
  border-radius: 50%;
}

.mode-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}
</style>
