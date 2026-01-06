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

        <!-- 模型匹配配置行 -->
        <div class="editor-row model-match-row">
          <span class="field-label">过滤</span>
          <div class="model-match-config">
            <div class="match-switches">
              <el-switch v-model="modelMatchEnabled" size="small" active-text="启用匹配过滤" />
              <template v-if="modelMatchEnabled">
                <el-divider direction="vertical" />
                <el-checkbox v-model="matchProfileName" size="small">同时匹配渠道名</el-checkbox>

                <el-tooltip placement="top">
                  <template #content>
                    <div style="max-width: 300px">
                      <p>输入匹配规则，支持正则表达式。</p>
                      <p>每行一个规则，满足任意一个即生效。</p>
                      <p><strong>匹配范围：</strong></p>
                      <ul style="padding-left: 16px; margin: 4px 0; line-height: 1.6">
                        <li>模型 ID (如 gpt-4o)</li>
                        <li>模型显示名称 (如 GPT-4o)</li>
                        <li v-if="matchProfileName">渠道名称 (如 我的本地 Ollama)</li>
                      </ul>
                    </div>
                  </template>
                  <el-icon class="info-icon" style="margin-left: 4px"><InfoFilled /></el-icon>
                </el-tooltip>
              </template>
            </div>

            <!-- 匹配规则输入框 (换行显示) -->
            <div v-if="modelMatchEnabled" class="model-match-patterns-area">
              <el-input
                v-model="modelMatchPatternsText"
                type="textarea"
                :rows="2"
                placeholder="每行一个匹配规则（支持正则）"
                style="width: 100%; max-width: 600px"
              />
            </div>
          </div>
        </div>

        <!-- 注入策略配置行 -->
        <div class="editor-row injection-row">
          <span class="field-label">注入</span>
          <div class="injection-config">
            <!-- 模式选择 -->
            <el-radio-group v-model="injectionMode" size="small">
              <el-radio-button value="default">
                <el-tooltip content="按预设列表顺序排列" placement="top">
                  <span>跟随列表</span>
                </el-tooltip>
              </el-radio-button>
              <el-radio-button value="depth">
                <el-tooltip content="插入到会话历史的特定深度" placement="top">
                  <span>📍 深度</span>
                </el-tooltip>
              </el-radio-button>
              <el-radio-button value="advanced_depth">
                <el-tooltip content="高级深度注入 (循环/条件)" placement="top">
                  <span>🔩 高级</span>
                </el-tooltip>
              </el-radio-button>
              <el-radio-button value="anchor">
                <el-tooltip content="吸附到特定锚点位置" placement="top">
                  <span>⚓ 锚点</span>
                </el-tooltip>
              </el-radio-button>
            </el-radio-group>

            <!-- 深度参数 -->
            <div v-if="injectionMode === 'depth'" class="injection-params">
              <el-input-number
                v-model="depthValue"
                :min="0"
                :max="99"
                size="small"
                controls-position="right"
              />
              <span class="param-hint">0 = 紧跟最新消息</span>
            </div>

            <!-- 高级深度参数 -->
            <div v-if="injectionMode === 'advanced_depth'" class="injection-params">
              <el-input
                v-model="depthConfigValue"
                placeholder="如 3, 10~5"
                size="small"
                style="width: 160px"
              />
              <el-tooltip placement="top">
                <template #content>
                  <div style="max-width: 280px; line-height: 1.5">
                    <p style="margin: 0 0 8px 0"><strong>混合深度语法</strong></p>
                    <ul style="padding-left: 16px; margin: 0">
                      <li><strong>5</strong> → 仅在深度 5 注入</li>
                      <li><strong>3, 10, 15</strong> → 在多个深度各注入一次</li>
                      <li><strong>10~5</strong> → 从深度 10 开始，每 5 条注入</li>
                      <li>
                        <strong>3, 10~5</strong> → 混合：深度 3 一次 + 从 10 起每 5 条注入一次
                      </li>
                    </ul>
                    <p style="margin: 8px 0 0 0; font-size: 12px; color: #909399">
                      注意：历史消息数不足时，对应深度点会被跳过
                    </p>
                  </div>
                </template>
                <el-icon class="info-icon"><InfoFilled /></el-icon>
              </el-tooltip>
            </div>

            <!-- 锚点参数 -->
            <div v-if="injectionMode === 'anchor'" class="injection-params">
              <el-select v-model="anchorTarget" size="small" style="width: 120px">
                <el-option
                  v-for="anchor in availableAnchors"
                  :key="anchor.id"
                  :label="anchor.name"
                  :value="anchor.id"
                />
              </el-select>
              <el-radio-group v-model="anchorPosition" size="small">
                <el-radio-button value="before">之前</el-radio-button>
                <el-radio-button value="after">之后</el-radio-button>
              </el-radio-group>
            </div>

            <!-- 优先级 (深度/锚点模式显示) -->
            <div v-if="injectionMode !== 'default'" class="order-input">
              <span class="order-label">优先级:</span>
              <el-input-number
                v-model="orderValue"
                :min="0"
                :max="1000"
                :step="10"
                size="small"
                controls-position="right"
                style="width: 100px"
              />
              <el-tooltip content="值越大越靠近新消息（对话末尾）" placement="top">
                <el-icon class="info-icon"><InfoFilled /></el-icon>
              </el-tooltip>
            </div>
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
              :completion-source="macroCompletionSource"
            />
          </div>

          <!-- 预览 -->
          <div v-if="viewMode === 'preview'" class="preview-wrapper">
            <div class="preview-content">
              <RichTextRenderer
                :content="previewContent || form.content || '(空)'"
                :version="settings.uiPreferences.rendererVersion"
                :default-render-html="settings.uiPreferences.defaultRenderHtml"
                :llm-think-rules="llmThinkRules"
                :style-options="richTextStyleOptions"
                :resolve-asset="resolveAsset"
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
import type { MessageRole, UserProfile, InjectionStrategy } from "../../types";
import {
  ChatDotRound,
  User,
  MagicStick,
  CopyDocument,
  DocumentAdd,
  Document,
  InfoFilled,
} from "@element-plus/icons-vue";
import { Bot } from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import MacroSelector from "./MacroSelector.vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import RichTextRenderer from "@/tools/rich-text-renderer/RichTextRenderer.vue";
import type { LlmThinkRule, RichTextRendererStyleOptions } from "@/tools/rich-text-renderer/types";
import { useChatSettings } from "../../composables/useChatSettings";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useAnchorRegistry } from "../../composables/useAnchorRegistry";
import { useLlmChatStore } from "../../store";
import * as monaco from "monaco-editor";
import {
  MacroProcessor,
  createMacroContext,
  MacroRegistry,
  initializeMacroEngine,
  type MacroDefinition,
  type MacroContext,
  extractContextFromSession,
} from "../../macro-engine";
import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { processMessageAssetsSync, resolveAgentAssetUrlSync } from "../../utils/agentAssetUtils";

