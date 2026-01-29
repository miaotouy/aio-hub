<script lang="ts">
export interface InputToolbarSettings {
  showTokenUsage: boolean;
  enableMacroParsing: boolean;
  extractBase64FromPaste: boolean;
  groupQuickActionsBySet: boolean;
}
</script>

<script setup lang="ts">
import {
  ElTooltip,
  ElPopover,
  ElDropdown,
  ElDropdownMenu,
  ElDropdownItem,
  ElSwitch,
  ElIcon,
} from "element-plus";
import {
  Paperclip,
  AtSign,
  X,
  Settings,
  Languages,
  MessageSquare,
  Package,
  MoreHorizontal,
  Sparkles,
  Grip,
} from "lucide-vue-next";
import { MagicStick } from "@element-plus/icons-vue";
import MacroSelector from "../agent/MacroSelector.vue";
import MiniSessionList from "./MiniSessionList.vue";
import type { ContextPreviewData } from "../../types/context";
import type { MacroDefinition } from "../../macro-engine";
import type { ModelIdentifier } from "../../types";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useQuickActionStore } from "../../stores/quickActionStore";
import { useAgentStore } from "../../stores/agentStore";
import { useUserProfileStore } from "../../stores/userProfileStore";
import { useChatSettings } from "../../composables/settings/useChatSettings";
import type { QuickAction, QuickActionSet } from "../../types/quick-action";
import { computed, ref, onMounted, defineAsyncComponent } from "vue";

const QuickActionManagerDialog = defineAsyncComponent(
  () => import("../quick-action/QuickActionManagerDialog.vue")
);

const quickActionManagerVisible = ref(false);

interface Props {
  isSending: boolean;
  disabled: boolean;
  isDetached?: boolean;
  isExpanded: boolean;
  isStreamingEnabled: boolean;
  macroSelectorVisible: boolean;
  contextStats: ContextPreviewData["statistics"] | null;
  tokenCount: number;
  isCalculatingTokens: boolean;
  tokenEstimated: boolean;
  inputText: string;
  isProcessingAttachments: boolean;
  temporaryModel: ModelIdentifier | null;
  hasAttachments: boolean;
  settings: InputToolbarSettings;
  isTranslating?: boolean;
  translationEnabled?: boolean;
  isCompressing?: boolean;
  continuationModel?: ModelIdentifier | null;
  isCompleting?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isTranslating: false,
  translationEnabled: false,
  isCompressing: false,
  continuationModel: null,
  isCompleting: false,
});

const emit = defineEmits<{
  (e: "toggle-streaming"): void;
  (e: "update:macroSelectorVisible", value: boolean): void;
  (e: "update:settings", value: InputToolbarSettings): void;
  (e: "insert", macro: MacroDefinition): void;
  (e: "toggle-expand"): void;
  (e: "send"): void;
  (e: "abort"): void;
  (e: "trigger-attachment"): void;
  (e: "select-temporary-model"): void;
  (e: "clear-temporary-model"): void;
  (e: "translate-input"): void;
  (e: "switch-session", sessionId: string): void;
  (e: "new-session"): void;
  (e: "compress-context"): void;
  (e: "execute-quick-action", action: QuickAction): void;
  (e: "complete-input", content: string): void;
  (e: "select-continuation-model"): void;
  (e: "clear-continuation-model"): void;
}>();

const { getProfileById } = useLlmProfiles();
const quickActionStore = useQuickActionStore();
const agentStore = useAgentStore();
const profileStore = useUserProfileStore();
const { settings: chatSettings } = useChatSettings();

onMounted(() => {
  quickActionStore.loadQuickActions();
});

/**
 * 计算当前上下文激活的快捷操作组
 */
