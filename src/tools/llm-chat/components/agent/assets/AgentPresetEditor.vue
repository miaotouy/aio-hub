<template>
  <div class="agent-preset-editor" :class="{ compact: props.compact }">
    <!-- 头部操作栏 -->
    <div v-if="!props.compact" ref="headerRef" class="editor-header" :class="{ 'is-narrow': isNarrow }">
      <div class="header-title" @click="isCollapsed = !isCollapsed">
        <el-button link size="small" class="collapse-btn">
          <el-icon :class="{ 'is-collapsed': isCollapsed }">
            <ArrowDown />
          </el-icon>
        </el-button>
        <span class="title-text">预设消息配置</span>
        <el-tooltip content="预设消息将作为所有对话的上下文基础" placement="top">
          <el-icon><QuestionFilled /></el-icon>
        </el-tooltip>
        <!-- Token 统计 -->
        <div v-if="props.modelId && totalTokens > 0" class="token-info">
          <el-tag size="small" type="info" effect="plain">
            <template v-if="isCalculatingTokens"> 计算中... </template>
            <template v-else> 总计: {{ totalTokens }} tokens </template>
          </el-tag>
        </div>
      </div>
      <div class="header-actions">
        <el-tooltip content="将当前预设导出为文件" placement="top" :show-after="300">
          <el-dropdown trigger="click" @command="handleExport">
            <el-button size="small">
              <el-icon><Download /></el-icon>
              导出
              <el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="json">JSON 格式</el-dropdown-item>
                <el-dropdown-item command="yaml">YAML 格式</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </el-tooltip>

        <el-tooltip content="将当前预设复制到剪贴板" placement="top" :show-after="300">
          <el-dropdown trigger="click" @command="handleCopy">
            <el-button size="small">
              <el-icon><CopyDocument /></el-icon>
              复制
              <el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="json">复制为 JSON</el-dropdown-item>
                <el-dropdown-item command="yaml">复制为 YAML</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </el-tooltip>
        <el-tooltip content="从剪贴板粘贴并覆盖整个预设" placement="top" :show-after="300">
          <el-button size="small" @click="handlePaste">
            <el-icon><DocumentCopy /></el-icon>
            粘贴
          </el-button>
        </el-tooltip>
        <el-tooltip content="从文件导入预设" placement="top" :show-after="300">
          <el-button size="small" @click="handleImport">
            <el-icon><Upload /></el-icon>
            导入
          </el-button>
        </el-tooltip>
        <el-tooltip content="批量管理消息（移动/删除/启用）" placement="top" :show-after="300">
          <el-button size="small" @click="handleOpenBatchManager">
            <el-icon><Operation /></el-icon>
            批量管理
          </el-button>
        </el-tooltip>
        <el-tooltip content="添加一条新的预设消息" placement="top" :show-after="300">
          <el-button type="primary" size="small" @click="handleAddMessage">
            <el-icon><Plus /></el-icon>
            添加消息
          </el-button>
        </el-tooltip>
      </div>
    </div>

    <!-- 消息列表滚动容器 --><Transition name="collapse">
      <div v-show="!isCollapsed || props.compact" class="messages-container" :style="{ height: containerHeight }">
        <div class="messages-scroll-wrapper">
          <VueDraggableNext
            v-model="currentPageMessages"
            item-key="id"
            handle=".drag-handle"
            @start="onDragStart"
            @end="onDragEnd"
            class="messages-list"
            ghost-class="ghost-message"
            drag-class="drag-message"
            :force-fallback="true"
            :fallback-tolerance="3"
            :animation="200"
          >
            <div
              v-for="element in currentPageMessages"
              :key="element.id"
              v-memo="[
                element.isEnabled,
                element.content,
                element.role,
                element.name,
                element.injectionStrategy,
                element.modelMatch,
                messageTokens.get(element.id),
              ]"
              class="message-card-wrapper"
            >
              <!-- 纯占位符锚点 - 紧凑模式 -->
              <div
                v-if="isPurePlaceholderAnchorType(element.type) && props.compact"
                class="message-card message-card-compact placeholder-card-compact"
                :class="[{ disabled: element.isEnabled === false }, `placeholder-${element.type}`]"
              >
                <div class="drag-handle">
                  <el-icon><Rank /></el-icon>
                </div>
                <div class="role-icon">
                  <el-icon :color="getAnchorColor(element.type)">
                    <component :is="getAnchorIcon(element.type)" />
                  </el-icon>
                </div>
                <div class="message-text-compact placeholder-text">
                  {{ getAnchorDef(element.type)?.name }}
                </div>
                <div class="message-actions-compact">
                  <el-switch
                    v-model="element.isEnabled"
                    :active-value="true"
                    :inactive-value="false"
                    size="small"
                    @change="handleToggleEnabled"
                  />
                </div>
              </div>

              <!-- 纯占位符锚点 - 正常模式 -->
              <div
                v-else-if="isPurePlaceholderAnchorType(element.type)"
                class="message-card placeholder-card"
                :class="[{ disabled: element.isEnabled === false }, `placeholder-${element.type}`]"
              >
                <div class="drag-handle">
                  <el-icon><Rank /></el-icon>
                </div>
                <div class="message-content">
                  <div class="message-role">
                    <el-tag :type="getAnchorTagType(element.type)" size="small" effect="plain">
                      <el-icon style="margin-right: 4px">
                        <component :is="getAnchorIcon(element.type)" />
                      </el-icon>
                      {{ getAnchorDef(element.type)?.name }}
                    </el-tag>
                  </div>
                  <div class="message-text placeholder-text">
                    {{ getAnchorDef(element.type)?.description }}
                  </div>
                </div>
                <div class="message-actions">
                  <el-switch
                    v-model="element.isEnabled"
                    :active-value="true"
                    :inactive-value="false"
                    size="small"
                    @change="handleToggleEnabled"
                  />
                </div>
              </div>

              <!-- 模板锚点 & 普通消息 - 紧凑模式 -->
              <div
                v-else-if="props.compact"
                class="message-card message-card-compact"
                :class="{
                  disabled: element.isEnabled === false,
                  'template-anchor-card-compact': isTemplateAnchorType(element.type),
                }"
                @click="handleEditMessage(element)"
              >
                <div class="drag-handle">
                  <el-icon><Rank /></el-icon>
                </div>
                <div class="role-icon">
                  <el-icon :color="getRoleColor(element.role)">
                    <component :is="getRoleIcon(element.role)" />
                  </el-icon>
                </div>

                <!-- 徽章们 -->
                <span
                  v-if="isTemplateAnchorType(element.type)"
                  class="injection-badge-compact"
                  :title="getAnchorDef(element.type)?.name"
                  >⚓</span
                >
                <span
                  v-if="
                    element.injectionStrategy?.type === 'advanced_depth' ||
                    (!element.injectionStrategy?.type && element.injectionStrategy?.depthConfig)
                  "
                  class="injection-badge-compact"
                  :title="`高级深度: ${element.injectionStrategy.depthConfig}`"
                  >🔩{{ element.injectionStrategy.depthConfig }}</span
                >
                <span
                  v-else-if="
                    element.injectionStrategy?.type === 'depth' ||
                    (!element.injectionStrategy?.type && element.injectionStrategy?.depth !== undefined)
                  "
                  class="injection-badge-compact"
                  title="深度注入"
                  >📍{{ element.injectionStrategy.depth }}</span
                >
                <span
                  v-else-if="
                    element.injectionStrategy?.type === 'anchor' ||
                    (!element.injectionStrategy?.type && element.injectionStrategy?.anchorTarget)
                  "
                  class="injection-badge-compact"
                  title="锚点注入"
                  >⚓</span
                >
                <span v-if="element.modelMatch?.enabled" class="model-match-badge-compact" title="仅特定模型生效"
                  >🎯</span
                >

                <div class="message-text-compact">
                  {{ element.name ? truncateText(element.name, 60) : truncateText(element.content, 60) }}
                </div>

                <div v-if="props.modelId && messageTokens.has(element.id)" class="token-compact">
                  {{ messageTokens.get(element.id) }}
                </div>

                <div class="message-actions-compact" @click.stop>
                  <el-tooltip content="编辑消息" placement="top" :show-after="500">
                    <el-button link size="small" @click="handleEditMessage(element)">
                      <el-icon><Edit /></el-icon>
                    </el-button>
                  </el-tooltip>
                  <el-switch
                    v-model="element.isEnabled"
                    :active-value="true"
                    :inactive-value="false"
                    size="small"
                    @change="handleToggleEnabled"
                  />
                </div>
              </div>

              <!-- 模板锚点 & 普通消息 - 正常模式 -->
              <div
                v-else
                class="message-card"
                :class="{
                  disabled: element.isEnabled === false,
                  'template-anchor-card': isTemplateAnchorType(element.type),
                }"
              >
                <div class="drag-handle">
                  <el-icon><Rank /></el-icon>
                </div>

                <div class="message-content">
                  <div class="message-role">
                    <div class="role-tags">
                      <el-tag :type="getRoleTagType(element.role)" size="small" effect="plain">
                        <el-icon style="margin-right: 4px">
                          <component :is="getRoleIcon(element.role)" />
                        </el-icon>
                        {{ getRoleLabel(element.role) }}
                      </el-tag>
                      <!-- 追加的模板锚点 Tag -->
                      <el-tag
                        v-if="isTemplateAnchorType(element.type)"
                        :type="getAnchorTagType(element.type)"
                        size="small"
                        effect="plain"
                        class="injection-tag"
                      >
                        <el-icon style="margin-right: 4px">
                          <component :is="getAnchorIcon(element.type)" />
                        </el-icon>
                        {{ getAnchorDef(element.type)?.name }}
                      </el-tag>
                      <!-- 注入策略标签 -->
                      <el-tag
                        v-if="
                          element.injectionStrategy?.type === 'advanced_depth' ||
                          (!element.injectionStrategy?.type && element.injectionStrategy?.depthConfig)
                        "
                        size="small"
                        type="warning"
                        effect="plain"
                        class="injection-tag"
                      >
                        🔩 深度 {{ element.injectionStrategy.depthConfig }}
                      </el-tag>
                      <el-tag
                        v-else-if="
                          element.injectionStrategy?.type === 'depth' ||
                          (!element.injectionStrategy?.type && element.injectionStrategy?.depth !== undefined)
                        "
                        size="small"
                        type="warning"
                        effect="plain"
                        class="injection-tag"
                      >
                        📍 深度 {{ element.injectionStrategy.depth }}
                      </el-tag>
                      <el-tag
                        v-else-if="
                          element.injectionStrategy?.type === 'anchor' ||
                          (!element.injectionStrategy?.type && element.injectionStrategy?.anchorTarget)
                        "
                        size="small"
                        type="success"
                        effect="plain"
                        class="injection-tag"
                      >
                        ⚓ {{ element.injectionStrategy.anchorTarget }}
                        {{ element.injectionStrategy.anchorPosition === "before" ? "前" : "后" }}
                      </el-tag>
                      <!-- 模型匹配标签 -->
                      <el-tag
                        v-if="element.modelMatch?.enabled"
                        size="small"
                        type="warning"
                        effect="plain"
                        class="model-match-tag"
                      >
                        🎯 模型限定
                      </el-tag>
                      <!-- Token 数量 -->
                      <el-tag
                        v-if="props.modelId && messageTokens.has(element.id)"
                        size="small"
                        type="info"
                        effect="plain"
                        class="token-tag"
                      >
                        {{ messageTokens.get(element.id) }} tokens
                      </el-tag>
                    </div>

                    <div class="message-actions">
                      <el-tooltip content="编辑消息" placement="top" :show-after="500">
                        <el-button link size="small" @click="handleEditMessage(element)">
                          <el-icon><Edit /></el-icon>
                        </el-button>
                      </el-tooltip>
                      <el-tooltip content="复制消息配置" placement="top" :show-after="500">
                        <el-button link size="small" @click="handleCopyMessage(element)">
                          <el-icon><CopyDocument /></el-icon>
                        </el-button>
                      </el-tooltip>
                      <el-tooltip content="粘贴并覆盖" placement="top" :show-after="500">
                        <span>
                          <el-popconfirm
                            title="确定要用剪贴板内容覆盖这条消息吗？"
                            @confirm="handlePasteMessage(element)"
                            width="220"
                          >
                            <template #reference>
                              <el-button link size="small">
                                <el-icon><DocumentCopy /></el-icon>
                              </el-button>
                            </template>
                          </el-popconfirm>
                        </span>
                      </el-tooltip>
                      <!-- 模板锚点隐藏删除按钮 -->
                      <el-tooltip
                        v-if="!isTemplateAnchorType(element.type)"
                        content="删除消息"
                        placement="top"
                        :show-after="500"
                      >
                        <span>
                          <el-popconfirm
                            title="确定要删除这条预设消息吗？"
                            @confirm="handleDeleteMessage(element)"
                            width="240"
                          >
                            <template #reference>
                              <el-button link size="small" type="danger">
                                <el-icon><Delete /></el-icon>
                              </el-button>
                            </template>
                          </el-popconfirm>
                        </span>
                      </el-tooltip>
                      <el-switch
                        v-model="element.isEnabled"
                        :active-value="true"
                        :inactive-value="false"
                        size="small"
                        @change="handleToggleEnabled"
                      />
                    </div>
                  </div>

                  <div v-if="element.name" class="message-name">
                    {{ element.name }}
                  </div>
                  <div class="message-text">
                    {{ truncateText(element.content, 120) }}
                  </div>
                </div>
              </div>
            </div>
          </VueDraggableNext>

          <!-- 空状态 -->
          <div v-if="localMessages.length === 0" class="empty-state">
            <el-empty description="暂无预设消息，点击上方按钮添加">
              <el-button type="primary" @click="handleAddMessage"> 添加第一条消息 </el-button>
            </el-empty>
          </div>
        </div>

        <!-- 分页控制 -->
        <div v-if="localMessages.length > pageSize" class="pagination-container">
          <el-pagination
            v-model:current-page="currentPage"
            :page-size="pageSize"
            :total="localMessages.length"
            layout="total, prev, pager, next, jumper"
            size="small"
            background
          />
        </div>
      </div>
    </Transition>

    <!-- 消息编辑器 -->
    <PresetMessageEditor
      v-model:visible="editDialogVisible"
      :is-edit-mode="isEditMode"
      :initial-form="editForm"
      :agent-name="props.agentName"
      :user-profile="effectiveUserProfile"
      :agent="props.agent"
      :llm-think-rules="props.agent?.llmThinkRules"
      :rich-text-style-options="props.agent?.richTextStyleOptions"
      @save="handleSaveMessage"
    />

    <!-- 导入文件选择器 -->
    <input
      ref="importFileInput"
      type="file"
      accept=".json,.yaml,.yml"
      style="display: none"
      @change="handleFileSelected"
    />

    <!-- 用户档案编辑对话框 -->
    <EditUserProfileDialog
      :visible="showUserProfileDialog"
      :profile="effectiveUserProfile"
      @update:visible="showUserProfileDialog = $event"
      @save="handleSaveUserProfile"
    />

    <!-- ST 预设导入对话框 -->
    <STPresetImportDialog
      v-model:visible="showSTImportDialog"
      :parsed-result="stImportData"
      @confirm="handleConfirmSTImport"
    />

    <!-- 批量管理对话框 -->
    <AgentPresetBatchDialog v-model:visible="showBatchManager" :messages="localMessages" @save="handleBatchSave" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, toRaw, markRaw } from "vue";
