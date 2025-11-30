<template>
  <BaseDialog
    :modelValue="visible"
    @update:modelValue="$emit('update:visible', $event)"
    :title="isEditMode ? '编辑消息' : '添加消息'"
    width="70vw"
    height="85vh"
    :closeOnBackdropClick="false"
  >
    <template #content>
      <div class="preset-message-editor">
        <!-- 第一行：角色选择 -->
        <div class="editor-row header-row">
          <span class="field-label">角色</span>
          <div class="role-selector">
            <el-radio-group v-model="form.role">
              <el-radio value="system">
                <span class="role-option">
                  <el-icon><ChatDotRound /></el-icon>
                  <span>System</span>
                </span>
              </el-radio>
              <el-radio value="user">
                <span class="role-option">
                  <el-icon><User /></el-icon>
                  <span>User</span>
                </span>
              </el-radio>
              <el-radio value="assistant">
                <span class="role-option">
                  <el-icon><Bot /></el-icon>
                  <span>Assistant</span>
                </span>
              </el-radio>
            </el-radio-group>
          </div>

          <div class="view-mode-switch">
            <el-radio-group v-model="viewMode" size="small">
              <el-radio-button value="edit">编辑</el-radio-button>
              <el-radio-button value="preview">预览</el-radio-button>
            </el-radio-group>
          </div>
        </div>

        <!-- 第二行：内容标签 + 工具栏 -->
        <div class="editor-row toolbar-row">
          <span class="field-label">内容</span>

          <div class="editor-toolbar" v-if="viewMode === 'edit'">
            <el-popover
              v-model:visible="macroSelectorVisible"
              placement="bottom-start"
              :width="400"
              trigger="click"
              popper-class="macro-selector-popover"
            >
              <template #reference>
                <el-button size="small" :type="macroSelectorVisible ? 'primary' : 'default'" plain>
                  <el-icon style="margin-right: 4px"><MagicStick /></el-icon>
                  插入宏
                </el-button>
              </template>
              <MacroSelector @insert="handleInsertMacro" />
            </el-popover>

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
          </div>
          <div v-else class="preview-hint">
            <span class="hint-text">Markdown 预览效果</span>
          </div>
        </div>

        <!-- 第三行：编辑器/预览区域 (自适应高度) -->
        <div class="editor-content-area">
          <!-- 编辑器 -->
          <div v-show="viewMode === 'edit'" class="editor-wrapper">
            <RichCodeEditor
              ref="richEditorRef"
              v-model="form.content"
              language="markdown"
              :line-numbers="true"
              editor-type="codemirror"
            />
          </div>

          <!-- 预览 -->
          <div v-if="viewMode === 'preview'" class="preview-wrapper">
            <div class="preview-content">
              <RichTextRenderer
                :content="previewContent || form.content || '(空)'"
                :version="settings.uiPreferences.rendererVersion"
                :default-render-html="settings.uiPreferences.defaultRenderHtml"
              />
            </div>
          </div>
        </div>
      </div>
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
import type { MessageRole, UserProfile } from "../../types";
import {
  ChatDotRound,
  User,
  MagicStick,
  CopyDocument,
  DocumentAdd,
  Document,
} from "@element-plus/icons-vue";
import { Bot } from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { MacroDefinition } from "../../macro-engine";
import MacroSelector from "./MacroSelector.vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import RichTextRenderer from "@/tools/rich-text-renderer/RichTextRenderer.vue";
import { useChatSettings } from "../../composables/useChatSettings";
import * as monaco from "monaco-editor";
import { MacroProcessor, createMacroContext } from "../../macro-engine";

interface MessageForm {
  role: MessageRole;
  content: string;
}

interface Props {
  visible: boolean;
  isEditMode: boolean;
  initialForm?: MessageForm;
  agentName?: string;
  userProfile?: UserProfile | null;
}

interface Emits {
  (e: "update:visible", value: boolean): void;
  (e: "save", form: MessageForm): void;
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  isEditMode: false,
  initialForm: () => ({ role: "system", content: "" }),
  agentName: "Assistant",
  userProfile: null,
});

const emit = defineEmits<Emits>();

const errorHandler = createModuleErrorHandler("llm-chat/PresetMessageEditor");
const { settings } = useChatSettings();

// 表单数据
const form = ref<MessageForm>({
  role: "system",
  content: "",
});

// 视图模式：编辑/预览
const viewMode = ref<"edit" | "preview">("edit");

// 预览内容
const previewContent = ref("");