const activeActionSets = computed(() => {
  const globalIds = chatSettings.value.quickActionSetIds || [];
  const agent = agentStore.currentAgentId
    ? agentStore.getAgentById(agentStore.currentAgentId)
    : null;
  const agentIds = agent?.quickActionSetIds || [];
  const profile = profileStore.globalProfile;
  const profileIds = profile?.quickActionSetIds || [];

  // 合并并去重
  const allIds = Array.from(new Set([...globalIds, ...agentIds, ...profileIds]));

  // 触发异步加载
  if (allIds.length > 0) {
    quickActionStore.ensureSetsLoaded(allIds);
  }

  // 从 store 中获取已加载的组内容
  return allIds
    .map((id) => quickActionStore.loadedSets.get(id))
    .filter(Boolean) as QuickActionSet[];
});

const continuationModelInfo = computed(() => {
  if (!props.continuationModel) return null;
  const profile = getProfileById(props.continuationModel.profileId);
  if (!profile) return null;
  const model = profile.models.find((m) => m.id === props.continuationModel?.modelId);
  if (!model) return null;
  return {
    profileName: profile.name,
    modelName: model.name || model.id,
  };
});

const temporaryModelInfo = computed(() => {
  if (!props.temporaryModel) return null;
  const profile = getProfileById(props.temporaryModel.profileId);
  if (!profile) return null;
  const model = profile.models.find((m) => m.id === props.temporaryModel?.modelId);
  if (!model) return null;
  return {
    profileName: profile.name,
    modelName: model.name || model.id,
  };
});

const onMacroSelectorUpdate = (visible: boolean) => {
  emit("update:macroSelectorVisible", visible);
};

const sessionListVisible = ref(false);
const miniSessionListRef = ref<any>(null);

const handleSessionListShow = () => {
  // 气泡显示后，延迟一点点触发滚动，确保容器高度已计算
  setTimeout(() => {
    miniSessionListRef.value?.scrollToCurrent();
  }, 100);
};

const handleSwitchSession = (sessionId: string) => {
  emit("switch-session", sessionId);
  sessionListVisible.value = false;
};

const handleNewSession = () => {
  emit("new-session");
  sessionListVisible.value = false;
};
</script>