import { useDebounceFn, useElementSize } from "@vueuse/core";
import { VueDraggableNext } from "vue-draggable-next";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import yaml from "js-yaml";
import { useUserProfileStore } from "../../../stores/userProfileStore";
import { useLlmChatStore } from "../../../stores/llmChatStore";
import type { ChatMessageNode, MessageRole, UserProfile } from "../../../types";
import { MacroProcessor, createMacroContext, extractContextFromSession } from "../../../macro-engine";
import { isPromptFile, parsePromptFile, convertMacros } from "../../../services/sillyTavernParser";
import { useAnchorRegistry, type AnchorDefinition } from "../../../composables/ui/useAnchorRegistry";
import {
  QuestionFilled,
  Download,
  Upload,
  CopyDocument,
  DocumentCopy,
  Plus,
  Rank,
  Edit,
  Delete,
  ChatDotRound,
  User,
  Service,
  ArrowDown,
  Link,
  Operation,
} from "@element-plus/icons-vue";
import { ElMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import { calculateShortHash } from "@/utils/hash";
import { tokenCalculatorEngine } from "@/tools/token-calculator/composables/useTokenCalculator";
import PresetMessageEditor from "../editors/PresetMessageEditor.vue";
import EditUserProfileDialog from "../../user-profile/EditUserProfileDialog.vue";
import STPresetImportDialog from "./STPresetImportDialog.vue";
import AgentPresetBatchDialog from "./AgentPresetBatchDialog.vue";
import type { LlmThinkRule, RichTextRendererStyleOptions } from "@/tools/rich-text-renderer/types";
import type { ParsedPromptFile } from "../../../services/sillyTavernParser";

interface Props {
  modelValue?: ChatMessageNode[];
  height?: string;
  /** 紧凑模式：只显示一行，隐藏头部操作栏 */
  compact?: boolean;
  /** 模型ID，用于 token 计算 */
  modelId?: string;
  /** Agent 名称，用于导出文件名 */
  agentName?: string;
  /** 当前 Agent，用于确定生效的用户档案及其他配置 */
  agent?: {
    userProfileId?: string | null;
    llmThinkRules?: LlmThinkRule[];
    richTextStyleOptions?: RichTextRendererStyleOptions;
    [key: string]: any;
  } | null;
}

interface Emits {
  (e: "update:modelValue", value: ChatMessageNode[]): void;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: () => [],
  height: "500px",
  compact: false,
  modelId: "",
  agentName: "",
  agent: null,
});

