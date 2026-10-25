<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<template>
  <BaseDialog
    :modelValue="visible"
    @update:modelValue="$emit('update:visible', $event)"
    :title="
      form.presetComposition
        ? isEditMode
          ? '编辑组合消息'
          : '新建组合消息'
        : isGreetingMode
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
    :before-close="beforeClose"
  >
    <template #content>
      <div
        class="preset-message-editor"
        :class="{ structured: form.presetComposition }"
        @keydown.capture="handleEditorKey"
      >
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

        <div class="message-settings">
          <!-- 所属预设组（非 greeting 模式且有可用组时显示） -->
          <div
            v-if="!isGreetingMode && presetGroups?.length"
            class="editor-row"
          >
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
        </div>
        <div v-if="!isGreetingMode" class="editor-row">
          <span class="field-label">正文</span>
          <el-radio-group
            :model-value="form.presetComposition ? 'composition' : 'plain'"
            size="small"
            aria-label="内容形式"
            @change="handleBodyModeChange"
          >
            <el-radio-button value="plain">普通正文</el-radio-button>
            <el-radio-button value="composition">组合编排</el-radio-button>
          </el-radio-group>
        </div>
        <!-- 组合消息：结构化编辑区；预览模式下保留实例以维持选中片段与撤销记录 -->
        <PresetCompositionEditor
          v-if="form.presetComposition"
          v-show="viewMode === 'edit'"
          v-model="form.presetComposition"
          :initial-part-id="compositionPartId"
          :variable-config="agent?.variableConfig"
          :allow-recall="!isGreetingMode"
        />
        <template v-if="!form.presetComposition || viewMode !== 'edit'">
          <!-- 第二行：内容标签 + 工具栏 -->
          <div class="editor-row toolbar-row">
            <span class="field-label">内容</span>

            <PresetBodyToolbar
              v-if="viewMode === 'edit'"
              v-model="form.content"
              class="editor-toolbar"
              :editor="richEditorRef"
              :variable-config="agent?.variableConfig"
              :allow-recall="!isGreetingMode"
            >
              <el-button
                v-if="!isGreetingMode"
                size="small"
                plain
                class="extract-choice"
                @click="extractChoice"
                ><Split :size="16" />提取为单选组</el-button
              >
            </PresetBodyToolbar>
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
            <div
              v-if="!form.presetComposition"
              v-show="viewMode === 'edit'"
              class="editor-wrapper"
            >
              <RichCodeEditor
                ref="richEditorRef"
                v-model="form.content"
                language="markdown"
                :line-numbers="true"
                editor-type="monaco"
                :options="presetEditorOptions"
              />
            </div>

            <!-- 文本预览 -->
            <div
              v-if="viewMode === 'text'"
              class="preview-wrapper text-preview-wrapper"
            >
              <pre class="text-preview-content">{{
                previewContent || previewSource || "(空)"
              }}</pre>
            </div>

            <!-- 渲染预览 -->
            <div v-if="viewMode === 'preview'" class="preview-wrapper">
              <div class="preview-content">
                <RichTextRenderer
                  :content="previewContent || previewSource || '(空)'"
                  :version="settings.uiPreferences.rendererVersion"
                  :default-render-html="
                    settings.uiPreferences.defaultRenderHtml
                  "
                  :llm-think-rules="llmThinkRules"
                  :style-options="richTextStyleOptions"
                  :resolve-asset="resolveAsset"
                />
              </div>
            </div>
          </div>
        </template>
      </div>
      <PresetInlineLeaveGuard ref="leaveGuard" />
    </template>
    <template #footer>
      <div class="editor-footer" @keydown.capture="handleEditorKey">
        <el-button @click="requestClose">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave()">
          {{
            form.presetComposition ? "保存并返回" : isEditMode ? "保存" : "添加"
          }}
        </el-button>
      </div>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, provide } from "vue";
