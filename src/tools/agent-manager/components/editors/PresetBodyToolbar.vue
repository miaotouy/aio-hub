<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  MagicStick,
  CopyDocument,
  DocumentAdd,
  Document,
} from "@element-plus/icons-vue";
import { Book, Variable } from "lucide-vue-next";
import type { VariableConfig } from "@/tools/llm-chat/types/sessionVariable";
import type { MacroDefinition } from "@/tools/llm-chat/macro-engine";
import type RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import * as monaco from "@/utils/monaco";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { customMessage } from "@/utils/customMessage";
import MacroSelector from "../selectors/MacroSelector.vue";
import VariableSelector from "../selectors/VariableSelector.vue";
import RecallPlaceholderEditor from "./RecallPlaceholderEditor.vue";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    editor?: InstanceType<typeof RichCodeEditor> | null;
    variableConfig?: VariableConfig;
    allowRecall?: boolean;
  }>(),
  { allowRecall: true }
);
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const errorHandler = createModuleErrorHandler(
  "agent-manager/PresetBodyToolbar"
);
const macroSelectorVisible = ref(false);
const variableSelectorVisible = ref(false);
const kbEditorVisible = ref(false);
const currentKBSelection = ref("");
let active = true;
onBeforeUnmount(() => {
  active = false;
});

/**
 * 插入文本到编辑器光标处
 */
const insertTextToEditor = (text: string) => {
  if (!props.editor) {
    emit("update:modelValue", props.modelValue + text);
    return;
  }

  const editorView = props.editor.editorView;
  const monacoInstance = props.editor.monacoEditorInstance;

  if (editorView) {
    // CodeMirror 处理
    const state = editorView.state;
    const transaction = state.update({
      changes: {
        from: state.selection.main.from,
        to: state.selection.main.to,
        insert: text,
      },
      selection: { anchor: state.selection.main.from + text.length },
    });
    editorView.dispatch(transaction);
    editorView.focus();
  } else if (monacoInstance) {
    // Monaco 处理
    const selection = monacoInstance.getSelection();
    const position = monacoInstance.getPosition();
    const range =
      selection ||
      (position
        ? new monaco.Range(
            position.lineNumber,
            position.column,
            position.lineNumber,
            position.column
          )
        : null);

    if (range) {
      monacoInstance.executeEdits("", [
        {
          range,
          text: text,
          forceMoveMarkers: true,
        },
      ]);
      emit("update:modelValue", monacoInstance.getValue());
      monacoInstance.focus();
    }
  } else {
    // 降级处理：直接追加
    emit("update:modelValue", props.modelValue + text);
  }
};

/**
 * 插入知识库占位符
 */
function handleInsertKBPlaceholder(placeholder: string) {
  insertTextToEditor(placeholder);
  kbEditorVisible.value = false;
}

/**
 * 点击知识库按钮处理逻辑
 */
function handleKBButtonClick() {
  if (!props.editor) return;

  const editorView = props.editor.editorView;
  const monacoInstance = props.editor.monacoEditorInstance;
  let selectedText = "";

  if (editorView) {
    const { from, to } = editorView.state.selection.main;
    selectedText = editorView.state.sliceDoc(from, to);
  } else if (monacoInstance) {
    const selection = monacoInstance.getSelection();
    selectedText = selection
      ? monacoInstance.getModel()?.getValueInRange(selection) || ""
      : "";
  }

  const retrievalPlaceholder = /【recall(?:::[^【】]*)?】/;
  if (selectedText && retrievalPlaceholder.test(selectedText)) {
    currentKBSelection.value = selectedText;
  } else {
    currentKBSelection.value = "";
  }
}

/**
 * 插入宏到光标位置
 */
function handleInsertMacro(macro: MacroDefinition) {
  // 要插入的文本
  const insertText = macro.example || `{{${macro.name}}}`;

  insertTextToEditor(insertText);

  // 关闭弹窗
  macroSelectorVisible.value = false;
}

/**
 * 插入变量到光标位置
 */
function handleInsertVariable(variablePath: string) {
  insertTextToEditor(variablePath);
  // 关闭弹窗
  variableSelectorVisible.value = false;
}