<template>
  <div class="input-toolbar-container">
    <!-- 快捷操作平铺栏 (参考酒馆设计) -->
    <div
      v-if="activeActionSets.length > 0"
      class="quick-actions-bar"
      :class="{ 'is-grouped': props.settings.groupQuickActionsBySet }"
    >
      <template v-for="(set, index) in activeActionSets" :key="set.id">
        <!-- 非分组模式下的组间分割线 -->
        <div
          v-if="!props.settings.groupQuickActionsBySet && index > 0"
          class="qa-set-divider"
        ></div>

        <div class="qa-set-group">
          <button
            v-for="action in set.actions"
            :key="action.id"
            class="qa-action-btn"
            @click="emit('execute-quick-action', action)"
            :title="action.description || action.label"
          >
            <component :is="action.icon" v-if="action.icon" :size="12" class="qa-btn-icon" />
            <span class="qa-btn-label">{{ action.label }}</span>
          </button>
        </div>
      </template>
    </div>

    <div class="input-bottom-bar">
      <div class="tool-actions">
        <span v-if="props.isProcessingAttachments" class="processing-hint"> 正在处理文件... </span>
        <span v-if="props.isCompressing" class="processing-hint compressing">
          <el-icon class="is-loading"><Package /></el-icon>
          正在压缩上下文...
        </span>
        <el-tooltip
          :content="
            props.isStreamingEnabled ? '流式输出：实时显示生成内容' : '非流式输出：等待完整响应'
          "
          placement="top"
          :show-after="500"
        >
          <button
            class="streaming-icon-button"
            :class="{ active: props.isStreamingEnabled }"
            :disabled="props.isSending"
            @click="emit('toggle-streaming')"
          >
            <span class="typewriter-icon">A_</span>
          </button>
        </el-tooltip>

        <!-- 宏选择器按钮 -->
        <el-tooltip content="添加宏变量" placement="top" :show-after="1500">
          <div>
            <el-popover
              :visible="props.macroSelectorVisible"
              @update:visible="onMacroSelectorUpdate"
              :placement="props.isDetached ? 'top-start' : 'bottom-start'"
              :width="300"
              trigger="click"
              popper-class="macro-selector-popover"
            >
              <template #reference>
                <button class="macro-icon-button" :class="{ active: props.macroSelectorVisible }">
                  <el-icon><MagicStick /></el-icon>
                </button>
              </template>
              <MacroSelector @insert="(macro: MacroDefinition) => emit('insert', macro)" />
            </el-popover>
          </div>
        </el-tooltip>

        <!-- 添加附件按钮 -->
        <el-tooltip content="添加附件" placement="top" :show-after="500">
          <button class="attachment-button" @click="emit('trigger-attachment')">
            <el-icon><Paperclip /></el-icon>
          </button>
        </el-tooltip>

        <!-- 会话列表按钮 -->
        <el-tooltip content="切换会话" placement="top" :show-after="2500">
          <div>
            <el-popover
              v-model:visible="sessionListVisible"
              :placement="props.isDetached ? 'top-start' : 'bottom-start'"
              :width="300"
              trigger="click"
              popper-class="session-list-popover"
              @show="handleSessionListShow"
            >
              <template #reference>
                <button class="tool-btn" :class="{ active: sessionListVisible }">
                  <MessageSquare :size="16" />
                </button>
              </template>
              <MiniSessionList
                ref="miniSessionListRef"
                @switch="handleSwitchSession"
                @new-session="handleNewSession"
              />
            </el-popover>
          </div>
        </el-tooltip>
        <!-- 临时模型选择器 -->
        <el-tooltip content="临时指定模型" placement="top" :show-after="500">
          <button class="tool-btn" @click="emit('select-temporary-model')">
            <AtSign :size="16" />
          </button>
        </el-tooltip>

        <!-- 快捷操作管理按钮 -->
        <el-tooltip content="管理快捷操作" placement="top" :show-after="500">
          <button class="tool-btn" @click="quickActionManagerVisible = true">
            <Grip :size="16" />
          </button>
        </el-tooltip>

        <!-- 更多工具菜单 -->
        <el-dropdown trigger="click" placement="top">
          <button class="tool-btn">
            <MoreHorizontal :size="16" />
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <!-- 智能补全 -->
              <el-dropdown-item
                :disabled="
                  props.isSending || props.isCompleting || props.disabled || !props.inputText.trim()
                "
                @click="emit('complete-input', props.inputText)"
              >
                <div class="dropdown-item-content">
                  <Sparkles :size="16" class="sparkles-icon" />
                  <span>智能补全</span>
                  <span v-if="props.isCompleting" class="loading-dots">...</span>
                </div>
              </el-dropdown-item>

              <!-- 补全模型设置 -->
              <el-dropdown-item
                :disabled="
                  props.isSending || props.isCompleting || props.disabled || !props.inputText.trim()
                "
                @click="emit('select-continuation-model')"
              >
                <div class="dropdown-item-content">
                  <AtSign :size="16" />
                  <span>指定补全模型</span>
                  <span v-if="continuationModelInfo" class="model-badge">
                    {{ continuationModelInfo.modelName }}
                  </span>
                </div>
              </el-dropdown-item>

              <div class="dropdown-divider"></div>

              <!-- 翻译 -->
              <el-dropdown-item
                v-if="props.translationEnabled"
                :disabled="props.isTranslating || !props.inputText.trim()"
                @click="emit('translate-input')"
              >
                <div class="dropdown-item-content">
                  <Languages :size="16" />
                  <span>翻译输入</span>
                  <span v-if="props.isTranslating" class="loading-dots">...</span>
                </div>
              </el-dropdown-item>

              <!-- 压缩 -->
              <el-dropdown-item
                :disabled="props.isCompressing || props.disabled"
                @click="emit('compress-context')"
              >
                <div class="dropdown-item-content">
                  <Package :size="16" />
                  <span>压缩上下文</span>
                  <span v-if="props.isCompressing" class="loading-dots">...</span>
                </div>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <!-- 设置菜单 -->
        <el-tooltip content="工具栏设置" placement="top" :show-after="500">
          <div>
            <el-popover
              placement="top"
              :width="240"
              trigger="click"
              popper-class="toolbar-settings-popover"
            >
              <template #reference>
                <button class="tool-btn settings-btn">
                  <Settings :size="16" />
                </button>
              </template>
              <div class="toolbar-settings-content">
                <div class="setting-item">
                  <span class="setting-label">显示 Token 统计</span>
                  <el-switch
                    :model-value="props.settings.showTokenUsage"
                    @update:model-value="
                      (val: boolean | string | number) =>
                        emit('update:settings', {
                          ...props.settings,
                          showTokenUsage: val as boolean,
                        })
                    "
                    size="small"
                  />
                </div>
                <div class="setting-item">
                  <span class="setting-label">启用输入宏解析</span>
                  <el-switch
                    :model-value="props.settings.enableMacroParsing"
                    @update:model-value="
                      (val: boolean | string | number) =>
                        emit('update:settings', {
                          ...props.settings,
                          enableMacroParsing: val as boolean,
                        })
                    "
                    size="small"
                  />
                </div>
                <div class="setting-item">
                  <span class="setting-label">粘贴时提取 Base64 图像</span>
                  <el-switch
                    :model-value="props.settings.extractBase64FromPaste"
                    @update:model-value="
                      (val: boolean | string | number) =>
                        emit('update:settings', {
                          ...props.settings,
                          extractBase64FromPaste: val as boolean,
                        })
                    "
                    size="small"
                  />
                </div>
                <div class="setting-item">
                  <span class="setting-label">快捷按钮按组分行</span>
                  <el-switch
                    :model-value="props.settings.groupQuickActionsBySet"
                    @update:model-value="
                      (val: boolean | string | number) =>
                        emit('update:settings', {
                          ...props.settings,
                          groupQuickActionsBySet: val as boolean,
                        })
                    "
                    size="small"
                  />
                </div>
              </div>
            </el-popover>
          </div>
        </el-tooltip>

        <el-tooltip
          v-if="!props.isDetached"
          :content="props.isExpanded ? '收起输入框' : '展开输入框'"
          placement="top"
          :show-after="500"
        >
          <button
            class="expand-toggle-button"
            :class="{ active: props.isExpanded }"
            @click="emit('toggle-expand')"
          >
            <svg
              v-if="!props.isExpanded"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"
              />
            </svg>
            <svg
              v-else
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"
              />
            </svg>
          </button>
        </el-tooltip>
      </div>
      <div class="input-actions">
        <!-- 续写模型显示 -->
        <el-tooltip
          v-if="continuationModelInfo"
          :content="`续写模型: ${continuationModelInfo.profileName} - ${continuationModelInfo.modelName}`"
          placement="top"
          :show-after="500"
        >
          <div class="temporary-model-indicator continuation-model">
            <Sparkles :size="14" />
            <span class="model-name">
              {{ continuationModelInfo.modelName }}
            </span>
            <button class="clear-btn" @click="emit('clear-continuation-model')">
              <X :size="14" />
            </button>
          </div>
        </el-tooltip>
        <!-- 临时模型显示 -->
        <el-tooltip
          v-if="temporaryModelInfo"
          :content="`临时模型: ${temporaryModelInfo.profileName} - ${temporaryModelInfo.modelName}`"
          placement="top"
          :show-after="500"
        >
          <div class="temporary-model-indicator">
            <AtSign :size="14" />
            <span class="model-name">
              {{ temporaryModelInfo.modelName }}
            </span>
            <button class="clear-btn" @click="emit('clear-temporary-model')">
              <X :size="14" />
            </button>
          </div>
        </el-tooltip>
        <!-- 历史上下文统计 -->
        <el-tooltip
          v-if="
            props.settings.showTokenUsage &&
            props.contextStats &&
            props.contextStats.totalTokenCount !== undefined
          "
          placement="top"
          :show-after="500"
        >
          <template #content>
            <div style="text-align: left; line-height: 1.6">
              <div style="font-weight: 600; margin-bottom: 4px">历史上下文统计</div>
              <div style="font-size: 12px">
                <div>总计: {{ props.contextStats.totalTokenCount.toLocaleString() }} tokens</div>
                <div v-if="props.contextStats.presetMessagesTokenCount">
                  预设消息:
                  {{ props.contextStats.presetMessagesTokenCount.toLocaleString() }} tokens
                </div>
                <div v-if="props.contextStats.worldbookTokenCount">
                  世界书: {{ props.contextStats.worldbookTokenCount.toLocaleString() }} tokens
                </div>
                <div v-if="props.contextStats.chatHistoryTokenCount">
                  会话历史: {{ props.contextStats.chatHistoryTokenCount.toLocaleString() }} tokens
                </div>
                <div v-if="props.contextStats.postProcessingTokenCount">
                  后处理: {{ props.contextStats.postProcessingTokenCount.toLocaleString() }} tokens
                </div>
                <div
                  v-if="props.contextStats.truncatedMessageCount"
                  style="color: var(--el-color-warning); margin-top: 2px"
                >
                  已截断: {{ props.contextStats.truncatedMessageCount }} 条消息
                  <span v-if="props.contextStats.savedTokenCount">
                    (省 {{ props.contextStats.savedTokenCount.toLocaleString() }} tokens)
                  </span>
                </div>
                <div v-if="props.contextStats.tokenizerName" style="margin-top: 4px; opacity: 0.8">
                  {{ props.contextStats.isEstimated ? "字符估算" : "Token 计算" }} -
                  {{ props.contextStats.tokenizerName }}
                </div>
              </div>
            </div>
          </template>
          <span class="token-count context-total">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              style="margin-right: 4px"
            >
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            </svg>
            <span
              >{{ props.contextStats.totalTokenCount.toLocaleString()
              }}{{ props.contextStats.isEstimated ? "~" : "" }}</span
            >
          </span>
        </el-tooltip>
        <!-- 当前输入 Token 计数显示 -->
        <el-tooltip
          v-if="
            props.settings.showTokenUsage && (props.tokenCount > 0 || props.isCalculatingTokens)
          "
          :content="props.tokenEstimated ? '当前输入 Token 数量（估算值）' : '当前输入 Token 数量'"
          placement="top"
          :show-after="500"
        >
          <span class="token-count input-tokens">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              style="margin-right: 4px"
            >
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
            <span>
              {{ props.tokenCount.toLocaleString() }}{{ props.tokenEstimated ? "~" : "" }}
            </span>
          </span>
        </el-tooltip>
        <button
          v-if="!props.isSending"
          @click="emit('send')"
          :disabled="props.disabled || (!props.inputText.trim() && !props.hasAttachments)"
          class="btn-send"
          title="发送 (Ctrl/Cmd + Enter)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="12" y1="19" x2="12" y2="5"></line>
            <polyline points="5 12 12 5 19 12"></polyline>
          </svg>
        </button>
        <button v-else @click="emit('abort')" class="btn-abort" title="停止生成">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          </svg>
        </button>
      </div>
    </div>
  </div>

  <!-- 快捷操作管理弹窗 -->
  <QuickActionManagerDialog v-model:visible="quickActionManagerVisible" />