import { cloneDeep } from "lodash-es";
import {
  createPresetPart,
  assertPresetComposition,
  extractPresetChoice,
  compilePresetComposition,
  type PresetComposition,
} from "@aiohub/agent-preset-core";
import PresetCompositionEditor from "./PresetCompositionEditor.vue";
import PresetBodyToolbar from "./PresetBodyToolbar.vue";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import PresetInlineLeaveGuard from "../assets/PresetInlineLeaveGuard.vue";
import type {
  MessageRole,
  UserProfile,
  InjectionStrategy,
  PresetAttachmentRef,
} from "@/tools/llm-chat/types";
import type { PresetMessageGroup, AgentAsset } from "../../types/agent";
import { ChatDotRound, User, CopyDocument } from "@element-plus/icons-vue";
import { Bot, Split } from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import ModelMatchConfig from "./ModelMatchConfig.vue";
import InjectionConfig from "./InjectionConfig.vue";
import PresetAttachmentPicker from "./PresetAttachmentPicker.vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import RichTextRenderer from "@/tools/rich-text-renderer/RichTextRenderer.vue";
import type {
  LlmThinkRule,
  RichTextRendererStyleOptions,
} from "@/tools/rich-text-renderer/types";
import { useChatSettings } from "@/tools/llm-chat/composables/settings/useChatSettings";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useLlmChatStore } from "@/tools/llm-chat/stores/llmChatStore";
import * as monaco from "@/utils/monaco";
import {
  MacroProcessor,
  createMacroContext,
  MacroRegistry,
  initializeMacroEngine,
  type MacroContext,
  extractContextFromSession,
} from "@/tools/llm-chat/macro-engine";
import {
  processMessageAssetsSync,
  resolveAgentAssetUrlSync,
} from "../../utils/agentAssetUtils";