const emit = defineEmits<Emits>();
const userProfileStore = useUserProfileStore();
const chatStore = useLlmChatStore();
const showUserProfileDialog = ref(false);
const anchorRegistry = useAnchorRegistry();

// 容器宽度监测
const headerRef = ref<HTMLElement | null>(null);
const { width: headerWidth } = useElementSize(headerRef);
const isNarrow = computed(() => headerWidth.value > 0 && headerWidth.value < 800);

// 折叠状态，默认展开
const isCollapsed = ref(false);

// #region 辅助函数
/**
 * 判断消息是否为锚点类型
 */
const isAnchorType = (type?: string): boolean => {
  return !!type && type !== "message" && anchorRegistry.hasAnchor(type);
};

/**
 * 获取锚点定义
 */
const getAnchorDef = (type?: string): AnchorDefinition | undefined => {
  if (!type) return undefined;
  return anchorRegistry.getAnchorById(type);
};

/**
 * 判断是否为模板锚点
 */
const isTemplateAnchorType = (type?: string): boolean => {
  return getAnchorDef(type)?.hasTemplate === true;
};

/**
 * 判断是否为纯占位符锚点
 */
const isPurePlaceholderAnchorType = (type?: string): boolean => {
  return isAnchorType(type) && !isTemplateAnchorType(type);
};
// #endregion