</template>

<style scoped>
.processing-hint {
  font-size: 12px;
  color: var(--primary-color);
  display: flex;
  align-items: center;
  gap: 4px;
}

.token-count {
  font-size: 12px;
  color: var(--text-color-secondary);
  display: flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--el-fill-color-light);
  font-variant-numeric: tabular-nums;
  user-select: none;
  cursor: help;
}

.token-count svg {
  flex-shrink: 0;
}

/* 历史上下文统计样式 */
.token-count.context-total {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--el-color-primary) 10%, transparent),
    color-mix(in srgb, var(--el-color-primary) 5%, transparent)
  );
  border: 1px solid color-mix(in srgb, var(--el-color-primary) 30%, transparent);
  color: var(--el-color-primary);
  font-weight: 500;
}

/* 当前输入 token 样式 */
.token-count.input-tokens {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--el-color-success) 10%, transparent),
    color-mix(in srgb, var(--el-color-success) 5%, transparent)
  );
  border: 1px solid color-mix(in srgb, var(--el-color-success) 30%, transparent);
  color: var(--el-color-success);
  font-weight: 500;
}

.input-toolbar-container {
  display: flex;
  flex-direction: column;
  width: 100%;
}

/* 快捷操作平铺栏样式 */
.quick-actions-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--border-color);
  background: rgba(var(--el-fill-color-light-rgb), 0.3);
  min-height: 32px;
  align-items: center;
}

