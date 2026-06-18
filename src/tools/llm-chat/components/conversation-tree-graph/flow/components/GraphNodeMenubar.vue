<script setup lang="ts">
import { ref, computed, watch } from "vue";
import {
  Copy,
  Eye,
  EyeOff,
  Trash2,
  MessageSquare,
  RefreshCw,
  GitFork,
  AtSign,
  Menu,
  BarChart3,
  Download,
  Hash,
  Wand2,
  Database,
  StepForward,
} from "lucide-vue-next";
import {
  ElTooltip,
  ElPopconfirm,
  ElDropdown,
  ElDropdownMenu,
  ElDropdownItem,
} from "element-plus";
import { useChatInputManager } from "@/tools/llm-chat/composables/input/useChatInputManager";
import { useModelSelectDialog } from "@/composables/useModelSelectDialog";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useAgentStore } from "../../../../stores/agentStore";
import { useLlmChatStore } from "../../../../stores/llmChatStore";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@/utils/logger";
import type { ChatMessageNode } from "../../../../types";
import ExportBranchDialog from "../../../export/ExportBranchDialog.vue";
import MessageDataEditor from "../../../message/MessageDataEditor.vue";

const logger = createModuleLogger("GraphNodeMenubar");

interface Props {
  isEnabled: boolean;
  isActiveLeaf: boolean;
  role: "user" | "assistant" | "system" | "tool";
  modelId?: string;
  profileId?: string;
  messageId: string;
}