// 宏选择器
const macroSelectorVisible = ref(false);
const richEditorRef = ref<InstanceType<typeof RichCodeEditor> | null>(null);

// 处理宏预览
const processPreviewMacros = async () => {
  if (!form.value.content) {
    previewContent.value = "";
    return;
  }

  // 创建基础上下文（不包含会话信息，仅支持基础宏）
  const context = createMacroContext({
    userName: props.userProfile?.name || "User",
    charName: props.agentName || "Assistant",
    userProfile: props.userProfile || undefined,
  });

  try {
    const processor = new MacroProcessor();
    // 仅处理不需要复杂上下文的宏
    const result = await processor.process(form.value.content, context);
    previewContent.value = result.output;
  } catch (error) {
    // 如果处理失败，降级显示原始内容
    previewContent.value = form.value.content;
  }
};

// 监听视图模式变化，进入预览模式时处理宏
watch(viewMode, (newMode) => {
  if (newMode === "preview") {
    processPreviewMacros();
  }
});

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
      viewMode.value = "edit"; // 默认进入编辑模式
      if (props.initialForm) {
        form.value = { ...props.initialForm };
      }
    }
  }
);

/**
 * 插入文本到编辑器光标处
 */
const insertTextToEditor = (text: string) => {
  if (!richEditorRef.value) return;

  const editorView = richEditorRef.value.editorView;
  const monacoInstance = richEditorRef.value.monacoEditorInstance;

  if (editorView) {
    // CodeMirror 处理
    const state = editorView.state;
    const transaction = state.update({
      changes: { from: state.selection.main.head, insert: text },
      selection: { anchor: state.selection.main.head + text.length },
    });
    editorView.dispatch(transaction);
    editorView.focus();
  } else if (monacoInstance) {
    // Monaco 处理
    const position = monacoInstance.getPosition();
    if (position) {
      monacoInstance.executeEdits("", [
        {
          range: new monaco.Range(
            position.lineNumber,
            position.column,
            position.lineNumber,
            position.column
          ),
          text: text,
          forceMoveMarkers: true,
        },
      ]);
      monacoInstance.focus();
    }
  } else {
    // 降级处理：直接追加
    form.value.content += text;
  }
};

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
 * 复制内容
 */
async function handleCopy() {
  const result = await errorHandler.wrapAsync(
    async () => {
      await navigator.clipboard.writeText(form.value.content);
      return true;
    },
    { userMessage: "复制失败" }
  );

  if (result) {
    customMessage.success("已复制到剪贴板");
  }
}

/**
 * 粘贴内容
 */
async function handlePaste() {
  const text = await errorHandler.wrapAsync(
    async () => {
      return await navigator.clipboard.readText();
    },
    { userMessage: "粘贴失败，请检查剪贴板权限" }
  );

  if (!text) return;

  insertTextToEditor(text);
  customMessage.success("已粘贴");
}

/**
 * 覆盖内容
 */
async function handleOverwrite() {
  const text = await errorHandler.wrapAsync(
    async () => {
      return await navigator.clipboard.readText();
    },
    { userMessage: "覆盖失败，请检查剪贴板权限" }
  );

  if (!text) return;

  form.value.content = text;
  customMessage.success("已覆盖内容");
}

/**
 * 保存消息
 */
function handleSave() {
  if (!form.value.content.trim()) {
    customMessage.warning("消息内容不能为空");
    return;
  }

  emit("save", { ...form.value });
}
</script>

<style scoped>
.preset-message-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 16px;
}

.editor-row {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.field-label {
  width: 60px;
  font-weight: 500;
  color: var(--el-text-color-regular);
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.role-selector {
  flex: 1;
  display: flex;
  align-items: center;
}

.role-option {
  display: flex;
  align-items: center;
  gap: 4px;
}

.view-mode-switch {
  margin-left: 16px;
}

.toolbar-row {
  /* 让工具栏和标签垂直居中 */
  min-height: 24px;
}

.editor-toolbar {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.preview-hint {
  flex: 1;
  display: flex;
  align-items: center;
}

.hint-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.editor-content-area {
  flex: 1;
  min-height: 0; /* 关键：允许 flex 子项收缩以触发内部滚动 */
  display: flex;
  flex-direction: column;
}

.editor-wrapper {
  flex: 1;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.preview-wrapper {
  flex: 1;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background-color: var(--card-bg);
  padding: 16px;
  overflow-y: auto;
}

.preview-content {
  line-height: 1.6;
}
</style>