async function handleCopy() {
  const result = await errorHandler.wrapAsync(
    async () => {
      await writeText(props.modelValue);
      return true;
    },
    { userMessage: "复制失败" }
  );
  if (result && active) customMessage.success("已复制源码");
}
async function handlePaste() {
  const text = await errorHandler.wrapAsync(() => readText(), {
    userMessage: "粘贴失败，请检查剪贴板权限",
  });
  if (text === null || !active) return;
  insertTextToEditor(text);
  customMessage.success("已粘贴");
}
async function handleOverwrite() {
  const text = await errorHandler.wrapAsync(() => readText(), {
    userMessage: "覆盖失败，请检查剪贴板权限",
  });
  if (text === null || !active) return;
  emit("update:modelValue", text);
  customMessage.success("已覆盖内容");
}
</script>

<template>
  <div class="preset-body-toolbar">
    <el-popover
      v-model:visible="macroSelectorVisible"
      placement="bottom-start"
      :width="400"
      trigger="click"
      popper-class="preset-editor-macro-popover"
    >
      <template #reference>
        <el-button
          size="small"
          :type="macroSelectorVisible ? 'primary' : 'default'"
          plain
        >
          <el-icon style="margin-right: 4px"><MagicStick /></el-icon>
          插入宏
        </el-button>
      </template>
      <MacroSelector @insert="handleInsertMacro" />
    </el-popover>

    <el-popover
      v-if="variableConfig?.enabled && variableConfig?.definitions?.length > 0"
      v-model:visible="variableSelectorVisible"
      placement="bottom-start"
      :width="400"
      trigger="click"
      popper-class="preset-editor-variable-popover"
    >
      <template #reference>
        <el-button
          size="small"
          :type="variableSelectorVisible ? 'primary' : 'default'"
          plain
        >
          <el-icon style="margin-right: 4px"><Variable :size="16" /></el-icon>
          插入变量
        </el-button>
      </template>
      <VariableSelector
        :variables="variableConfig?.definitions || []"
        @insert="handleInsertVariable"
      />
    </el-popover>

    <template v-if="allowRecall">
      <el-button
        size="small"
        :type="kbEditorVisible ? 'primary' : 'default'"
        plain
        @click="
          handleKBButtonClick();
          kbEditorVisible = true;
        "
      >
        <el-icon style="margin-right: 4px"><Book /></el-icon>
        插入检索
      </el-button>

      <BaseDialog
        :modelValue="kbEditorVisible"
        @update:modelValue="kbEditorVisible = $event"
        title="插入 Recall 检索占位符"
        width="480px"
        height="auto"
        :closeOnBackdropClick="true"
      >
        <template #content>
          <RecallPlaceholderEditor
            :value="currentKBSelection"
            @insert="handleInsertKBPlaceholder"
            @cancel="kbEditorVisible = false"
          />
        </template>
      </BaseDialog>
    </template>

    <el-button size="small" @click="handleCopy" plain title="复制内容">
      <el-icon style="margin-right: 4px"><CopyDocument /></el-icon>
      复制
    </el-button>

    <el-button size="small" @click="handlePaste" plain title="粘贴到光标处">
      <el-icon style="margin-right: 4px"><DocumentAdd /></el-icon>
      粘贴
    </el-button>

    <el-popconfirm
      title="确定要用剪贴板内容覆盖当前内容吗？"
      @confirm="handleOverwrite"
      width="220"
    >
      <template #reference>
        <el-button size="small" plain title="用剪贴板内容覆盖" type="warning">
          <el-icon style="margin-right: 4px"><Document /></el-icon>
          覆盖
        </el-button>
      </template>
    </el-popconfirm>

    <slot />
  </div>
</template>

<style scoped>
.preset-body-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.preset-body-toolbar > .el-button + .el-button {
  margin-left: 0;
}
</style>
<!-- 全局样式：预设消息编辑器专用 popover，独立于 MessageInputToolbar 的同名样式 -->
<style>
.preset-editor-macro-popover,
.preset-editor-variable-popover {
  max-height: min(600px, 60vh) !important;
  overflow: hidden !important;
}

.preset-editor-macro-popover .el-popover__body,
.preset-editor-variable-popover .el-popover__body {
  padding: 12px;
  max-height: calc(min(600px, 60vh) - 24px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.preset-editor-macro-popover .macro-selector,
.preset-editor-variable-popover .variable-selector {
  max-height: 100%;
  overflow: hidden;
}

.preset-editor-macro-popover .macro-selector-body,
.preset-editor-variable-popover .variable-selector-body {
  max-height: calc(min(600px, 60vh) - 100px);
  overflow-y: auto;
}
</style>