// 当前生效的用户档案（智能体绑定 > 全局配置）
const effectiveUserProfile = computed(() => {
  if (props.agent?.userProfileId) {
    return userProfileStore.getProfileById(props.agent.userProfileId) || null;
  }
  return userProfileStore.globalProfile;
});

// 本地消息列表
const localMessages = ref<ChatMessageNode[]>([]);

// 分页状态
const currentPage = ref(1);
const pageSize = ref(50); // 每页 50 条，对于预设消息来说足够了

const currentPageMessages = computed({
  get: () => {
    const start = (currentPage.value - 1) * pageSize.value;
    const end = start + pageSize.value;
    return localMessages.value.slice(start, end);
  },
  set: (newVal) => {
    // 处理拖拽后的同步
    const start = (currentPage.value - 1) * pageSize.value;
    const newList = [...localMessages.value];
    newList.splice(start, pageSize.value, ...newVal);
    localMessages.value = newList;
  },
});

// 编辑对话框状态
const editDialogVisible = ref(false);
const isEditMode = ref(false);
const editingId = ref<string | null>(null);
import type { InjectionStrategy } from "../../../types";

const editForm = ref<{
  role: MessageRole;
  content: string;
  name?: string;
  injectionStrategy?: InjectionStrategy;
  modelMatch?: {
    enabled: boolean;
    patterns: string[];
  };
}>({
  role: "system",
  content: "",
  name: "",
  injectionStrategy: undefined,
  modelMatch: undefined,
});

// 文件导入
const importFileInput = ref<HTMLInputElement | null>(null);
const showSTImportDialog = ref(false);
const stImportData = ref<ParsedPromptFile>({
  systemPrompts: [],
  injectionPrompts: [],
  unorderedPrompts: [],
  parameters: {},
});

// #region Token 计算
const messageTokens = ref<Map<string, number>>(new Map());
const isCalculatingTokens = ref(false);

/**
 * 分批并发执行异步任务
 * @param tasks 任务数组（每个任务是一个返回 Promise 的函数）
 * @param concurrency 最大并发数
 */