interface MessageForm {
  presetComposition?: PresetComposition;
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
  initialPartId?: string;
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
  saveMessage?: (form: MessageForm) => Promise<void>;
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
const compositionPartId = ref<string>();

const presetEditorOptions =
  computed<monaco.editor.IStandaloneEditorConstructionOptions>(() => ({
    wordWrap: "on",
    wrappingIndent: "same",
    lineNumbersMinChars: 3,
    scrollBeyondLastLine: false,
    padding: { top: 12, bottom: 12 },
    suggestOnTriggerCharacters: false,
    quickSuggestions: false,
  }));

// 预览内容
const previewContent = ref("");

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

// 预览源文本：组合消息使用当前选择拼接后的正文
const previewSource = computed(() => {
  if (!form.value.presetComposition) return form.value.content;
  try {
    return compilePresetComposition(form.value.presetComposition).content;
  } catch {
    return "";
  }
});

// 处理宏预览
const processPreviewMacros = async () => {
  if (!previewSource.value) {
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
    const result = await processor.process(previewSource.value, context);

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
    previewContent.value = previewSource.value;
  }
};

// 监听视图模式变化，进入预览模式时处理宏
watch(viewMode, (newMode) => {
  if (newMode === "preview" || newMode === "text") {
    processPreviewMacros();
  }
});

const saving = ref(false);
const leaveGuard = ref<InstanceType<typeof PresetInlineLeaveGuard>>();
const savedBaseline = ref("");
const protectDraft = ref(false);

// 监听 initialForm 的变化，更新本地表单
watch(
  () => props.initialForm,
  (newForm) => {
    if (newForm && !props.visible) {
      form.value = {
        ...JSON.parse(JSON.stringify(newForm)),
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
      compositionPartId.value = props.initialPartId;
      previewContent.value = ""; // 重置预览缓存，避免显示上次的旧内容
      attachmentPickerRef.value?.resetSearch(); // 重置附件搜索
      if (props.initialForm) {
        form.value = {
          ...JSON.parse(JSON.stringify(props.initialForm)),
          presetAttachments: props.initialForm.presetAttachments
            ? [...props.initialForm.presetAttachments]
            : [],
        };
        injectionStrategyValue.value = props.initialForm.injectionStrategy;
        modelMatchValue.value = props.initialForm.modelMatch;
      }
      protectDraft.value = !!form.value.presetComposition;
      savedBaseline.value = formSnapshot();
    }
  },
  { immediate: true }
);

/**
 * 复制内容
 */
async function handleCopy() {
  const contentToCopy =
    viewMode.value === "edit"
      ? form.value.content
      : previewContent.value || previewSource.value || "";

  const result = await errorHandler.wrapAsync(
    async () => {
      await writeText(contentToCopy);
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
 * 保存消息
 */
function formSnapshot() {
  return JSON.stringify({
    ...form.value,
    injectionStrategy: injectionStrategyValue.value,
    modelMatch: modelMatchValue.value,
  });
}
async function beforeClose(): Promise<boolean> {
  if (saving.value) return false;
  if (!protectDraft.value || savedBaseline.value === formSnapshot())
    return true;
  const decision = await leaveGuard.value!.ask();
  if (decision === "continue") return false;
  if (decision === "save") return await handleSave();
  return true;
}
async function requestClose() {
  if (await beforeClose()) emit("update:visible", false);
}
function handleEditorKey(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey)) return;
  if (event.key.toLowerCase() === "s") {
    event.preventDefault();
    void handleSave(false);
  }
  if (event.key === "Enter") {
    event.preventDefault();
    void handleSave();
  }
}
function handleBodyModeChange(mode: string | number | boolean | undefined) {
  if (mode === "plain") {
    void convertToPlain();
    return;
  }
  if (mode !== "composition" || form.value.presetComposition) return;
  const initialPart = createPresetPart(form.value.content);
  form.value.presetComposition = {
    version: 1,
    separator: "",
    parts: [initialPart],
  };
  form.value.content = "";
  compositionPartId.value = initialPart.id;
  protectDraft.value = true;
  viewMode.value = "edit";
}

async function extractChoice() {
  const instance = richEditorRef.value?.monacoEditorInstance;
  const selection = instance?.getSelection();
  const model = instance?.getModel();
  if (!selection || !model || selection.isEmpty()) {
    customMessage.info("请先选中需要变化的正文");
    return;
  }
  const start = model.getOffsetAt(selection.getStartPosition());
  const end = model.getOffsetAt(selection.getEndPosition());
  const proposed = extractPresetChoice(form.value.content, start, end);
  const selected = proposed.parts[1];
  const original = form.value.content.slice(start, end);
  if (selected.options[0].content !== original) {
    const { ElMessageBox } = await import("element-plus");
    try {
      await ElMessageBox.confirm(
        `选区将扩展到完整宏：${selected.options[0].content}`,
        "提取选择组",
        {
          lockScroll: false,
          confirmButtonText: "提取",
          cancelButtonText: "取消",
        }
      );
    } catch {
      return;
    }
  }
  protectDraft.value = true;
  compositionPartId.value = selected.id;
  form.value.presetComposition = proposed;
  form.value.content = "";
}
async function convertToPlain() {
  if (!form.value.presetComposition) return;
  const { ElMessageBox } = await import("element-plus");
  try {
    await ElMessageBox.confirm(
      "将当前使用项拼接为普通正文，其他版本将在保存后移除。继续？",
      "转为普通消息",
      {
        lockScroll: false,
        confirmButtonText: "转换",
        cancelButtonText: "取消",
        type: "warning",
      }
    );
  } catch {
    return;
  }
  form.value.content = compilePresetComposition(
    form.value.presetComposition
  ).content;
  form.value.presetComposition = undefined;
  compositionPartId.value = undefined;
  viewMode.value = "edit";
}
async function handleSave(close = true): Promise<boolean> {
  if (saving.value) return false;
  try {
    if (form.value.presetComposition)
      assertPresetComposition(form.value.presetComposition);
    else if (!form.value.content.trim()) {
      customMessage.warning("消息内容不能为空");
      return false;
    }
    saving.value = true;
    const submittedSnapshot = formSnapshot();
    const result = cloneDeep({
      ...form.value,
      content: form.value.presetComposition ? "" : form.value.content,
      presetAttachments: form.value.presetAttachments?.length
        ? form.value.presetAttachments
        : undefined,
      injectionStrategy: injectionStrategyValue.value,
      modelMatch: modelMatchValue.value,
    });
    if (props.saveMessage) await props.saveMessage(result);
    else emit("save", result);
    savedBaseline.value = submittedSnapshot;
    const unchanged = formSnapshot() === submittedSnapshot;
    if (!unchanged) protectDraft.value = true;
    if (close && unchanged) emit("update:visible", false);
    return !close || unchanged;
  } catch (error) {
    customMessage.error(
      error instanceof Error ? error.message : "保存失败，请重试"
    );
    return false;
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.editor-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  justify-content: flex-end;
}
.preset-message-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 600px; /* 维持编辑器在整体窗口变小时的最小高度，防止容器缩没 */
  gap: 16px;
}

.preset-message-editor.structured {
  min-height: 560px;
}
.structured :deep(.composition-workspace) {
  flex: 1;
  min-height: 400px;
}
.structured .editor-content-area {
  min-height: 400px;
}
.message-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex-shrink: 0;
}
.extract-choice {
  margin-left: auto;
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
  min-height: 600px; /* 确保编辑器/预览区域本身也有一个最小高度，不会被其他配置项完全挤压 */
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
