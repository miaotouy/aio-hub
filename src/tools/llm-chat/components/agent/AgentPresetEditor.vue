<template>
  <div class="agent-preset-editor" :class="{ compact: props.compact }">
    <!-- 头部操作栏 -->
    <div v-if="!props.compact" class="editor-header">
      <div class="header-title">
        <span>预设消息配置</span>
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
        <el-tooltip content="添加一条新的预设消息" placement="top" :show-after="300">
          <el-button type="primary" size="small" @click="handleAddMessage">
            <el-icon><Plus /></el-icon>
            添加消息
          </el-button>
        </el-tooltip>
      </div>
    </div>

    <!-- 消息列表滚动容器 -->
    <div class="messages-container" :style="{ height: containerHeight }">
      <div class="messages-scroll-wrapper">
        <VueDraggableNext
          v-model="localMessages"
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
            v-for="(element, index) in localMessages"
            :key="element.id"
            class="message-card-wrapper"
          >
            <!-- 历史消息占位符 - 紧凑模式 -->
            <div
              v-if="element.type === 'chat_history' && props.compact"
              class="message-card message-card-compact history-placeholder-compact"
              :class="{ disabled: element.isEnabled === false }"
            >
              <!-- 拖拽手柄 -->
              <div class="drag-handle">
                <el-icon><Rank /></el-icon>
              </div>

              <!-- 历史图标 -->
              <div class="role-icon">
                <el-icon color="var(--el-color-warning)">
                  <ChatDotRound />
                </el-icon>
              </div>

              <!-- 文本 -->
              <div class="message-text-compact placeholder-text">聊天历史插入位置</div>

              <!-- 操作按钮 -->
              <div class="message-actions-compact">
                <el-switch
                  v-model="element.isEnabled"
                  :active-value="true"
                  :inactive-value="false"
                  size="small"
                  @change="handleToggleEnabled(index)"
                />
              </div>
            </div>

            <!-- 历史消息占位符 - 正常模式 -->
            <div
              v-else-if="element.type === 'chat_history'"
              class="message-card history-placeholder"
              :class="{ disabled: element.isEnabled === false }"
            >
              <!-- 拖拽手柄 -->
              <div class="drag-handle">
                <el-icon><Rank /></el-icon>
              </div>

              <!-- 消息内容 -->
              <div class="message-content">
                <!-- 角色标签 -->
                <div class="message-role">
                  <el-tag type="warning" size="small" effect="plain">
                    <el-icon style="margin-right: 4px">
                      <ChatDotRound />
                    </el-icon>
                    历史消息占位符
                  </el-tag>
                </div>

                <!-- 消息文本预览 -->
                <div class="message-text placeholder-text">实际的聊天历史将在此处插入</div>
              </div>

              <!-- 操作按钮 -->
              <div class="message-actions">
                <el-switch
                  v-model="element.isEnabled"
                  :active-value="true"
                  :inactive-value="false"
                  size="small"
                  @change="handleToggleEnabled(index)"
                />
              </div>
            </div>

            <!-- 用户档案占位符 - 紧凑模式 -->
            <div
              v-else-if="element.type === 'user_profile' && props.compact"
              class="message-card message-card-compact user-profile-placeholder-compact"
              :class="{ disabled: element.isEnabled === false }"
            >
              <!-- 拖拽手柄 -->
              <div class="drag-handle">
                <el-icon><Rank /></el-icon>
              </div>

              <!-- 用户档案图标 -->
              <div class="role-icon">
                <el-icon color="var(--el-color-primary)">
                  <User />
                </el-icon>
              </div>

              <!-- 文本 -->
              <div class="message-text-compact placeholder-text">用户档案插入位置</div>

              <!-- 操作按钮 -->
              <div class="message-actions-compact">
                <el-switch
                  v-model="element.isEnabled"
                  :active-value="true"
                  :inactive-value="false"
                  size="small"
                  @change="handleToggleEnabled(index)"
                />
              </div>
            </div>

            <!-- 用户档案占位符 - 正常模式 -->
            <div
              v-else-if="element.type === 'user_profile'"
              class="message-card user-profile-placeholder"
              :class="{ disabled: element.isEnabled === false }"
            >
              <!-- 拖拽手柄 -->
              <div class="drag-handle">
                <el-icon><Rank /></el-icon>
              </div>

              <!-- 消息内容 -->
              <div class="message-content">
                <!-- 角色标签 -->
                <div class="message-role">
                  <el-tag type="primary" size="small" effect="plain">
                    <el-icon style="margin-right: 4px">
                      <User />
                    </el-icon>
                    用户档案占位符
                  </el-tag>
                  <!-- Token 数量 -->
                  <el-tag
                    v-if="props.modelId && messageTokens.has(element.id) && element.isEnabled"
                    size="small"
                    type="info"
                    effect="plain"
                    class="token-tag"
                  >
                    {{ messageTokens.get(element.id) }} tokens
                  </el-tag>
                </div>

                <!-- 消息文本预览 -->
                <div class="message-text placeholder-text">当前生效的用户档案内容将在此处插入</div>
              </div>

              <!-- 操作按钮 -->
              <div class="message-actions">
                <el-tooltip content="查看/编辑用户档案" placement="top" :show-after="500">
                  <el-button link size="small" @click="handleViewUserProfile">
                    <el-icon><View /></el-icon>
                  </el-button>
                </el-tooltip>
                <el-switch
                  v-model="element.isEnabled"
                  :active-value="true"
                  :inactive-value="false"
                  size="small"
                  @change="handleToggleEnabled(index)"
                />
              </div>
            </div>
            <!-- 普通预设消息 - 紧凑模式 -->
            <div
              v-else-if="props.compact"
              class="message-card message-card-compact"
              :class="{ disabled: element.isEnabled === false }"
              @click="handleEditMessage(index)"
            >
              <!-- 拖拽手柄 -->
              <div class="drag-handle">
                <el-icon><Rank /></el-icon>
              </div>

              <!-- 角色图标 -->
              <div class="role-icon">
                <el-icon :color="getRoleColor(element.role)">
                  <component :is="getRoleIcon(element.role)" />
                </el-icon>
              </div>

              <!-- 注入策略标记（紧凑） -->
              <span
                v-if="element.injectionStrategy?.depth !== undefined"
                class="injection-badge-compact"
                title="深度注入"
              >
                📍{{ element.injectionStrategy.depth }}
              </span>
              <span
                v-else-if="element.injectionStrategy?.anchorTarget"
                class="injection-badge-compact"
                title="锚点注入"
              >
                ⚓
              </span>

              <!-- 消息文本预览（单行） -->
              <div class="message-text-compact">
                {{ truncateText(element.content, 60) }}
              </div>

              <!-- Token 信息（紧凑模式） -->
              <div v-if="props.modelId && messageTokens.has(element.id)" class="token-compact">
                {{ messageTokens.get(element.id) }}
              </div>

              <!-- 操作按钮 -->
              <div class="message-actions-compact" @click.stop>
                <el-tooltip content="编辑消息" placement="top" :show-after="500">
                  <el-button link size="small" @click="handleEditMessage(index)">
                    <el-icon><Edit /></el-icon>
                  </el-button>
                </el-tooltip>
                <el-switch
                  v-model="element.isEnabled"
                  :active-value="true"
                  :inactive-value="false"
                  size="small"
                  @change="handleToggleEnabled(index)"
                />
              </div>
            </div>

            <!-- 普通预设消息 - 正常模式 -->
            <div v-else class="message-card" :class="{ disabled: element.isEnabled === false }">
              <!-- 拖拽手柄 -->
              <div class="drag-handle">
                <el-icon><Rank /></el-icon>
              </div>

              <!-- 消息内容 -->
              <div class="message-content">
                <!-- 角色标签和 Token 信息 -->
                <div class="message-role">
                  <el-tag :type="getRoleTagType(element.role)" size="small" effect="plain">
                    <el-icon style="margin-right: 4px">
                      <component :is="getRoleIcon(element.role)" />
                    </el-icon>
                    {{ getRoleLabel(element.role) }}
                  </el-tag>
                  <!-- 注入策略标签 -->
                  <el-tag
                    v-if="element.injectionStrategy?.depth !== undefined"
                    size="small"
                    type="warning"
                    effect="plain"
                    class="injection-tag"
                  >
                    📍 深度 {{ element.injectionStrategy.depth }}
                  </el-tag>
                  <el-tag
                    v-else-if="element.injectionStrategy?.anchorTarget"
                    size="small"
                    type="success"
                    effect="plain"
                    class="injection-tag"
                  >
                    ⚓ {{ element.injectionStrategy.anchorTarget }}
                    {{ element.injectionStrategy.anchorPosition === "before" ? "前" : "后" }}
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

                <!-- 消息文本预览 -->
                <div class="message-text">
                  {{ truncateText(element.content, 120) }}
                </div>
              </div>

              <!-- 操作按钮 -->
              <div class="message-actions">
                <el-tooltip content="编辑消息" placement="top" :show-after="500">
                  <el-button link size="small" @click="handleEditMessage(index)">
                    <el-icon><Edit /></el-icon>
                  </el-button>
                </el-tooltip>
                <el-tooltip content="复制消息配置" placement="top" :show-after="500">
                  <el-button link size="small" @click="handleCopyMessage(index)">
                    <el-icon><CopyDocument /></el-icon>
                  </el-button>
                </el-tooltip>
                <el-popconfirm
                  title="确定要用剪贴板内容覆盖这条消息吗？"
                  @confirm="handlePasteMessage(index)"
                  width="220"
                >
                  <template #reference>
                    <el-tooltip content="粘贴并覆盖" placement="top" :show-after="500">
                      <el-button link size="small">
                        <el-icon><DocumentCopy /></el-icon>
                      </el-button>
                    </el-tooltip>
                  </template>
                </el-popconfirm>
                <el-popconfirm
                  title="确定要删除这条预设消息吗？"
                  @confirm="handleDeleteMessage(index)"
                  width="240"
                >
                  <template #reference>
                    <el-tooltip content="删除消息" placement="top" :show-after="500">
                      <el-button link size="small" type="danger">
                        <el-icon><Delete /></el-icon>
                      </el-button>
                    </el-tooltip>
                  </template>
                </el-popconfirm>
                <el-switch
                  v-model="element.isEnabled"
                  :active-value="true"
                  :inactive-value="false"
                  size="small"
                  @change="handleToggleEnabled(index)"
                />
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
    </div>

    <!-- 消息编辑器 -->
    <PresetMessageEditor
      v-model:visible="editDialogVisible"
      :is-edit-mode="isEditMode"
      :initial-form="editForm"
      :agent-name="props.agentName"
      :user-profile="effectiveUserProfile"
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, toRaw } from "vue";
import { VueDraggableNext } from "vue-draggable-next";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import yaml from "js-yaml";
import { useUserProfileStore } from "../../userProfileStore";
import type { ChatMessageNode, MessageRole, UserProfile } from "../../types";
import { MacroProcessor, createMacroContext } from "../../macro-engine";
import { isPromptFile, parsePromptFile } from "../../services/sillyTavernParser";
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
  View,
  ArrowDown,
} from "@element-plus/icons-vue";
import { ElMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import { tokenCalculatorEngine } from "@/tools/token-calculator/composables/useTokenCalculator";
import PresetMessageEditor from "./PresetMessageEditor.vue";
import EditUserProfileDialog from "../user-profile/EditUserProfileDialog.vue";
import STPresetImportDialog from "./STPresetImportDialog.vue";
import type { LlmThinkRule, RichTextRendererStyleOptions } from "@/tools/rich-text-renderer/types";
import type { ParsedPromptFile } from "../../services/sillyTavernParser";

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
const showUserProfileDialog = ref(false);

// 当前生效的用户档案（智能体绑定 > 全局配置）
const effectiveUserProfile = computed(() => {
  if (props.agent?.userProfileId) {
    return userProfileStore.getProfileById(props.agent.userProfileId) || null;
  }
  return userProfileStore.globalProfile;
});

// 本地消息列表
const localMessages = ref<ChatMessageNode[]>([]);

// 编辑对话框状态
const editDialogVisible = ref(false);
const isEditMode = ref(false);
const editingIndex = ref(-1);
import type { InjectionStrategy } from "../../types";

const editForm = ref<{
  role: MessageRole;
  content: string;
  injectionStrategy?: InjectionStrategy;
}>({
  role: "system",
  content: "",
  injectionStrategy: undefined,
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

// Token 计算
const messageTokens = ref<Map<string, number>>(new Map());
const isCalculatingTokens = ref(false);

// 计算所有消息的 token 数量，并保存到 metadata
const calculateAllTokens = async () => {
  if (!props.modelId) return;

  isCalculatingTokens.value = true;
  const newTokens = new Map<string, number>();
  let hasChanges = false;

  // 创建宏处理上下文
  const macroContext = createMacroContext({
    userName: effectiveUserProfile.value?.name || "User",
    charName: props.agentName || "Assistant",
    userProfile: effectiveUserProfile.value || undefined,
    agent: props.agent as any,
  });
  const macroProcessor = new MacroProcessor();

  for (const message of localMessages.value) {
    // 跳过历史记录占位符（无法预估）
    if (message.type === "chat_history") {
      continue;
    }

    // 处理用户档案占位符
    if (message.type === "user_profile") {
      if (message.isEnabled && effectiveUserProfile.value) {
        try {
          // 模拟 useChatContextBuilder 中的构建逻辑
          const userProfilePrompt = `# 用户档案\n${effectiveUserProfile.value.content}`;

          // 使用 MacroProcessor 进行宏替换
          const processed = await macroProcessor.process(userProfilePrompt, macroContext);

          const result = await tokenCalculatorEngine.calculateTokens(
            processed.output,
            props.modelId
          );
          newTokens.set(message.id, result.count);
        } catch (error) {
          console.error(`Failed to calculate tokens for user profile:`, error);
        }
      }
      continue;
    }

    // 处理普通消息
    try {
      // 先进行宏替换，再计算 Token
      const processed = await macroProcessor.process(message.content, macroContext);
      const result = await tokenCalculatorEngine.calculateTokens(processed.output, props.modelId);
      newTokens.set(message.id, result.count);

      // 同步更新到消息的 metadata（如果值有变化或不存在）
      if (!message.metadata) {
        message.metadata = {};
      }
      if (message.metadata.contentTokens !== result.count) {
        message.metadata.contentTokens = result.count;
        hasChanges = true;
      }
    } catch (error) {
      console.error(`Failed to calculate tokens for message ${message.id}:`, error);
    }
  }

  messageTokens.value = newTokens;
  isCalculatingTokens.value = false;

  // 如果有变化，同步到父组件
  if (hasChanges) {
    syncToParent();
  }
};

// 计算总 token 数
const totalTokens = computed(() => {
  let total = 0;
  for (const count of messageTokens.value.values()) {
    total += count;
  }
  return total;
});

// 监听消息变化，重新计算 token
watch(
  () => [localMessages.value, props.modelId] as const,
  async () => {
    if (props.modelId) {
      await calculateAllTokens();
    }
  },
  { deep: true }
);

// 容器高度
// 容器高度
const containerHeight = computed(() => props.height);

// 监听外部变化
watch(
  () => props.modelValue,
  (newValue) => {
    // 确保所有消息都有唯一ID，并且存在必要的占位符
    const CHAT_HISTORY_PLACEHOLDER_ID = "chat-history-placeholder";
    const USER_PROFILE_PLACEHOLDER_ID = "user-profile-placeholder";

    // 从外部获取消息列表
    let existingMessages = [...(newValue || [])];

    // 检查是否已存在历史消息占位符
    const hasHistoryPlaceholder = existingMessages.some((msg) => msg.type === "chat_history");

    // 检查是否已存在用户档案占位符
    const hasUserProfilePlaceholder = existingMessages.some((msg) => msg.type === "user_profile");

    let needsSync = false;

    // 如果不存在用户档案占位符，创建一个（添加到开头）
    if (!hasUserProfilePlaceholder) {
      const userProfilePlaceholder: ChatMessageNode = {
        id: USER_PROFILE_PLACEHOLDER_ID,
        parentId: null,
        childrenIds: [],
        role: "system",
        content: "用户档案",
        type: "user_profile",
        status: "complete",
        isEnabled: true,
        timestamp: new Date().toISOString(),
      };
      // 将用户档案占位符添加到列表开头
      existingMessages = [userProfilePlaceholder, ...existingMessages];
      needsSync = true;
    }

    // 如果不存在历史消息占位符，创建一个（添加到末尾）
    if (!hasHistoryPlaceholder) {
      const historyPlaceholder: ChatMessageNode = {
        id: CHAT_HISTORY_PLACEHOLDER_ID,
        parentId: null,
        childrenIds: [],
        role: "system",
        content: "聊天历史",
        type: "chat_history",
        status: "complete",
        isEnabled: true,
        timestamp: new Date().toISOString(),
      };
      // 将历史占位符添加到列表末尾
      existingMessages = [...existingMessages, historyPlaceholder];
      needsSync = true;
    }

    localMessages.value = existingMessages;

    // 如果我们添加了占位符，同步到外部
    if (needsSync && existingMessages.length > 0) {
      emit("update:modelValue", existingMessages);
    }
  },
  { immediate: true, deep: true }
);
// 拖拽开始事件
function onDragStart() {
  // 可以在这里添加日志或其他逻辑
}

// 拖拽结束事件 - 同步到外部
function onDragEnd() {
  emit("update:modelValue", localMessages.value);
}

// 同步到外部的辅助函数
function syncToParent() {
  emit("update:modelValue", localMessages.value);
}

/**
 * 获取角色标签类型
 */
function getRoleTagType(role: MessageRole): "success" | "primary" | "info" {
  const typeMap: Record<MessageRole, "success" | "primary" | "info"> = {
    system: "info",
    user: "primary",
    assistant: "success",
  };
  return typeMap[role];
}

/**
 * 获取角色图标
 */
function getRoleIcon(role: MessageRole) {
  const iconMap: Record<MessageRole, any> = {
    system: ChatDotRound,
    user: User,
    assistant: Service,
  };
  return iconMap[role];
}

/**
 * 获取角色标签文本
 */
function getRoleLabel(role: MessageRole): string {
  const labelMap: Record<MessageRole, string> = {
    system: "System",
    user: "User",
    assistant: "Assistant",
  };
  return labelMap[role];
}

/**
 * 获取角色颜色（紧凑模式用）
 */
function getRoleColor(role: MessageRole): string {
  const colorMap: Record<MessageRole, string> = {
    system: "var(--el-color-info)",
    user: "var(--el-color-primary)",
    assistant: "var(--el-color-success)",
  };
  return colorMap[role];
}

/**
 * 截断文本
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

/**
 * 添加消息
 */
function handleAddMessage() {
  isEditMode.value = false;
  editForm.value = {
    role: "system",
    content: "",
    injectionStrategy: undefined,
  };
  editDialogVisible.value = true;
}

/**
 * 编辑消息
 */
function handleEditMessage(index: number) {
  const message = localMessages.value[index];

  // 不允许编辑历史消息占位符和用户档案占位符
  if (message.type === "chat_history") {
    customMessage.warning("历史消息占位符不可编辑");
    return;
  }
  if (message.type === "user_profile") {
    customMessage.warning("用户档案占位符不可编辑");
    return;
  }

  isEditMode.value = true;
  editingIndex.value = index;
  editForm.value = {
    role: message.role,
    content: message.content,
    injectionStrategy: message.injectionStrategy,
  };
  editDialogVisible.value = true;
}

/**
 * 查看/编辑用户档案
 */
function handleViewUserProfile() {
  if (effectiveUserProfile.value) {
    showUserProfileDialog.value = true;
  } else {
    customMessage.info("当前没有生效的用户档案");
  }
}

/**
 * 保存用户档案
 */
function handleSaveUserProfile(updates: Partial<Omit<UserProfile, "id" | "createdAt">>) {
  if (effectiveUserProfile.value) {
    userProfileStore.updateProfile(effectiveUserProfile.value.id, updates);
  }
  showUserProfileDialog.value = false;
}

/**
 * 保存消息（从子组件接收数据）
 */
async function handleSaveMessage(form: {
  role: MessageRole;
  content: string;
  injectionStrategy?: InjectionStrategy;
}) {
  if (isEditMode.value) {
    // 编辑模式：更新现有消息
    const message = localMessages.value[editingIndex.value];
    message.role = form.role;
    message.content = form.content;
    message.injectionStrategy = form.injectionStrategy;

    // 如果有模型ID，重新计算 token
    if (props.modelId) {
      try {
        const result = await tokenCalculatorEngine.calculateTokens(form.content, props.modelId);
        if (!message.metadata) {
          message.metadata = {};
        }
        message.metadata.contentTokens = result.count;
      } catch (error) {
        console.error(`Failed to calculate tokens for edited message:`, error);
      }
    }
  } else {
    // 添加模式：创建新消息
    const newMessage: ChatMessageNode = {
      id: `preset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      parentId: null,
      childrenIds: [],
      content: form.content,
      role: form.role,
      status: "complete",
      type: "message", // 明确标记为普通消息
      isEnabled: true,
      timestamp: new Date().toISOString(),
      injectionStrategy: form.injectionStrategy,
    };

    // 如果有模型ID，计算并保存 token
    if (props.modelId) {
      try {
        const result = await tokenCalculatorEngine.calculateTokens(form.content, props.modelId);
        newMessage.metadata = {
          contentTokens: result.count,
        };
      } catch (error) {
        console.error(`Failed to calculate tokens for new message:`, error);
      }
    }

    // 默认插入到历史记录占位符之前，对新手更友好
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

/**
 * 复制单条消息
 */
async function handleCopyMessage(index: number) {
  const message = localMessages.value[index];
  // 只复制关键字段
  const dataToCopy = {
    role: message.role,
    content: message.content,
    metadata: message.metadata,
  };

  try {
    await writeText(JSON.stringify(dataToCopy, null, 2));
    customMessage.success("消息已复制到剪贴板");
  } catch (error) {
    customMessage.error("复制失败");
    console.error("Copy message error:", error);
  }
}

/**
 * 粘贴单条消息
 */
async function handlePasteMessage(index: number) {
  try {
    const text = await readText();
    if (!text) {
      customMessage.warning("剪贴板为空");
      return;
    }

    let data: any;
    let isStructured = false;

    // 尝试解析为结构化数据
    try {
      data = JSON.parse(text);
      if (data && typeof data === "object" && data.role && data.content) {
        isStructured = true;
      }
    } catch {
      try {
        data = yaml.load(text);
        if (data && typeof data === "object" && data.role && data.content) {
          isStructured = true;
        }
      } catch {
        // 无法解析为 JSON 或 YAML，保持 isStructured 为 false
      }
    }

    const message = localMessages.value[index];

    if (isStructured) {
      // 如果是结构化数据，则覆盖 role, content 和 metadata
      message.role = data.role;
      message.content = data.content;
      if (data.metadata) {
        message.metadata = { ...message.metadata, ...data.metadata };
      }
      customMessage.success("已粘贴并覆盖消息");
    } else {
      // 否则，只将纯文本写入 content
      message.content = text;
      customMessage.success("已粘贴文本内容");
    }

    syncToParent();
  } catch (error) {
    customMessage.error("粘贴失败");
    console.error("Paste message error:", error);
  }
}

/**
 * 删除消息
 */
function handleDeleteMessage(index: number) {
  const message = localMessages.value[index];

  // 不允许删除历史消息占位符和用户档案占位符
  if (message.type === "chat_history") {
    customMessage.warning("历史消息占位符不可删除");
    return;
  }
  if (message.type === "user_profile") {
    customMessage.warning("用户档案占位符不可删除");
    return;
  }

  localMessages.value.splice(index, 1);
  syncToParent();
  customMessage.success("删除成功");
}

/**
 * 切换启用状态
 */
function handleToggleEnabled(_index: number) {
  // 状态已经通过 v-model 自动更新，需要手动同步
  syncToParent();
}

/**
 * 导出预设消息
 */
function handleExport(format: "json" | "yaml" = "json") {
  if (localMessages.value.length === 0) {
    customMessage.warning("没有可导出的预设消息");
    return;
  }

  let dataStr = "";
  let mimeType = "";
  let extension = "";

  if (format === "yaml") {
    dataStr = yaml.dump(toRaw(localMessages.value));
    mimeType = "application/x-yaml";
    extension = "yaml";
  } else {
    dataStr = JSON.stringify(localMessages.value, null, 2);
    mimeType = "application/json";
    extension = "json";
  }

  const dataBlob = new Blob([dataStr], { type: mimeType });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement("a");
  link.href = url;

  // 使用 agent 名称和日期作为文件名
  const agentNamePart = props.agentName ? `${props.agentName}-` : "";
  const datePart = new Date().toISOString().split("T")[0];
  link.download = `${agentNamePart}preset-messages-${datePart}.${extension}`;

  link.click();
  URL.revokeObjectURL(url);

  customMessage.success(`已导出为 ${format.toUpperCase()} 格式`);
}

/**
 * 导入预设消息
 */
function handleImport() {
  importFileInput.value?.click();
}

/**
 * 复制预设消息
 */
async function handleCopy(format: "json" | "yaml" = "json") {
  if (localMessages.value.length === 0) {
    customMessage.warning("没有可复制的预设消息");
    return;
  }
  try {
    let dataStr = "";
    if (format === "yaml") {
      dataStr = yaml.dump(toRaw(localMessages.value));
    } else {
      dataStr = JSON.stringify(toRaw(localMessages.value), null, 2);
    }
    await writeText(dataStr);
    customMessage.success(`预设已作为 ${format.toUpperCase()} 复制到剪贴板`);
  } catch (error) {
    customMessage.error("复制失败");
    console.error("Copy error:", error);
  }
}

/**
 * 粘贴预设消息
 */
async function handlePaste() {
  try {
    const text = await readText();
    if (!text) {
      customMessage.warning("剪贴板为空");
      return;
    }

    let imported: ChatMessageNode[];
    try {
      // 尝试解析为 JSON
      imported = JSON.parse(text);
    } catch (e) {
      try {
        // 尝试解析为 YAML
        imported = yaml.load(text) as ChatMessageNode[];
      } catch (yamlError) {
        customMessage.error("剪贴板内容不是有效的 JSON 或 YAML 格式");
        return;
      }
    }

    // 简单验证
    if (!Array.isArray(imported)) {
      customMessage.error("剪贴板内容格式不正确（应为消息数组）");
      return;
    }

    // 如果当前已有消息（除了占位符），提示确认覆盖
    const hasRealMessages = localMessages.value.some(
      (m) => m.type !== "chat_history" && m.type !== "user_profile"
    );

    if (hasRealMessages) {
      try {
        await ElMessageBox.confirm("粘贴将覆盖当前所有预设消息，确定要继续吗？", "确认粘贴", {
          type: "warning",
          confirmButtonText: "覆盖",
          cancelButtonText: "取消",
        });
      } catch {
        return; // 用户取消
      }
    }

    localMessages.value = imported;
    syncToParent();
    customMessage.success("粘贴成功");
  } catch (error) {
    customMessage.error("无法读取剪贴板");
    console.error("Paste error:", error);
  }
}

/**
 * 处理文件选择
 */
async function handleFileSelected(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  try {
    const content = await file.text();
    let parsed: any;

    try {
      // 优先尝试 JSON
      parsed = JSON.parse(content);
    } catch (e) {
      try {
        // JSON 失败则尝试 YAML
        parsed = yaml.load(content);
      } catch (yamlError) {
        throw new Error("无法解析文件内容：既不是有效的 JSON 也不是有效的 YAML");
      }
    }

    // 检测是否为 SillyTavern 预设文件
    if (isPromptFile(parsed)) {
      await handleSTPresetImport(parsed);
      return;
    }

    // 原有逻辑：导入 ChatMessageNode[] 格式
    if (!Array.isArray(parsed)) {
      throw new Error("文件格式不正确");
    }

    localMessages.value = parsed as ChatMessageNode[];
    syncToParent();
    customMessage.success("导入成功");
  } catch (error) {
    customMessage.error("导入失败：文件格式不正确");
    console.error("Import error:", error);
  } finally {
    // 清空 input，允许重复导入同一文件
    target.value = "";
  }
}

/**
 * 处理 SillyTavern 预设文件导入
 */
async function handleSTPresetImport(file: any) {
  const result = parsePromptFile(file);
  const totalCount =
    result.systemPrompts.length + result.injectionPrompts.length + result.unorderedPrompts.length;

  if (totalCount === 0) {
    customMessage.warning("预设文件中没有可导入的提示词");
    return;
  }

  stImportData.value = result;
  showSTImportDialog.value = true;
}

/**
 * 确认导入 ST 预设
 */
function handleConfirmSTImport(data: {
  systemPrompts: ChatMessageNode[];
  injectionPrompts: ChatMessageNode[];
  unorderedPrompts: ChatMessageNode[];
  parameters: Record<string, any>;
}) {
  const { systemPrompts, injectionPrompts, unorderedPrompts, parameters } = data;
  let importedCount = 0;
  const importedParamsCount = Object.keys(parameters).length;

  // 1. 导入消息
  if (systemPrompts.length > 0 || injectionPrompts.length > 0 || unorderedPrompts.length > 0) {
    // 找到 chat_history 占位符的位置
    const historyIndex = localMessages.value.findIndex((m) => m.type === "chat_history");

    // 追加前置消息：插入到 chat_history 之前
    if (systemPrompts.length > 0) {
      if (historyIndex !== -1) {
        localMessages.value.splice(historyIndex, 0, ...systemPrompts);
      } else {
        // 如果没有 chat_history，追加到末尾
        localMessages.value.push(...systemPrompts);
      }
      importedCount += systemPrompts.length;
    }

    // 追加注入消息：直接追加到末尾（它们有自己的 injectionStrategy）
    if (injectionPrompts.length > 0) {
      localMessages.value.push(...injectionPrompts);
      importedCount += injectionPrompts.length;
    }

    // 追加未排序消息：直接追加到末尾
    if (unorderedPrompts.length > 0) {
      localMessages.value.push(...unorderedPrompts);
      importedCount += unorderedPrompts.length;
    }
  }

  // 2. 导入参数 (如果有)
  if (importedParamsCount > 0 && props.agent) {
    // 暂时：直接修改 props.agent.parameters (如果存在)
    // 更好的做法是 emit 事件通知父组件
    if (props.agent.generationConfig) {
      Object.assign(props.agent.generationConfig, parameters);
      customMessage.success(`已导入 ${importedCount} 条消息和 ${importedParamsCount} 个模型参数`);
    } else {
      customMessage.warning(
        `已导入 ${importedCount} 条消息 (参数导入跳过：Agent 未初始化 generationConfig)`
      );
    }
  } else if (importedCount > 0) {
    customMessage.success(`已导入 ${importedCount} 条消息`);
  }

  showSTImportDialog.value = false;
  syncToParent();
}
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
  padding: 16px;
  border-radius: 8px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border-bottom: 1px solid var(--border-color);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
}

.token-info {
  margin-left: 12px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.messages-container {
  flex: 1;
  overflow: hidden;
  position: relative;
  min-height: 0; /* 确保 flex 子元素可以正确收缩 */
}

.messages-scroll-wrapper {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px;
  box-sizing: border-box;
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 12px; /* 使用 gap 替代每个 wrapper 的 margin-bottom */
}

.message-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
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

.message-card.history-placeholder {
  background: color-mix(in srgb, var(--el-color-warning) 10%, transparent);
  border-color: var(--el-color-warning-light-5);
  border-style: dashed;
}

.message-card.history-placeholder:hover {
  border-color: var(--el-color-warning);
  background: color-mix(in srgb, var(--el-color-warning) 20%, transparent);
}

.placeholder-text {
  color: var(--el-text-color-secondary);
  font-style: italic;
}

.ghost-message {
  opacity: 0.5;
  background: var(--el-color-primary-light-9);
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
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.token-tag {
  font-variant-numeric: tabular-nums;
}

/* 注入策略标签样式 */
.injection-tag {
  font-size: 12px;
}

.injection-badge-compact {
  font-size: 11px;
  color: var(--el-color-warning);
  flex-shrink: 0;
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

/* 紧凑模式样式 */
.agent-preset-editor.compact .messages-scroll-wrapper {
  padding: 8px;
}

.agent-preset-editor.compact .messages-list {
  gap: 8px; /* 紧凑模式下使用更小的间距 */
}

.message-card-compact {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
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

/* 紧凑模式下的空状态 */
.agent-preset-editor.compact .empty-state {
  min-height: 100px;
  font-size: 13px;
}
/* 紧凑模式下的历史消息占位符 */
.history-placeholder-compact {
  background: color-mix(in srgb, var(--el-color-warning) 10%, transparent);
  border-color: var(--el-color-warning-light-5);
  border-style: dashed;
}

.history-placeholder-compact:hover {
  border-color: var(--el-color-warning);
  background: color-mix(in srgb, var(--el-color-warning) 20%, transparent);
}

.history-placeholder-compact .placeholder-text {
  color: var(--el-color-warning-dark-2);
  font-weight: 500;
}

/* 用户档案占位符样式 - 正常模式 */
.message-card.user-profile-placeholder {
  background: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
  border-color: var(--el-color-primary-light-5);
  border-style: dashed;
}

.message-card.user-profile-placeholder:hover {
  border-color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 20%, transparent);
}

/* 用户档案占位符样式 - 紧凑模式 */
.user-profile-placeholder-compact {
  background: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
  border-color: var(--el-color-primary-light-5);
  border-style: dashed;
}

.user-profile-placeholder-compact:hover {
  border-color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 20%, transparent);
}

.user-profile-placeholder-compact .placeholder-text {
  color: var(--el-color-primary-dark-2);
  font-weight: 500;
}
</style>