interface MessageForm {
  role: MessageRole;
  name?: string;
  content: string;
  injectionStrategy?: InjectionStrategy;
  modelMatch?: {
    enabled: boolean;
    patterns: string[];
    matchProfileName?: boolean;
  };
}

/** 注入模式 */
type InjectionMode = "default" | "depth" | "advanced_depth" | "anchor";

interface Props {
  visible: boolean;
  isEditMode: boolean;
  initialForm?: MessageForm;
  agentName?: string;
  userProfile?: UserProfile | null;
  agent?: any;
  llmThinkRules?: LlmThinkRule[];
  richTextStyleOptions?: RichTextRendererStyleOptions;
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
});

const emit = defineEmits<Emits>();

const errorHandler = createModuleErrorHandler("llm-chat/PresetMessageEditor");
const { settings } = useChatSettings();
const { getProfileById } = useLlmProfiles();
const { getAvailableAnchors } = useAnchorRegistry();
const chatStore = useLlmChatStore();

// 表单数据
const form = ref<MessageForm>({
  role: "system",
  name: "",
  content: "",
});

// 注入策略表单
const injectionMode = ref<InjectionMode>("default");
const depthValue = ref(0);
const depthConfigValue = ref("");
const anchorTarget = ref("chat_history");
const anchorPosition = ref<"before" | "after">("after");
const orderValue = ref(100);

// 模型匹配配置
const modelMatchEnabled = ref(false);
const matchProfileName = ref(false);
const modelMatchPatternsText = ref("");

// 可用锚点列表
const availableAnchors = computed(() => getAvailableAnchors());

// 视图模式：编辑/预览
const viewMode = ref<"edit" | "preview">("edit");

// 预览内容
const previewContent = ref("");

// 宏选择器
const macroSelectorVisible = ref(false);
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
    id: agentId
  };
});

// 提供当前 Agent 给预览中的 RichTextRenderer 及其子节点
provide("currentAgent", currentAgent);