.quick-actions-bar.is-grouped {
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  padding: 6px 8px;
}

.qa-set-group {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.qa-set-divider {
  width: 1px;
  height: 14px;
  background-color: var(--border-color);
  margin: 0 4px;
  opacity: 0.6;
}

.quick-actions-bar.is-grouped .qa-set-group {
  padding-bottom: 4px;
  border-bottom: 1px dashed var(--border-color);
}

.quick-actions-bar.is-grouped .qa-set-group:last-of-type {
  border-bottom: none;
  padding-bottom: 0;
}

.qa-action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  height: 22px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--card-bg);
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--text-color-secondary);
  font-size: 11px;
}

.qa-action-btn:hover {
  background: var(--el-fill-color-light);
  border-color: var(--primary-color);
  color: var(--primary-color);
  transform: translateY(-1px);
}

.qa-action-btn.manage-btn {
  padding: 2px 4px;
  opacity: 0.6;
}

.qa-action-btn.manage-btn:hover {
  opacity: 1;
}

.qa-btn-icon {
  opacity: 0.8;
}

.input-bottom-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 8px 4px 2px;
  flex-wrap: wrap;
  gap: 4px 0;
}

.tool-actions {
  display: flex;
  gap: 2px;
  align-items: center;
  color: var(--text-color-light);
  flex-wrap: wrap;
  min-width: 0;
  flex: 1 1 auto;
}

