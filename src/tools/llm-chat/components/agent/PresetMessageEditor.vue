<template>
  <BaseDialog
    :visible="visible"
    @update:visible="$emit('update:visible', $event)"
    :title="isEditMode ? '编辑消息' : '添加消息'"
    width="800px"
    height="auto"
  >
    <template #content>
      <el-form :model="form" label-width="80px">
        <el-form-item label="角色">
          <el-radio-group v-model="form.role">
            <el-radio value="system">
              <el-icon style="margin-right: 4px"><ChatDotRound /></el-icon>
              System
            </el-radio>
            <el-radio value="user">
              <el-icon style="margin-right: 4px"><User /></el-icon>
              User
            </el-radio>
            <el-radio value="assistant">
              <el-icon style="margin-right: 4px"><Service /></el-icon>
              Assistant
            </el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="内容">
          <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <MacroSelector
                v-model:visible="macroSelectorVisible"
                @insert="handleInsertMacro"
              />
            </div>
            <el-input
              ref="contentInputRef"
              v-model="form.content"
              type="textarea"
              :rows="16"
              placeholder="请输入消息内容..."
            />
          </div>
        </el-form-item>
      </el-form>
    </template>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button type="primary" @click="handleSave">
        {{ isEditMode ? "保存" : "添加" }}
      </el-button>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import type { MessageRole } from "../../types";
import {
  ChatDotRound,
  User,
  Service,
} from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import type { MacroDefinition } from "../../macro-engine";
import MacroSelector from "./MacroSelector.vue";

interface MessageForm {
  role: MessageRole;
  content: string;
}

interface Props {
  visible: boolean;
  isEditMode: boolean;
  initialForm?: MessageForm;
}

interface Emits {
  (e: "update:visible", value: boolean): void;
  (e: "save", form: MessageForm): void;
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  isEditMode: false,
  initialForm: () => ({ role: "system", content: "" }),
});

const emit = defineEmits<Emits>();

// 表单数据
const form = ref<MessageForm>({
  role: "system",
  content: "",
});

// 宏选择器
const macroSelectorVisible = ref(false);
const contentInputRef = ref<any>(null);

// 监听 initialForm 的变化，更新本地表单
watch(
  () => props.initialForm,
  (newForm) => {
    if (newForm) {
      form.value = { ...newForm };
    }
  },
  { immediate: true, deep: true }
);

// 监听对话框打开，重置或设置表单
watch(
  () => props.visible,
  (newVisible) => {
    if (newVisible) {
      if (props.initialForm) {
        form.value = { ...props.initialForm };
      }
    }
  }
);

/**
 * 插入宏到光标位置
 */
function handleInsertMacro(macro: MacroDefinition) {
  // 获取 textarea 元素
  const textarea = contentInputRef.value?.$el?.querySelector("textarea");
  if (!textarea) return;

  // 获取当前光标位置
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;

  // 要插入的文本
  const insertText = macro.example || `{{${macro.name}}}`;

  // 拼接新内容
  const newContent =
    form.value.content.substring(0, start) +
    insertText +
    form.value.content.substring(end);

  // 更新内容
  form.value.content = newContent;

  // 设置新的光标位置
  setTimeout(() => {
    textarea.focus();
    const newCursorPos = start + insertText.length;
    textarea.setSelectionRange(newCursorPos, newCursorPos);
  }, 0);
}

/**
 * 保存消息
 */
function handleSave() {
  if (!form.value.content.trim()) {
    ElMessage.warning("消息内容不能为空");
    return;
  }

  emit("save", { ...form.value });
}
</script>

<style scoped>
</style>