async function runWithConcurrency<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function runNext(): Promise<void> {
    while (index < tasks.length) {
      const currentIndex = index++;
      results[currentIndex] = await tasks[currentIndex]();
    }
  }

  // 启动 concurrency 个并发 worker
  const workers = Array(Math.min(concurrency, tasks.length))
    .fill(null)
    .map(() => runNext());

  await Promise.all(workers);
  return results;
}

// 计算所有消息的 token 数量，并保存到 metadata
const calculateAllTokens = async () => {
  if (!props.modelId || localMessages.value.length === 0) {
    messageTokens.value = new Map();
    return;
  }

  isCalculatingTokens.value = true;
  const newTokens = new Map<string, number>();
  let hasChanges = false;

  // 创建宏处理上下文
  const baseContext = createMacroContext({
    userName: effectiveUserProfile.value?.name || "User",
    charName: props.agentName || "Assistant",
    userProfile: effectiveUserProfile.value || undefined,
    agent: props.agent as any,
  });

  // 如果有活跃会话，合并会话上下文
  if (chatStore.currentSession) {
    const sessionContext = extractContextFromSession(
      chatStore.currentSession,
      props.agent as any,
      effectiveUserProfile.value || undefined
    );
    Object.assign(baseContext, sessionContext);
  }

  const macroContext = baseContext;
  const macroProcessor = new MacroProcessor();

  // 1. 先获取分词器元数据，确定缓存标识符（使用 tokenizer 名称而不是 modelId，因为不同模型可能使用相同分词器）
  const tokenizerResult = await tokenCalculatorEngine.calculateTokens("", props.modelId);
  const tokenizerName = tokenizerResult.tokenizerName;

  // 2. 构建任务列表，使用并发控制（限制同时计算的消息数量，避免 100+ 条消息同时计算导致卡顿）
  const tasks = localMessages.value.map((message) => async () => {
    // 跳过纯占位符锚点（无法预估）
    if (isPurePlaceholderAnchorType(message.type)) {
      return;
    }

    // 处理模板锚点和普通消息
    if (message.isEnabled) {
      try {
        let template = message.content;
        // 如果是模板锚点且内容为空，使用默认模板
        if (isTemplateAnchorType(message.type) && !template) {
          template = getAnchorDef(message.type)?.defaultTemplate || "";
        }

        if (template) {
          // 缓存键包含：分词器名称、模板内容、宏上下文（简化为关键信息）
          // 注意：macroContext 包含 agent/userProfile 等，这里简化处理，如果追求极致可以做更细粒度的 hash
          const contextKey = `${effectiveUserProfile.value?.id || "default"}:${props.agentName}`;
          const rawHashKey = `v3:${tokenizerName}:${template}:${contextKey}`;
          const contentHash = `v3:${tokenizerName}:${await calculateShortHash(rawHashKey)}`;

          if (message.metadata?.lastCalcHash === contentHash && message.metadata?.contentTokens !== undefined) {
            newTokens.set(message.id, message.metadata.contentTokens);
            return;
          }

          const processed = await macroProcessor.process(template, macroContext);
          const result = await tokenCalculatorEngine.calculateTokens(processed.output, props.modelId);
          newTokens.set(message.id, result.count);

          // 同步更新到消息的 metadata
          if (!message.metadata) message.metadata = {};
          if (message.metadata.contentTokens !== result.count || message.metadata.lastCalcHash !== contentHash) {
            message.metadata.contentTokens = result.count;
            message.metadata.lastCalcHash = contentHash;
            hasChanges = true;
          }
        }
      } catch (error) {
        console.error(`Failed to calculate tokens for message ${message.id}:`, error);
      }
    }
  });

  // 限制并发数为 10，避免大量预设消息同时计算导致 UI 卡顿
  await runWithConcurrency(tasks, 10);

  messageTokens.value = newTokens;
  isCalculatingTokens.value = false;

  if (hasChanges) {
    syncToParent();
  }
};

const debouncedCalculateTokens = useDebounceFn(calculateAllTokens, 300);

const totalTokens = computed(() => {
  let total = 0;
  for (const count of messageTokens.value.values()) {
    total += count;
  }
  return total;
});

watch(
  () => [localMessages.value, props.modelId, effectiveUserProfile.value] as const,
  () => {
    if (props.modelId) {
      debouncedCalculateTokens();
    }
  },
  { deep: true, immediate: true }
);

// #endregion

const containerHeight = computed(() => props.height);

watch(
  () => props.modelValue,
  (newValue) => {
    let existingMessages = [...(newValue || [])];
    let needsSync = false;

    // 确保系统锚点存在
    const systemAnchors = anchorRegistry.getSystemAnchors();
    for (const anchor of systemAnchors) {
      if (!existingMessages.some((msg) => msg.type === anchor.id)) {
        const newPlaceholder: ChatMessageNode = {
          id: `${anchor.id}-placeholder`,
          parentId: null,
          childrenIds: [],
          role: "system",
          content: anchor.defaultTemplate || "",
          type: anchor.id as any,
          status: "complete",
          isEnabled: true,
          timestamp: new Date().toISOString(),
        };
        // 模板锚点放到最前面，纯占位符锚点放到最后面
        if (anchor.hasTemplate) {
          existingMessages.unshift(newPlaceholder);
        } else {
          existingMessages.push(newPlaceholder);
        }
        needsSync = true;
      }
    }

    localMessages.value = existingMessages;

    if (needsSync) {
      emit("update:modelValue", existingMessages);
    }
  },
  { immediate: true, deep: true }
);

function onDragStart() {}

function onDragEnd() {
  emit("update:modelValue", localMessages.value);
}

