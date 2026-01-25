<script setup lang="ts">
import { computed } from "vue";
import {
  Copy,
  Eye,
  EyeOff,
  Trash2,
  MessageSquare,
  RefreshCw,
  GitFork,
  AtSign,
} from "lucide-vue-next";
import { ElTooltip, ElPopconfirm } from "element-plus";
import { useChatInputManager } from "@/tools/llm-chat/composables/input/useChatInputManager";
import { useModelSelectDialog } from "@/composables/useModelSelectDialog";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useAgentStore } from "../../../../stores/agentStore";

interface Props {
  isEnabled: boolean;
  isActiveLeaf: boolean;
  zoom: number;
  role: "user" | "assistant" | "system";
  modelId?: string;
  profileId?: string;
}

interface Emits {
  (e: "copy"): void;
  (e: "toggle-enabled"): void;
  (e: "delete"): void;
  (e: "view-detail", event: MouseEvent): void;
  (e: "regenerate", options?: { modelId?: string; profileId?: string }): void;
  (e: "create-branch"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const isUserOrAssistant = computed(() => props.role === "user" || props.role === "assistant");

// 计算反向缩放以保持固定大小,限定在合理范围内
const menubarStyle = computed(() => {
  // 计算反向缩放值
  const inverseScale = 1 / props.zoom;
  // 将缩放值限制在 0.5 到 2 之间，确保在极端缩放下菜单栏不会过大或过小
  // zoom ∈ [0.5, 2] 时，菜单栏能正常保持固定大小
  // zoom < 0.5 或 zoom > 2 时，使用边界值避免菜单栏过大或过小
  const clampedScale = Math.max(0.5, Math.min(2, inverseScale));

  return {
    transform: `translateX(-50%) scale(${clampedScale})`,
    transformOrigin: "center top",
  };
});

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

  const result = await openModelSelectDialog({ current: currentSelection });
  if (result) {
    emit("regenerate", {
      modelId: result.model.id,
      profileId: result.profile.id,
    });
  }
};
</script>

<template>
  <div class="graph-node-menubar" :style="menubarStyle">
    <!-- 查看详情 -->
    <el-tooltip content="查看详情" placement="bottom" :show-after="300">
      <button class="menu-btn" @click="handleViewDetail">
        <MessageSquare :size="16" />
      </button>
    </el-tooltip>

    <!-- 复制内容 -->
    <el-tooltip content="复制内容" placement="bottom" :show-after="300">
      <button class="menu-btn" @click="handleCopy">
        <Copy :size="16" />
      </button>
    </el-tooltip>

    <!-- 创建分支 -->
    <el-tooltip v-if="isUserOrAssistant" content="创建分支" placement="bottom" :show-after="300">
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
  </div>
</template>

<style scoped>
.graph-node-menubar {
  position: absolute;
  bottom: -48px;
  left: 50%;
  /* transform 由 inline style 动态控制 */
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
  padding: 4px;
  border-radius: 8px;
  background-color: var(--container-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
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
</style>