interface Emits {
  (e: "copy"): void;
  (e: "toggle-enabled"): void;
  (e: "delete"): void;
  (e: "view-detail", event: MouseEvent): void;
  (e: "regenerate", options?: { modelId?: string; profileId?: string }): void;
  (e: "create-branch"): void;
  (e: "interaction-active-change", active: boolean): void;
  (e: "screenshot"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const store = useLlmChatStore();

const isUserOrAssistant = computed(
  () =>
    props.role === "user" || props.role === "assistant" || props.role === "tool"
);
const isAssistantMessage = computed(() => props.role === "assistant");

// 导出对话框
const showExportDialog = ref(false);

// 数据编辑对话框
const showDataEditor = ref(false);

const isMoreMenuOpen = ref(false);
const isDeleteConfirmOpen = ref(false);

watch(
  [showExportDialog, showDataEditor, isMoreMenuOpen, isDeleteConfirmOpen],
  ([exportVisible, editorVisible, moreMenuOpen, deleteConfirmOpen]) => {
    emit(
      "interaction-active-change",
      exportVisible || editorVisible || moreMenuOpen || deleteConfirmOpen
    );
  }
);

const handleCopy = () => emit("copy");
const handleToggleEnabled = () => emit("toggle-enabled");
const handleDelete = () => emit("delete");
const handleViewDetail = (event: MouseEvent) => emit("view-detail", event);
const handleRegenerate = () => {
  // 检查是否有临时模型
  const inputManager = useChatInputManager();
  const temporaryModel = inputManager.temporaryModel.value;

  if (temporaryModel) {
    emit("regenerate", {
      modelId: temporaryModel.modelId,
      profileId: temporaryModel.profileId,
    });
  } else {
    emit("regenerate");
  }
};
const handleCreateBranch = () => emit("create-branch");

// 续写消息
const handleContinue = () => {
  const inputManager = useChatInputManager();
  const temporaryModel = inputManager.temporaryModel.value;

  if (temporaryModel) {
    store.continueGeneration(props.messageId, {
      modelId: temporaryModel.modelId,
      profileId: temporaryModel.profileId,
    });
  } else {
    store.continueGeneration(props.messageId);
  }
};

// 上下文分析
const handleAnalyzeContext = () => {
  logger.info("上下文分析", { nodeId: props.messageId });
  store.contextAnalyzerNodeId = props.messageId;
  store.contextAnalyzerVisible = true;
};

// 重新计算 Token
const handleRecalculateTokens = async () => {
  const fullSession = store.currentFullSession;
  if (!fullSession) return;

  logger.info("重新计算 Token", { nodeId: props.messageId });
  try {
    await store.recalculateNodeTokens(
      fullSession.index,
      fullSession.detail,
      props.messageId
    );
    customMessage.success("Token 重新计算完成");
  } catch (error) {
    logger.error("重新计算 Token 失败", error, { nodeId: props.messageId });
    customMessage.error("重新计算失败");
  }
};

// 重新解析工具
const handleReparseTools = () => {
  const inputManager = useChatInputManager();
  const temporaryModel = inputManager.temporaryModel.value;

  const temporaryModelPayload = temporaryModel
    ? { modelId: temporaryModel.modelId, profileId: temporaryModel.profileId }
    : null;
  store.reparseNodeTools(props.messageId, {
    temporaryModel: temporaryModelPayload,
  });
};

// 获取当前预设消息列表
const currentPresetMessages = computed(() => {
  if (!agentStore.currentAgentId) return [];
  const agent = agentStore.getAgentById(agentStore.currentAgentId);
  if (!agent?.presetMessages) return [];
  return agent.presetMessages.filter(
    (msg: ChatMessageNode) =>
      msg.isEnabled !== false && msg.type !== "chat_history"
  );
});

// 计算预设消息数量
const presetCount = computed(() => currentPresetMessages.value.length);

// 处理选择模型并重新生成
const { open: openModelSelectDialog } = useModelSelectDialog();
const { getProfileById } = useLlmProfiles();
const agentStore = useAgentStore();

const handleSelectModelAndRegenerate = async () => {
  let currentSelection = null;

  // 确定回显的目标模型：节点自身 -> 临时模型 -> 智能体默认
  let targetModelId = props.modelId;
  let targetProfileId = props.profileId;

  // 1. 如果节点没有模型信息，尝试使用输入框的临时模型
  if (!targetModelId || !targetProfileId) {
    const inputManager = useChatInputManager();
    if (inputManager.temporaryModel.value) {
      targetModelId = inputManager.temporaryModel.value.modelId;
      targetProfileId = inputManager.temporaryModel.value.profileId;
    }
  }

  // 2. 如果还是没有，尝试使用当前智能体的默认模型
  if (!targetModelId || !targetProfileId) {
    if (agentStore.currentAgentId) {
      const agent = agentStore.getAgentById(agentStore.currentAgentId);
      if (agent) {
        targetModelId = agent.modelId;
        targetProfileId = agent.profileId;
      }
    }
  }

  // 构建选中状态对象
  if (targetProfileId && targetModelId) {
    const profile = getProfileById(targetProfileId);
    if (profile) {
      const model = profile.models.find((m) => m.id === targetModelId);
      if (model) {
        currentSelection = { profile, model };
      }
    }
  }

  const result = await openModelSelectDialog({
    current: currentSelection,
    initialCapabilities: { embedding: false, rerank: false },
  });
  if (result) {
    emit("regenerate", {
      modelId: result.model.id,
      profileId: result.profile.id,
    });
  }
};
</script>

<template>
  <div class="graph-node-menubar">
    <!-- 查看详情 -->
    <el-tooltip content="查看详情" placement="bottom" :show-after="300">
      <button class="menu-btn" @click="handleViewDetail">
        <MessageSquare :size="16" />
      </button>
    </el-tooltip>

    <!-- 更多菜单 -->
    <el-tooltip content="更多操作" placement="bottom" :show-after="300">
      <div>
        <el-dropdown
          trigger="click"
          placement="bottom"
          @visible-change="(visible: boolean) => (isMoreMenuOpen = visible)"
        >
          <button class="menu-btn">
            <Menu :size="16" />
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                v-if="isUserOrAssistant"
                @click="handleContinue"
              >
                <div class="dropdown-item-content">
                  <StepForward :size="16" />
                  <span>续写消息</span>
                </div>
              </el-dropdown-item>
              <el-dropdown-item @click="handleAnalyzeContext">
                <div class="dropdown-item-content">
                  <BarChart3 :size="16" />
                  <span>上下文分析</span>
                </div>
              </el-dropdown-item>
              <el-dropdown-item @click="showExportDialog = true">
                <div class="dropdown-item-content">
                  <Download :size="16" />
                  <span>导出分支</span>
                </div>
              </el-dropdown-item>
              <el-dropdown-item
                v-if="isUserOrAssistant"
                @click="handleRecalculateTokens"
              >
                <div class="dropdown-item-content">
                  <Hash :size="16" />
                  <span>重新计算 Token</span>
                </div>
              </el-dropdown-item>
              <el-dropdown-item
                v-if="isAssistantMessage"
                @click="handleReparseTools"
              >
                <div class="dropdown-item-content">
                  <Wand2 :size="16" />
                  <span>重新解析工具</span>
                </div>
              </el-dropdown-item>
              <el-dropdown-item @click="showDataEditor = true">
                <div class="dropdown-item-content">
                  <Database :size="16" />
                  <span>数据编辑 (高级)</span>
                </div>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </el-tooltip>

    <!-- 复制内容 -->
    <el-tooltip content="复制内容" placement="bottom" :show-after="300">
      <button class="menu-btn" @click="handleCopy">
        <Copy :size="16" />
      </button>
    </el-tooltip>

    <!-- 创建分支 -->
    <el-tooltip
      v-if="isUserOrAssistant"
      content="创建分支"
      placement="bottom"
      :show-after="300"
    >
      <button class="menu-btn" @click="handleCreateBranch">
        <GitFork :size="16" />
      </button>
    </el-tooltip>

    <!-- 重新生成 -->
    <el-tooltip
      v-if="isUserOrAssistant"
      :content="role === 'user' ? '重新生成回复' : '重新生成'"
      placement="bottom"
      :show-after="300"
    >
      <button class="menu-btn" @click="handleRegenerate">
        <RefreshCw :size="16" />
      </button>
    </el-tooltip>

    <!-- 指定模型重新生成 -->
    <el-tooltip
      v-if="isUserOrAssistant"
      content="指定模型重新生成"
      placement="bottom"
      :show-after="300"
    >
      <button class="menu-btn" @click="handleSelectModelAndRegenerate">
        <AtSign :size="16" />
      </button>
    </el-tooltip>

    <!-- 启用/禁用 -->
    <el-tooltip
      :content="isEnabled ? '禁用此消息' : '启用此消息'"
      placement="bottom"
      :show-after="300"
    >
      <button
        class="menu-btn"
        :class="{ 'menu-btn-highlight': !isEnabled }"
        @click="handleToggleEnabled"
      >
        <Eye v-if="!isEnabled" :size="16" />
        <EyeOff v-else :size="16" />
      </button>
    </el-tooltip>

    <!-- 删除 -->
    <el-popconfirm
      v-model:visible="isDeleteConfirmOpen"
      title="确定要删除此节点吗？"
      confirm-button-text="删除"
      cancel-button-text="取消"
      confirm-button-type="danger"
      width="200"
      @confirm="handleDelete"
    >
      <template #reference>
        <div class="delete-btn-wrapper">
          <el-tooltip content="删除节点" placement="bottom" :show-after="300">
            <button class="menu-btn menu-btn-danger">
              <Trash2 :size="16" />
            </button>
          </el-tooltip>
        </div>
      </template>
    </el-popconfirm>

    <!-- 导出对话框 -->
    <ExportBranchDialog
      v-if="showExportDialog"
      v-model:visible="showExportDialog"
      :preset-count="presetCount"
      :session="store.currentSessionDetail"
      :session-index="store.currentSession"
      :message-id="props.messageId"
      :preset-messages="currentPresetMessages"
      @screenshot="emit('screenshot')"
    />

    <!-- 数据编辑对话框 -->
    <MessageDataEditor
      v-if="showDataEditor"
      v-model="showDataEditor"
      :message-id="props.messageId"
    />
  </div>
</template>

<style scoped>
.graph-node-menubar {
  position: absolute;
  bottom: -48px;
  left: 50%;
  transform: translateX(-50%) scale(var(--graph-menubar-scale, 1));
  transform-origin: center top;
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 1;
  transition: opacity 0.2s ease;
  padding: 4px;
  border-radius: 8px;
  background-color: var(--container-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 10;
}

.menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background-color: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.menu-btn:hover {
  background-color: var(--hover-bg);
  color: var(--text-color);
}

.menu-btn-highlight {
  background-color: var(--primary-color);
  color: white;
}

.menu-btn-highlight:hover {
  opacity: 0.8;
}

.menu-btn-danger:hover {
  background-color: var(--error-color);
  color: white;
}

.delete-btn-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
}

.dropdown-item-content {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
</style>