function syncToParent() {
  emit("update:modelValue", toRaw(localMessages.value));
}

// #region 样式和标签获取
function getRoleTagType(role: MessageRole): "success" | "primary" | "info" {
  const typeMap: Record<MessageRole, "success" | "primary" | "info"> = {
    system: "info",
    user: "primary",
    assistant: "success",
    tool: "info",
  };
  return typeMap[role];
}

function getRoleIcon(role: MessageRole) {
  const iconMap: Record<MessageRole, any> = {
    system: markRaw(ChatDotRound),
    user: markRaw(User),
    assistant: markRaw(Service),
    tool: markRaw(Service),
  };
  return iconMap[role];
}

function getRoleLabel(role: MessageRole): string {
  const labelMap: Record<MessageRole, string> = {
    system: "System",
    user: "User",
    assistant: "Assistant",
    tool: "Tool",
  };
  return labelMap[role];
}

function getRoleColor(role: MessageRole): string {
  const colorMap: Record<MessageRole, string> = {
    system: "var(--el-color-info)",
    user: "var(--el-color-primary)",
    assistant: "var(--el-color-success)",
    tool: "var(--el-color-info)",
  };
  return colorMap[role];
}

function getAnchorTagType(type?: string): "success" | "primary" | "info" | "warning" | "danger" {
  return getAnchorDef(type)?.tagType || "success";
}

function getAnchorIcon(type?: string) {
  return getAnchorDef(type)?.icon || Link;
}

function getAnchorColor(type?: string): string {
  return getAnchorDef(type)?.color || "var(--el-color-success)";
}

function truncateText(text: string, maxLength: number): string {
  if (!text) return "(空内容)";
  const cleanedText = text.replace(/\s+/g, " ").trim();
  if (cleanedText.length <= maxLength) return cleanedText;
  return cleanedText.substring(0, maxLength) + "...";
}
// #endregion

// #region 消息操作
function handleAddMessage() {
  isEditMode.value = false;
  editForm.value = {
    role: "system",
    content: "",
    name: "",
    injectionStrategy: undefined,
    modelMatch: undefined,
  };
  editDialogVisible.value = true;
}

function handleEditMessage(message: ChatMessageNode) {
  if (isPurePlaceholderAnchorType(message.type)) {
    customMessage.info("纯占位符锚点不可编辑内容");
    return;
  }

  isEditMode.value = true;
  editingId.value = message.id;
  editForm.value = {
    role: message.role,
    content: message.content,
    name: message.name,
    injectionStrategy: message.injectionStrategy,
    modelMatch: message.modelMatch,
  };
  editDialogVisible.value = true;
}

