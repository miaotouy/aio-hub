<template>
  <BaseDialog
    :modelValue="visible"
    @update:modelValue="$emit('update:visible', $event)"
    :title="
      isGreetingMode
        ? isEditMode
          ? '编辑开局消息'
          : '添加开局消息'
        : isEditMode
          ? '编辑消息'
          : '添加消息'
    "
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
              <el-radio v-if="!isGreetingMode" value="system">
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
              <el-radio-button value="text">文本预览</el-radio-button>
              <el-radio-button value="preview">渲染预览</el-radio-button>
            </el-radio-group>
          </div>
        </div>

        <!-- 名称输入行 -->
        <div class="editor-row name-row">
          <span class="field-label">名称</span>
          <div class="name-input">
            <el-input
              v-model="form.name"
              placeholder="可选，用于标识此预设消息"
              size="small"
              style="flex: 1; max-width: 400px"
            />
          </div>
        </div>

        <!-- 所属预设组（非 greeting 模式且有可用组时显示） -->
        <div v-if="!isGreetingMode && presetGroups?.length" class="editor-row">
          <span class="field-label">所属组</span>
          <el-select
            v-model="form.groupId"
            placeholder="独立消息（不归属任何组）"
            clearable
            size="small"
            style="width: 240px"
          >
            <el-option
              v-for="g in presetGroups"
              :key="g.id"
              :label="g.name"
              :value="g.id"
            />
          </el-select>
        </div>

        <!-- 模型匹配配置行 (greeting 模式隐藏) -->
        <ModelMatchConfig v-if="!isGreetingMode" v-model="modelMatchValue" />
        <!-- 注入策略配置行 (greeting 模式隐藏) -->
        <InjectionConfig
          v-if="!isGreetingMode"
          v-model="injectionStrategyValue"
        />

        <!-- 附件区域（非 greeting 模式且 Agent 有资产时显示） -->
        <PresetAttachmentPicker
          v-if="!isGreetingMode && availableAssets.length > 0"
          ref="attachmentPickerRef"
          v-model="form.presetAttachments"
          :available-assets="availableAssets"
          :agent-id="currentAgent?.id"
        />

        <!-- 第二行：内容标签 + 工具栏 -->
        <div class="editor-row toolbar-row">
          <span class="field-label">内容</span>

          <div class="editor-toolbar" v-if="viewMode === 'edit'">
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
              v-if="
                agent?.variableConfig?.enabled &&
                agent?.variableConfig?.definitions?.length > 0
              "
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
                  <el-icon style="margin-right: 4px"
                    ><Variable :size="16"
                  /></el-icon>
                  插入变量
                </el-button>
              </template>
              <VariableSelector
                :variables="agent?.variableConfig?.definitions || []"
                @insert="handleInsertVariable"
              />
            </el-popover>

            <template v-if="!isGreetingMode">
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
                插入知识库
              </el-button>

              <BaseDialog
                :modelValue="kbEditorVisible"
                @update:modelValue="kbEditorVisible = $event"
                title="插入知识库占位符"
                width="480px"
                height="auto"
                :closeOnBackdropClick="true"
              >
                <template #content>
                  <KBPlaceholderEditor
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

            <el-button
              size="small"
              @click="handlePaste"
              plain
              title="粘贴到光标处"
            >
              <el-icon style="margin-right: 4px"><DocumentAdd /></el-icon>
              粘贴
            </el-button>

            <el-popconfirm
              title="确定要用剪贴板内容覆盖当前内容吗？"
              @confirm="handleOverwrite"
              width="220"
            >
              <template #reference>
                <el-button
                  size="small"
                  plain
                  title="用剪贴板内容覆盖"
                  type="warning"
                >
                  <el-icon style="margin-right: 4px"><Document /></el-icon>
                  覆盖
                </el-button>
              </template>
            </el-popconfirm>
          </div>
          <div v-else-if="viewMode === 'text'" class="preview-hint">
            <el-button
              size="small"
              @click="handleCopy"
              plain
              style="margin-left: 12px"
            >
              <el-icon style="margin-right: 4px"><CopyDocument /></el-icon>
              复制预览
            </el-button>
            <span class="hint-text">宏处理后的纯文本</span>
          </div>
          <div v-else class="preview-hint">
            <span class="hint-text">Markdown 渲染预览</span>
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
              :completion-source="macroCompletionSource"
            />
          </div>

          <!-- 文本预览 -->
          <div
            v-if="viewMode === 'text'"
            class="preview-wrapper text-preview-wrapper"
          >
            <pre class="text-preview-content">{{
              previewContent || form.content || "(空)"
            }}</pre>
          </div>

          <!-- 渲染预览 -->
          <div v-if="viewMode === 'preview'" class="preview-wrapper">
            <div class="preview-content">
              <RichTextRenderer
                :content="previewContent || form.content || '(空)'"
                :version="settings.uiPreferences.rendererVersion"
                :default-render-html="settings.uiPreferences.defaultRenderHtml"
                :llm-think-rules="llmThinkRules"
                :style-options="richTextStyleOptions"
                :resolve-asset="resolveAsset"
                :code-editor-engine="settings.uiPreferences.codeEditorEngine"
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
import { ref, watch, computed, onMounted, provide } from "vue";
import type {
  MessageRole,
  UserProfile,
  InjectionStrategy,
  PresetAttachmentRef,
} from "../../../types";
import type { PresetMessageGroup, AgentAsset } from "../../../types/agent";
import {
  ChatDotRound,
  User,
  MagicStick,
  CopyDocument,
  DocumentAdd,
  Document,
} from "@element-plus/icons-vue";
import { Bot, Book, Variable } from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import MacroSelector from "../selectors/MacroSelector.vue";
import VariableSelector from "../selectors/VariableSelector.vue";
import KBPlaceholderEditor from "./KBPlaceholderEditor.vue";
import ModelMatchConfig from "./ModelMatchConfig.vue";
import InjectionConfig from "./InjectionConfig.vue";
import PresetAttachmentPicker from "./PresetAttachmentPicker.vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import RichTextRenderer from "@/tools/rich-text-renderer/RichTextRenderer.vue";
import type {
  LlmThinkRule,
  RichTextRendererStyleOptions,
} from "@/tools/rich-text-renderer/types";
import { useChatSettings } from "../../../composables/settings/useChatSettings";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useLlmChatStore } from "../../../stores/llmChatStore";
import { useKnowledgeBaseStore } from "@/tools/knowledge-base/stores/knowledgeBaseStore";
import * as monaco from "monaco-editor";
import {
  MacroProcessor,
  createMacroContext,
  MacroRegistry,
  initializeMacroEngine,
  type MacroDefinition,
  type MacroContext,
  extractContextFromSession,
} from "../../../macro-engine";
import type {
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";
import {
  processMessageAssetsSync,
  resolveAgentAssetUrlSync,
} from "../../../utils/agentAssetUtils";

interface MessageForm {
  role: MessageRole;
  name?: string;
  content: string;
  groupId?: string;
  injectionStrategy?: InjectionStrategy;
  presetAttachments?: PresetAttachmentRef[];
  modelMatch?: {
    enabled: boolean;
    mode?: "any" | "all";
    exclude?: boolean;
    patterns: string[];
    profilePatterns?: string[];
    matchProfileName?: boolean;
  };
}

/** 编辑器模式，控制显示哪些配置区域 */
export type PresetEditorMode = "preset" | "greeting";

interface Props {
  visible: boolean;
  isEditMode: boolean;
  initialForm?: MessageForm;
  agentName?: string;
  userProfile?: UserProfile | null;
  agent?: any;
  llmThinkRules?: LlmThinkRule[];
  richTextStyleOptions?: RichTextRendererStyleOptions;
  /**
   * 编辑器模式
   * - 'preset': 完整模式，显示所有配置（角色、名称、过滤、注入、内容）
   * - 'greeting': 精简模式，仅显示角色、名称、内容编辑区域
   */
  editorMode?: PresetEditorMode;
  presetGroups?: PresetMessageGroup[];
}

interface Emits {
  (e: "update:visible", value: boolean): void;
  (e: "save", form: MessageForm): void;
}
const props = withDefaults(defineProps<Props>(), {
  visible: false,
  isEditMode: false,
  initialForm: () => ({ role: "system", name: "", content: "" }),
  agentName: "Assistant",
  userProfile: null,
  llmThinkRules: () => [],
  richTextStyleOptions: () => ({}),
  editorMode: "preset",
  presetGroups: () => [],
});

/** 是否为精简模式（greeting 模式隐藏过滤和注入策略） */
const isGreetingMode = computed(() => props.editorMode === "greeting");

const emit = defineEmits<Emits>();

const errorHandler = createModuleErrorHandler("llm-chat/PresetMessageEditor");
const { settings } = useChatSettings();
const { getProfileById } = useLlmProfiles();
const chatStore = useLlmChatStore();
const kbStore = useKnowledgeBaseStore();

// 表单数据
const form = ref<MessageForm>({
  role: "system",
  name: "",
  content: "",
  presetAttachments: [],
});

// 附件选择器 ref
const attachmentPickerRef = ref<InstanceType<
  typeof PresetAttachmentPicker
> | null>(null);

/** Agent 可用资产列表 */
const availableAssets = computed<AgentAsset[]>(() => {
  return props.agent?.assets || [];
});

// 模型匹配和注入策略（由子组件管理内部 UI 状态）
const modelMatchValue = ref<MessageForm["modelMatch"]>(undefined);
const injectionStrategyValue = ref<InjectionStrategy | undefined>(undefined);

// 视图模式：编辑/文本预览/渲染预览
const viewMode = ref<"edit" | "text" | "preview">("edit");

// 预览内容
const previewContent = ref("");

// 宏选择器和变量选择器
const macroSelectorVisible = ref(false);
const variableSelectorVisible = ref(false);
const kbEditorVisible = ref(false);
const currentKBSelection = ref("");
const richEditorRef = ref<InstanceType<typeof RichCodeEditor> | null>(null);

// 模拟当前 Agent 对象，用于资产解析
const currentAgent = computed(() => {
  if (!props.agent) return undefined;

  // 确保有 ID，用于构建路径
  let agentId = props.agent?.id || props.agent?.agentId;
  if (!agentId && props.agentName) {
    agentId = props.agentName;
  }
  if (!agentId) {
    agentId = "temp_agent";
  }

  return {
    ...props.agent,
    id: agentId,
  };
});

// 提供当前 Agent 给预览中的 RichTextRenderer 及其子节点
provide("currentAgent", currentAgent);

// 资产转换钩子
const resolveAsset = (content: string) => {
  if (!content) return content;

  // 如果输入看起来就是一个纯粹的 agent-asset:// 链接（常见于 AST 模式下的节点属性）
  if (content.startsWith("agent-asset://") && !content.includes(" ")) {
    return resolveAgentAssetUrlSync(content, currentAgent.value as any);
  }

  // 否则作为全文处理
  return processMessageAssetsSync(content, currentAgent.value as any);
};

// 确保宏引擎已初始化
onMounted(() => {
  const registry = MacroRegistry.getInstance();
  const macros = registry.getAllMacros();
  if (macros.length === 0) {
    initializeMacroEngine();
  }
});

/**
 * 宏自动补全源
 * 当用户输入 { { 时触发宏候选   //} }vscode双花括号高亮显示防溢出补丁
 */
const macroCompletionSource = (
  context: CompletionContext
): CompletionResult | null => {
  // 获取光标前的文本
  const line = context.state.doc.lineAt(context.pos);
  const textBefore = line.text.slice(0, context.pos - line.from);

  // 检查是否在 { { 之后   //} }vscode双花括号高亮显示防溢出补丁
  const macroMatch = textBefore.match(/\{\{([a-zA-Z0-9_:]*)$/);
  const kbMatch = textBefore.match(/【kb(?:::)?([a-zA-Z0-9_:]*)$/);

  if (!macroMatch && !kbMatch) {
    return null;
  }

  // 1. 处理知识库补全
  if (kbMatch) {
    const prefix = kbMatch[1].toLowerCase();
    const startPos = context.pos - kbMatch[1].length;

    // 如果还没有加载知识库，尝试初始化
    if (kbStore.bases.length === 0) {
      kbStore.init();
    }

    const matchedBases = kbStore.bases.filter((b) =>
      b.name.toLowerCase().includes(prefix)
    );

    if (matchedBases.length === 0) return null;

    return {
      from: startPos,
      options: matchedBases.map((base) => ({
        label: base.name,
        detail: "知识库",
        apply: (kbMatch[0].includes("::") ? "" : "::") + base.name + "】",
        type: "keyword",
      })),
      filter: false,
    };
  }

  // 2. 处理宏补全
  const prefix = macroMatch![1].toLowerCase();
  const startPos = context.pos - macroMatch![1].length;

  // 获取所有支持的宏
  const registry = MacroRegistry.getInstance();
  const allMacros = registry
    .getAllMacros()
    .filter((m) => m.supported !== false);

  // 过滤匹配的宏
  const matchedMacros = allMacros.filter(
    (macro) =>
      macro.name.toLowerCase().includes(prefix) ||
      macro.description.toLowerCase().includes(prefix)
  );

  if (matchedMacros.length === 0) {
    return null;
  }

  // 智能排序：优先按 priority 降序，然后按类型，最后按名称
  const typeOrder: Record<string, number> = {
    value: 0,
    variable: 1,
    function: 2,
  };
  matchedMacros.sort((a, b) => {
    // 1. 优先级高的在前 (priority 越大越靠前)
    const priorityA = a.priority ?? 0;
    const priorityB = b.priority ?? 0;
    if (priorityA !== priorityB) return priorityB - priorityA;

    // 2. 按类型排序
    const orderA = typeOrder[a.type] ?? 99;
    const orderB = typeOrder[b.type] ?? 99;
    if (orderA !== orderB) return orderA - orderB;

    // 3. 按名称字母顺序排序
    return a.name.localeCompare(b.name);
  });

  return {
    from: startPos,
    options: matchedMacros.map((macro) => ({
      label: macro.name,
      detail: getTypeLabel(macro.type),
      info: macro.description,
      apply: (macro.example || macro.name) + "}}",
      type: "variable",
    })),
    filter: false, // 禁用 CodeMirror 的过滤和排序，完全采用我提供的数据
  };
};

/**
 * 获取宏类型的显示标签
 */
function getTypeLabel(type: string): string {
  switch (type) {
    case "value":
      return "值替换";
    case "variable":
      return "变量操作";
    case "function":
      return "动态函数";
    default:
      return type;
  }
}

// 处理宏预览
const processPreviewMacros = async () => {
  if (!form.value.content) {
    previewContent.value = "";
    return;
  }

  // 准备模型元数据
  let modelInfo: { id: string; name: string; provider: string } | undefined;
  let profileInfo: { id: string; name: string; type: string } | undefined;

  if (props.agent?.profileId) {
    const profile = getProfileById(props.agent.profileId);
    if (profile) {
      profileInfo = {
        id: profile.id,
        name: profile.name,
        type: profile.type,
      };

      if (props.agent.modelId) {
        const model = profile.models.find((m) => m.id === props.agent.modelId);
        if (model) {
          modelInfo = {
            id: model.id,
            name: model.name || model.id,
            provider: profile.type,
          };
        }
      }
    }
  }

  // 1. 创建基础上下文（包含用户、角色、模型等静态信息）
  const baseContext = createMacroContext({
    userName: props.userProfile?.name || "User",
    charName: props.agentName || "Assistant",
    userProfile: props.userProfile || undefined,
    agent: props.agent,
    modelId: modelInfo?.id,
    modelName: modelInfo?.name,
    profileId: profileInfo?.id,
    profileName: profileInfo?.name,
    providerType: profileInfo?.type,
  });

  // 2. 从 store 获取当前活跃会话，提取会话相关的动态上下文（如 last_message）
  let sessionContext: Partial<MacroContext> = {};
  if (chatStore.currentFullSession) {
    sessionContext = extractContextFromSession(
      chatStore.currentFullSession.index,
      chatStore.currentFullSession.detail,
      props.agent,
      props.userProfile || undefined
    );
  }

  // 3. 合并上下文
  const context = {
    ...baseContext,
    ...sessionContext,
  };

  try {
    const processor = new MacroProcessor();
    // 仅处理不需要复杂上下文的宏
    const result = await processor.process(form.value.content, context);

    // 处理资产预览，确保传入有效的 agent 对象以避免路径中出现 undefined
    // 优先级：props.agent.id > props.agent.agentId > props.agentName (作为 fallback ID)
    let agentId = props.agent?.id || props.agent?.agentId;
    if (!agentId && props.agentName) {
      agentId = props.agentName;
    }

    // 最后的 fallback，如果连名称都没有，使用 'temp_agent'
    if (!agentId) {
      agentId = "temp_agent";
    }

    // 不再提前处理资产链接，交给 RichTextRenderer 内部处理
    previewContent.value = result.output;
  } catch (error) {
    // 如果处理失败，降级显示原始内容
    previewContent.value = form.value.content;
  }
};

// 监听视图模式变化，进入预览模式时处理宏
watch(viewMode, (newMode) => {
  if (newMode === "preview" || newMode === "text") {
    processPreviewMacros();
  }
});

// 监听 initialForm 的变化，更新本地表单
watch(
  () => props.initialForm,
  (newForm) => {
    if (newForm) {
      form.value = {
        ...newForm,
        presetAttachments: newForm.presetAttachments
          ? [...newForm.presetAttachments]
          : [],
      };
      injectionStrategyValue.value = newForm.injectionStrategy;
      modelMatchValue.value = newForm.modelMatch;
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
      previewContent.value = ""; // 重置预览缓存，避免显示上次的旧内容
      attachmentPickerRef.value?.resetSearch(); // 重置附件搜索
      if (props.initialForm) {
        form.value = {
          ...props.initialForm,
          presetAttachments: props.initialForm.presetAttachments
            ? [...props.initialForm.presetAttachments]
            : [],
        };
        injectionStrategyValue.value = props.initialForm.injectionStrategy;
        modelMatchValue.value = props.initialForm.modelMatch;
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
  if (!richEditorRef.value) return;

  const editorView = richEditorRef.value.editorView;
  const monacoInstance = richEditorRef.value.monacoEditorInstance;
  let selectedText = "";

  if (editorView) {
    const { from, to } = editorView.state.selection.main;
    selectedText = editorView.state.sliceDoc(from, to);
  } else if (monacoInstance) {
    selectedText =
      monacoInstance
        .getModel()
        ?.getValueInRange(monacoInstance.getSelection()!) || "";
  }

  // 检查是否匹配 KB 正则
  const KB_PLACEHOLDER_REGEX = /【(?:kb|knowledge)(?:::([^【】]*?))?】/;
  if (selectedText && KB_PLACEHOLDER_REGEX.test(selectedText)) {
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

/**
 * 复制内容
 */
async function handleCopy() {
  const contentToCopy =
    viewMode.value === "edit"
      ? form.value.content
      : previewContent.value || form.value.content || "";

  const result = await errorHandler.wrapAsync(
    async () => {
      await navigator.clipboard.writeText(contentToCopy);
      return true;
    },
    { userMessage: "复制失败" }
  );

  if (result) {
    customMessage.success(
      viewMode.value === "edit" ? "已复制源码" : "已复制预览文本"
    );
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

  const attachments = form.value.presetAttachments?.length
    ? form.value.presetAttachments
    : undefined;
  emit("save", {
    ...form.value,
    presetAttachments: attachments,
    injectionStrategy: injectionStrategyValue.value,
    modelMatch: modelMatchValue.value,
  });
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

.name-row {
  /* 名称行与角色行对齐 */
  min-height: 32px;
}

.name-input {
  flex: 1;
  display: flex;
  align-items: center;
  max-width: 400px;
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
  padding-left: 8px;
  font-size: 14px;
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
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.preview-wrapper {
  flex: 1;
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  background-color: var(--card-bg);
  padding: 16px;
  overflow-y: auto;
}

.preview-content {
  line-height: 1.6;
}

.text-preview-content {
  background-color: transparent;
  border: none;
  margin: 0;
  font-family: var(--el-font-family);
  font-size: 14px;
  line-height: 1.7;
  color: var(--el-text-color-primary);
  white-space: pre-wrap;
  word-break: break-word;
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