// 资产转换钩子
const resolveAsset = (content: string) => {
  if (!content) return content;
  
  // 如果输入看起来就是一个纯粹的 agent-asset:// 链接（常见于 AST 模式下的节点属性）
  if (content.startsWith('agent-asset://') && !content.includes(' ')) {
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
 * 当用户输入 {{ 时触发宏候选   //}}vscode双花括号高亮显示防溢出补丁
 */
const macroCompletionSource = (context: CompletionContext): CompletionResult | null => {
  // 获取光标前的文本
  const line = context.state.doc.lineAt(context.pos);
  const textBefore = line.text.slice(0, context.pos - line.from);

  // 检查是否在 {{ 之后   //}}vscode双花括号高亮显示防溢出补丁
  const macroMatch = textBefore.match(/\{\{([a-zA-Z0-9_:]*)$/);
  if (!macroMatch) {
    return null;
  }

  const prefix = macroMatch[1].toLowerCase();
  const startPos = context.pos - macroMatch[1].length;

  // 获取所有支持的宏
  const registry = MacroRegistry.getInstance();
  const allMacros = registry.getAllMacros().filter((m) => m.supported !== false);

  // 过滤匹配的宏
  const matchedMacros = allMacros.filter(
    (macro) =>
      macro.name.toLowerCase().includes(prefix) || macro.description.toLowerCase().includes(prefix)
  );

  if (matchedMacros.length === 0) {
    return null;
  }

  // 智能排序：优先按 priority 降序，然后按类型，最后按名称
  const typeOrder: Record<string, number> = { value: 0, variable: 1, function: 2 };
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
  if (chatStore.currentSession) {
    sessionContext = extractContextFromSession(
      chatStore.currentSession,
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
  if (newMode === "preview") {
    processPreviewMacros();
  }
});

/**
 * 从 injectionStrategy 恢复 UI 状态
 */
const restoreInjectionStrategy = (strategy?: InjectionStrategy) => {
  // 1. 恢复所有数据字段 (如果存在)
  if (strategy) {
    if (strategy.depth !== undefined) depthValue.value = strategy.depth;
    if (strategy.depthConfig !== undefined) depthConfigValue.value = strategy.depthConfig;
    if (strategy.anchorTarget !== undefined) anchorTarget.value = strategy.anchorTarget;
    if (strategy.anchorPosition !== undefined) anchorPosition.value = strategy.anchorPosition;
    if (strategy.order !== undefined) orderValue.value = strategy.order;
  } else {
    // 如果没有策略对象，重置为默认值
    depthValue.value = 0;
    depthConfigValue.value = "";
    anchorTarget.value = "chat_history";
    anchorPosition.value = "after";
    orderValue.value = 100;
  }

  // 2. 确定激活模式
  if (!strategy) {
    injectionMode.value = "default";
    return;
  }

  // 优先使用显式的 type 字段
  if (strategy.type) {
    injectionMode.value = strategy.type;
    return;
  }

  // 兼容旧数据：根据字段存在性推断
  if (strategy.depthConfig) {
    injectionMode.value = "advanced_depth";
  } else if (strategy.depth !== undefined) {
    injectionMode.value = "depth";
  } else if (strategy.anchorTarget) {
    injectionMode.value = "anchor";
  } else {
    injectionMode.value = "default";
  }
};

/**
 * 构建 injectionStrategy 对象
 */
const buildInjectionStrategy = (): InjectionStrategy | undefined => {
  // 始终保存所有已配置的参数，以便在切换模式后数据不丢失
  // 并显式设置 type 字段
  const strategy: InjectionStrategy = {
    type: injectionMode.value,
    depth: depthValue.value,
    depthConfig: depthConfigValue.value,
    anchorTarget: anchorTarget.value,
    anchorPosition: anchorPosition.value,
    order: orderValue.value,
  };

  return strategy;
};

/**
 * 从 modelMatch 恢复 UI 状态
 */
const restoreModelMatch = (modelMatch?: {
  enabled: boolean;
  patterns: string[];
  matchProfileName?: boolean;
}) => {
  if (!modelMatch) {
    modelMatchEnabled.value = false;
    matchProfileName.value = false;
    modelMatchPatternsText.value = "";
    return;
  }
  modelMatchEnabled.value = modelMatch.enabled;
  matchProfileName.value = modelMatch.matchProfileName || false;
  modelMatchPatternsText.value = modelMatch.patterns.join("\n");
};

/**
 * 构建 modelMatch 对象
 */
const buildModelMatch = ():
  | { enabled: boolean; patterns: string[]; matchProfileName?: boolean }
  | undefined => {
  if (!modelMatchEnabled.value) {
    return undefined;
  }
  const patterns = modelMatchPatternsText.value
    .split("\n")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (patterns.length === 0) {
    return undefined;
  }
  return {
    enabled: true,
    patterns,
    matchProfileName: matchProfileName.value,
  };
};

// 监听 initialForm 的变化，更新本地表单
watch(
  () => props.initialForm,
  (newForm) => {
    if (newForm) {
      form.value = { ...newForm };
      restoreInjectionStrategy(newForm.injectionStrategy);
      restoreModelMatch(newForm.modelMatch);
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
        restoreInjectionStrategy(props.initialForm.injectionStrategy);
        restoreModelMatch(props.initialForm.modelMatch);
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

  const injectionStrategy = buildInjectionStrategy();
  const modelMatch = buildModelMatch();
  emit("save", {
    ...form.value,
    injectionStrategy,
    modelMatch,
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

/* 模型匹配配置样式 */
.model-match-row {
  align-items: flex-start; /* 顶部对齐，因为有换行内容 */
}

.model-match-row .field-label {
  margin-top: 4px; /* 标签向下偏移，与其他行垂直居中对齐 */
}

.model-match-config {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.match-switches {
  display: flex;
  align-items: center;
  height: 32px;
}

.model-match-patterns-area {
  width: 100%;
}

/* 注入策略配置样式 */
.injection-row {
  flex-wrap: wrap;
  gap: 12px;
}

.injection-config {
  flex: 1;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.injection-params {
  display: flex;
  align-items: center;
  gap: 8px;
}

.param-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.order-input {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.order-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.info-icon {
  color: var(--el-text-color-secondary);
  cursor: help;
}
</style>