function handleSaveMessage(form: typeof editForm.value) {
  if (isEditMode.value && editingId.value) {
    const message = localMessages.value.find((m) => m.id === editingId.value);
    if (message) {
      Object.assign(message, form);
    }
  } else {
    const newMessage: ChatMessageNode = {
      id: `preset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      parentId: null,
      childrenIds: [],
      ...form,
      status: "complete",
      type: "message",
      isEnabled: true,
      timestamp: new Date().toISOString(),
    };
    const historyIndex = localMessages.value.findIndex((m) => m.type === "chat_history");
    if (historyIndex !== -1) {
      localMessages.value.splice(historyIndex, 0, newMessage);
    } else {
      localMessages.value.push(newMessage);
    }
  }
  editDialogVisible.value = false;
  syncToParent();
}

async function handleCopyMessage(message: ChatMessageNode) {
  const dataToCopy = {
    role: message.role,
    content: message.content,
    name: message.name,
    injectionStrategy: message.injectionStrategy,
    modelMatch: message.modelMatch,
  };

  try {
    await writeText(JSON.stringify(dataToCopy, null, 2));
    customMessage.success("消息配置已复制");
  } catch (error) {
    customMessage.error("复制失败");
  }
}

async function handlePasteMessage(message: ChatMessageNode) {
  try {
    const text = await readText();
    if (!text) return customMessage.warning("剪贴板为空");

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = text; // 作为纯文本处理
    }

    if (typeof data === "object" && data !== null) {
      message.role = data.role || message.role;
      message.content = convertMacros(data.content ?? message.content);
      message.name = data.name || message.name;
      message.injectionStrategy = data.injectionStrategy || message.injectionStrategy;
      message.modelMatch = data.modelMatch || message.modelMatch;
      customMessage.success("已粘贴并覆盖消息");
    } else {
      message.content = convertMacros(data);
      customMessage.success("已粘贴文本内容");
    }
    syncToParent();
  } catch (error) {
    customMessage.error("粘贴失败");
  }
}

function handleDeleteMessage(message: ChatMessageNode) {
  if (isAnchorType(message.type)) {
    customMessage.warning("锚点消息不可删除");
    return;
  }
  const index = localMessages.value.findIndex((m) => m.id === message.id);
  if (index !== -1) {
    localMessages.value.splice(index, 1);
    syncToParent();
    customMessage.success("删除成功");
  }
}

function handleToggleEnabled() {
  syncToParent();
}
// #endregion

// #region 导入导出
/**
 * 清理消息对象以用于导出（移除运行时元数据）
 */
function cleanMessagesForExport(messages: ChatMessageNode[]): any[] {
  return messages
    .filter((m) => !isAnchorType(m.type))
    .map((m) => {
      const cloned = JSON.parse(JSON.stringify(toRaw(m)));
      if (cloned.metadata) {
        delete cloned.metadata.lastCalcHash;
        delete cloned.metadata.contentTokens;
        // 如果 metadata 变空了，直接删掉
        if (Object.keys(cloned.metadata).length === 0) {
          delete cloned.metadata;
        }
      }
      return cloned;
    });
}

function handleExport(format: "json" | "yaml" = "json") {
  if (localMessages.value.length === 0) {
    return customMessage.warning("没有可导出的预设消息");
  }
  const dataToExport = cleanMessagesForExport(localMessages.value);
  let dataStr = "";
  if (format === "yaml") {
    dataStr = yaml.dump(dataToExport);
  } else {
    dataStr = JSON.stringify(dataToExport, null, 2);
  }
  const blob = new Blob([dataStr], { type: `application/${format}` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const agentNamePart = props.agentName ? `${props.agentName}-` : "";
  link.download = `${agentNamePart}preset-${new Date().toISOString().split("T")[0]}.${format}`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
  customMessage.success(`已导出为 ${format.toUpperCase()}`);
}

async function handleCopy(format: "json" | "yaml" = "json") {
  if (localMessages.value.length === 0) {
    return customMessage.warning("没有可复制的消息");
  }
  try {
    const dataToExport = cleanMessagesForExport(localMessages.value);
    let dataStr = "";
    if (format === "yaml") {
      dataStr = yaml.dump(dataToExport);
    } else {
      dataStr = JSON.stringify(dataToExport, null, 2);
    }
    await writeText(dataStr);
    customMessage.success(`预设已作为 ${format.toUpperCase()} 复制`);
  } catch (error) {
    customMessage.error("复制失败");
  }
}

async function handlePaste() {
  try {
    const text = await readText();
    if (!text) return customMessage.warning("剪贴板为空");

    let imported: any;
    try {
      imported = JSON.parse(text);
    } catch {
      try {
        imported = yaml.load(text);
      } catch {
        return customMessage.error("剪贴板内容不是有效的 JSON 或 YAML");
      }
    }
    if (!Array.isArray(imported)) {
      return customMessage.error("数据格式不正确（应为消息数组）");
    }

    // 处理宏转换
    const processedImported = imported.map((m) => ({
      ...m,
      content: typeof m.content === "string" ? convertMacros(m.content) : m.content,
    }));

    const hasRealMessages = localMessages.value.some((m) => !isAnchorType(m.type));
    if (hasRealMessages) {
      await ElMessageBox.confirm("这将覆盖当前所有非锚点消息，确定吗？", "确认粘贴", {
        type: "warning",
        confirmButtonText: "覆盖",
        cancelButtonText: "取消",
      }).catch(() => {
        throw new Error("User cancelled");
      });
    }

    const nonAnchorMessages = localMessages.value.filter((m) => isAnchorType(m.type));
    localMessages.value = [...nonAnchorMessages, ...processedImported];
    syncToParent();
    customMessage.success("粘贴成功");
  } catch (error: any) {
    if (error.message !== "User cancelled") {
      customMessage.error("粘贴失败");
    }
  }
}

function handleImport() {
  importFileInput.value?.click();
}

async function handleFileSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  try {
    const content = await file.text();
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = yaml.load(content);
    }

    if (isPromptFile(parsed)) {
      stImportData.value = parsePromptFile(parsed);
      showSTImportDialog.value = true;
    } else if (Array.isArray(parsed)) {
      // 普通数组导入也处理宏
      const processed = parsed.map((m) => ({
        ...m,
        content: typeof m.content === "string" ? convertMacros(m.content) : m.content,
      }));
      localMessages.value = [...localMessages.value.filter((m) => isAnchorType(m.type)), ...processed];
      syncToParent();
      customMessage.success("导入成功");
    } else {
      throw new Error("文件格式不正确");
    }
  } catch (error) {
    customMessage.error("导入失败");
  } finally {
    (event.target as HTMLInputElement).value = "";
  }
}

function handleConfirmSTImport(data: ParsedPromptFile) {
  const { systemPrompts, injectionPrompts, unorderedPrompts } = data;
  const newMessages = [...systemPrompts, ...injectionPrompts, ...unorderedPrompts];
  if (newMessages.length > 0) {
    const historyIndex = localMessages.value.findIndex((m) => m.type === "chat_history");
    if (historyIndex !== -1) {
      localMessages.value.splice(historyIndex, 0, ...newMessages);
    } else {
      localMessages.value.push(...newMessages);
    }
    syncToParent();
    customMessage.success(`成功导入 ${newMessages.length} 条消息`);
  }
  showSTImportDialog.value = false;
}

// 批量管理
const showBatchManager = ref(false);

function handleOpenBatchManager() {
  if (localMessages.value.length === 0) {
    customMessage.warning("暂无消息可管理");
    return;
  }
  showBatchManager.value = true;
}

function handleBatchSave(newMessages: ChatMessageNode[]) {
  localMessages.value = newMessages;
  syncToParent();
  customMessage.success("批量修改已应用");
}
// #endregion

// #region 用户档案
function handleSaveUserProfile(updates: Partial<Omit<UserProfile, "id" | "createdAt">>) {
  if (effectiveUserProfile.value) {
    userProfileStore.updateProfile(effectiveUserProfile.value.id, updates);
  }
  showUserProfileDialog.value = false;
}
// #endregion
</script>

<style scoped>
.agent-preset-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-radius: 8px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border-bottom: var(--border-width) solid var(--border-color);
  flex-wrap: wrap;
  gap: 12px;
}
.header-title {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  padding: 4px 8px;
  margin-left: -8px;
  border-radius: 6px;
  transition: background-color 0.2s;
  flex: 1;
  /* 确保标题至少有足够的宽度，不至于竖起来 */
  min-width: 140px;
}

.title-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 100px;
}

.header-title:hover {
  background-color: var(--el-fill-color-light);
}

.collapse-btn {
  padding: 0;
  pointer-events: none;
}

.collapse-btn .el-icon {
  transition: transform 0.3s ease;
}

.collapse-btn .el-icon.is-collapsed {
  transform: rotate(-90deg);
}

/* 折叠过渡动画 */
.collapse-enter-active,
.collapse-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.collapse-enter-from,
.collapse-leave-to {
  opacity: 0;
  max-height: 0;
}

.collapse-enter-to,
.collapse-leave-from {
  opacity: 1;
  max-height: 2000px;
}

.token-info {
  margin-left: 8px;
  flex-shrink: 0;
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
  /* 按钮组在宽度不足时，作为整体换行 */
  flex: 2;
  min-width: 320px;
}

/* 当宽度低于 800px 时，强制标题和按钮组各自占据一行，避免挤在一起 */
.editor-header.is-narrow .header-title {
  flex: 1 100%;
}
.editor-header.is-narrow .header-actions {
  flex: 1 1 100%;
  justify-content: flex-start;
}

.messages-container {
  flex: 1;
  overflow: hidden;
  position: relative;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.messages-scroll-wrapper {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px;
  box-sizing: border-box;
}

.pagination-container {
  padding: 8px 16px;
  border-top: var(--border-width) solid var(--border-color);
  background-color: var(--card-bg);
  display: flex;
  justify-content: center;
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  transition: all 0.2s;
}

.message-card:hover {
  border-color: var(--el-color-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.message-card.disabled {
  opacity: 0.5;
}

.placeholder-card,
.template-anchor-card {
  border-style: dashed;
}

.placeholder-card.placeholder-chat_history,
.template-anchor-card.template-anchor-chat_history {
  background: color-mix(in srgb, var(--el-color-warning) 10%, transparent);
  border-color: var(--el-color-warning-light-5);
}
.placeholder-card.placeholder-chat_history:hover,
.template-anchor-card.template-anchor-chat_history:hover {
  border-color: var(--el-color-warning);
  background: color-mix(in srgb, var(--el-color-warning) 20%, transparent);
}

.template-anchor-card {
  background: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
  border-color: var(--el-color-primary-light-5);
}
.template-anchor-card:hover {
  border-color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 20%, transparent);
}

.placeholder-text {
  color: var(--el-text-color-secondary);
  font-style: italic;
}

.ghost-message {
  opacity: 0.5;
  background: rgba(var(--el-color-primary-rgb), 0.1);
}

.drag-message {
  opacity: 0.8;
  transform: rotate(2deg);
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  transition: none !important;
}

.drag-handle {
  display: flex;
  align-items: center;
  cursor: grab;
  color: var(--el-text-color-secondary);
  padding: 4px;
  user-select: none;
}

.drag-handle:active {
  cursor: grabbing;
}

.drag-handle:hover {
  color: var(--el-color-primary);
}

.message-content {
  flex: 1;
  min-width: 0;
}

.message-role {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 8px;
}

.role-tags {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}

.token-tag {
  font-variant-numeric: tabular-nums;
}

.injection-tag {
  font-size: 12px;
}

.injection-badge-compact {
  font-size: 11px;
  color: var(--el-color-warning);
  flex-shrink: 0;
}

.model-match-badge-compact {
  font-size: 11px;
  color: var(--el-color-danger);
  flex-shrink: 0;
}

.message-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
  font-size: 14px;
  line-height: 1.4;
}

.message-text {
  color: var(--el-text-color-regular);
  line-height: 1.6;
  word-break: break-word;
}

.message-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  min-height: 300px;
}

/* 紧凑模式 */
.agent-preset-editor.compact .messages-scroll-wrapper {
  padding: 8px;
}

.agent-preset-editor.compact .messages-list {
  gap: 8px;
}

.message-card-compact {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  transition: all 0.2s;
  cursor: pointer;
  min-height: 36px;
}

.message-card-compact:hover {
  border-color: var(--el-color-primary);
  background: var(--el-fill-color-light);
}

.message-card-compact.disabled {
  opacity: 0.5;
}

.placeholder-card-compact,
.template-anchor-card-compact {
  border-style: dashed;
}

.placeholder-card-compact.placeholder-chat_history {
  background: color-mix(in srgb, var(--el-color-warning) 10%, transparent);
  border-color: var(--el-color-warning-light-5);
}
.placeholder-card-compact.placeholder-user_profile,
.template-anchor-card-compact {
  background: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
  border-color: var(--el-color-primary-light-5);
}

.message-card-compact .drag-handle {
  padding: 2px;
  font-size: 14px;
}

.role-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}

.message-text-compact {
  flex: 1;
  font-size: 13px;
  color: var(--el-text-color-regular);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
}

.token-compact {
  font-size: 11px;
  color: var(--el-color-info);
  font-variant-numeric: tabular-nums;
  padding: 2px 6px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  flex-shrink: 0;
}

.message-actions-compact {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.agent-preset-editor.compact .empty-state {
  min-height: 100px;
  font-size: 13px;
}

.el-button {
  margin: 0;
}
</style>