/* 流式输出图标按钮 */
.streaming-icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
}

.streaming-icon-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 打字机图标 "A_" */
.typewriter-icon {
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Fira Sans",
    "Droid Sans", "Helvetica Neue", sans-serif;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -2px;
  color: var(--text-color-secondary);
  transition: all 0.3s ease;
  position: relative;
  top: -1.5px; /* 微调垂直对齐 */
  display: inline-block;
}

/* 非激活状态：暗淡灰色 */
.streaming-icon-button:not(.active) .typewriter-icon {
  color: var(--text-color-secondary);
  opacity: 0.5;
}

.streaming-icon-button:not(.active):hover:not(:disabled) {
  background-color: var(--el-fill-color-light);
}

.streaming-icon-button:not(.active):hover:not(:disabled) .typewriter-icon {
  opacity: 0.8;
}

/* 激活状态：主题色 + 辉光效果 */
.streaming-icon-button.active .typewriter-icon {
  color: var(--primary-color);
  opacity: 1;
}

.streaming-icon-button.active:hover:not(:disabled) {
  background-color: rgba(var(--primary-color-rgb, 64, 158, 255), 0.15);
}

/* 辉光效果 */
.streaming-icon-button.active .typewriter-icon {
  text-shadow:
    0 0 4px rgba(var(--primary-color-rgb, 64, 158, 255), 0.5),
    0 0 6px rgba(var(--primary-color-rgb, 64, 158, 255), 0.3);
}

/* 光标闪烁动画（仅在激活时） - 半透明轻微闪烁 */
@keyframes cursor-blink {
  0%,
  49% {
    opacity: 0.5;
  }
  50%,
  100% {
    opacity: 0.2;
  }
}

.streaming-icon-button.active .typewriter-icon::after {
  content: "";
  display: inline-block;
  width: 2px;
  height: 12px;
  background-color: var(--primary-color);
  margin-left: 0px;
  animation: cursor-blink 1s infinite;
  vertical-align: baseline;
  position: relative;
  bottom: -1px;
}

.input-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-left: auto;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.btn-send,
.btn-abort {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-send {
  background-color: var(--primary-color);
  color: white;
}

.btn-send:hover:not(:disabled) {
  background-color: var(--primary-hover-color);
  transform: translateY(-1px);
}

.btn-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.btn-abort {
  background-color: var(--error-color);
  color: white;
}

.btn-abort:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* 统一工具栏图标按钮样式 */
.tool-btn,
.macro-icon-button,
.attachment-button,
.expand-toggle-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  transition: all 0.3s ease;
  color: var(--text-color-secondary);
  font-size: 16px;
}

.tool-btn:disabled,
.macro-icon-button:disabled,
.attachment-button:disabled,
.expand-toggle-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tool-btn:hover:not(:disabled),
.macro-icon-button:not(.active):hover:not(:disabled),
.attachment-button:hover:not(:disabled),
.expand-toggle-button:not(.active):hover:not(:disabled) {
  background-color: var(--el-fill-color-light);
  color: var(--text-color-primary);
}

.tool-btn.is-loading {
  cursor: wait;
  opacity: 0.7;
}

.loading-dots {
  font-size: 12px;
  font-weight: bold;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% {
    opacity: 0.3;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0.3;
  }
}

.macro-icon-button.active,
.expand-toggle-button.active {
  background-color: rgba(var(--primary-color-rgb, 64, 158, 255), 0.15);
  color: var(--primary-color);
}

.temporary-model-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 12px;
  background: rgba(var(--el-color-primary-rgb), 0.1);
  color: var(--el-color-primary);
  font-size: 12px;
  font-weight: 500;
}

.temporary-model-indicator .model-name {
  max-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.temporary-model-indicator .clear-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background-color: transparent;
  color: var(--el-color-primary);
  cursor: pointer;
  transition: all 0.2s;
}

.temporary-model-indicator .clear-btn:hover {
  background-color: rgba(0, 0, 0, 0.1);
}

.dropdown-item-content {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 160px;
}

.dropdown-divider {
  height: 1px;
  background-color: var(--el-border-color-lighter);
  margin: 4px 0;
}

.model-badge {
  margin-left: auto;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
  background-color: var(--el-fill-color-darker);
  color: var(--text-color-secondary);
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sparkles-icon {
  color: var(--el-color-warning);
}

.continuation-model {
  background: var(--el-color-warning-light-9) !important;
  color: var(--el-color-warning) !important;
}

.continuation-model .clear-btn {
  color: var(--el-color-warning) !important;
}
</style>

<style>
/* 宏选择器弹窗样式 - 全局样式以影响 teleported 的 popover */
.macro-selector-popover {
  max-height: 70vh !important;
  overflow: hidden !important;
}

.macro-selector-popover .el-popover__body {
  padding: 12px;
  max-height: calc(70vh - 24px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.macro-selector-popover .macro-selector {
  max-height: 100%;
  overflow: hidden;
}

.macro-selector-popover .macro-selector-body {
  max-height: calc(70vh - 100px);
  overflow-y: auto;
}

.toolbar-settings-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.quick-actions-menu {
  display: flex;
  flex-direction: column;
}

.action-group {
  margin-bottom: 8px;
}

.group-title {
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.action-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
}

.action-item:hover {
  background-color: var(--el-fill-color-light);
}

.action-icon {
  color: var(--el-text-color-secondary);
}

.action-label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.arrow-icon {
  opacity: 0.5;
}

.manage-item {
  color: var(--el-color-primary);
  margin-top: 4px;
}

.manage-item:hover {
  background-color: rgba(var(--el-color-primary-rgb), 0.1);
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: var(--text-color);
}

.session-list-popover {
  padding: 0 !important;
}

.session-list-popover .el-popover__body {
  padding: 0;
}
</style>
