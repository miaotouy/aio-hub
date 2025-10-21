<script setup lang="ts">
import { computed, ref } from "vue";
import { useAgentStore } from "../../agentStore";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { Plus, Edit, Delete, MoreFilled } from "@element-plus/icons-vue";
import { ElMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import type { ChatAgent, ChatMessageNode } from "../../types";
import CreateAgentDialog from "../agent/CreateAgentDialog.vue";
import EditAgentDialog from "../agent/EditAgentDialog.vue";
import type { AgentPreset } from "../../types";

const agentStore = useAgentStore();

// 按最后使用时间排序的智能体列表
const sortedAgents = computed(() => agentStore.sortedAgents);

// 当前选中的智能体ID（从 store 读取）
const currentAgentId = computed(() => agentStore.currentAgentId);

// 选择智能体（直接调用 store）
const selectAgent = (agentId: string) => {
  agentStore.selectAgent(agentId);
};

// 判断智能体是否被选中
const isAgentSelected = (agentId: string) => {
  return agentId === currentAgentId.value;
};

// 对话框状态
const createDialogVisible = ref(false); // 创建选择对话框
const editDialogVisible = ref(false); // 编辑/创建对话框
const editDialogMode = ref<"create" | "edit">("create");
const editingAgent = ref<ChatAgent | null>(null);
const editDialogInitialData = ref<any>(null);

// 打开创建智能体选择对话框
const handleOpenCreateDialog = () => {
  createDialogVisible.value = true;
};

// 从空白创建
const handleCreateFromBlank = () => {
  const { enabledProfiles } = useLlmProfiles();
  if (enabledProfiles.value.length === 0 || enabledProfiles.value[0].models.length === 0) {
    customMessage.error("没有可用的模型配置，无法创建智能体");
    return;
  }

  // 准备默认数据
  const defaultProfile = enabledProfiles.value[0];
  const defaultModel = defaultProfile.models[0];

  editDialogMode.value = "create";
  editingAgent.value = null;
  editDialogInitialData.value = {
    name: "",
    description: "",
    icon: "🤖",
    profileId: defaultProfile.id,
    modelId: defaultModel.id,
    presetMessages: [
      {
        id: `preset-system-${Date.now()}`,
        parentId: null,
        childrenIds: [],
        content: "你是一个友好且乐于助人的 AI 助手。",
        role: "system",
        status: "complete",
        isEnabled: true,
        timestamp: new Date().toISOString(),
      },
    ],
    temperature: 0.7,
    maxTokens: 4096,
  };

  editDialogVisible.value = true;
};

// 从预设创建
const handleCreateFromPreset = (preset: AgentPreset) => {
  const { enabledProfiles } = useLlmProfiles();
  if (enabledProfiles.value.length === 0 || enabledProfiles.value[0].models.length === 0) {
    customMessage.error("没有可用的模型配置，无法创建智能体");
    return;
  }

  // 使用预设数据准备初始值
  const defaultProfile = enabledProfiles.value[0];
  const defaultModel = defaultProfile.models[0];

  editDialogMode.value = "create";
  editingAgent.value = null;
  editDialogInitialData.value = {
    name: preset.name,
    description: preset.description,
    icon: preset.icon,
    profileId: defaultProfile.id,
    modelId: defaultModel.id,
    // 深度复制 presetMessages，并确保它们有唯一的 ID
    presetMessages: JSON.parse(JSON.stringify(preset.presetMessages)).map((msg: any) => ({
      ...msg,
      id: `preset-${msg.role}-${Date.now()}-${Math.random()}`,
      parentId: null,
      childrenIds: [],
      status: "complete",
      isEnabled: true,
      timestamp: new Date().toISOString(),
    })),
    temperature: preset.parameters.temperature,
    maxTokens: preset.parameters.maxTokens || 4096,
  };

  editDialogVisible.value = true;
};

// 编辑智能体
const handleEdit = (agent: ChatAgent) => {
  editDialogMode.value = "edit";
  editingAgent.value = agent;
  editDialogInitialData.value = null;

  editDialogVisible.value = true;
};

// 保存智能体
const handleSaveAgent = (data: {
  name: string;
  description: string;
  icon: string;
  profileId: string;
  modelId: string;
  presetMessages: ChatMessageNode[];
  parameters: {
    temperature: number;
    maxTokens: number;
  };
}) => {
  if (editDialogMode.value === "edit" && editingAgent.value) {
    // 更新模式
    agentStore.updateAgent(editingAgent.value.id, data);
    customMessage.success("智能体已更新");
  } else {
    // 创建模式
    const newAgentId = agentStore.createAgent(data.name, data.profileId, data.modelId, {
      description: data.description,
      icon: data.icon,
      presetMessages: data.presetMessages,
      parameters: data.parameters,
    });
    customMessage.success(`智能体 "${data.name}" 创建成功`);
    // 自动选中新创建的智能体
    selectAgent(newAgentId);
  }
};

// 删除智能体
const handleDelete = (agent: ChatAgent) => {
  if (agent.isBuiltIn) {
    customMessage.warning("不能删除内置的默认智能体。");
    return;
  }
  ElMessageBox.confirm(`确定要删除智能体 "${agent.name}" 吗？此操作不可撤销。`, "确认删除", {
    confirmButtonText: "删除",
    cancelButtonText: "取消",
    type: "warning",
  })
    .then(() => {
      agentStore.deleteAgent(agent.id);
      customMessage.success("智能体已删除");
    })
    .catch(() => {
      // 用户取消
    });
};
</script>

<template>
  <div class="agents-sidebar-content">
    <div class="agents-list">
      <div v-if="sortedAgents.length === 0" class="empty-state">
        <p>暂无智能体</p>
        <p class="hint">点击下方按钮创建智能体</p>
      </div>

      <div
        v-for="agent in sortedAgents"
        :key="agent.id"
        :class="['agent-item', { selected: isAgentSelected(agent.id) }]"
        @click="selectAgent(agent.id)"
      >
        <div class="agent-icon">
          <img
            v-if="agent.icon && (agent.icon.startsWith('/') || agent.icon.startsWith('appdata://') || agent.icon.startsWith('http'))"
            :src="agent.icon.startsWith('appdata://') ? agent.icon.replace('appdata://', '/') : agent.icon"
            :alt="agent.name"
            class="agent-icon-image"
            @error="(e: Event) => ((e.target as HTMLImageElement).style.display = 'none')"
          />
          <span v-else class="agent-icon-emoji">{{ agent.icon || "🙄" }}</span>
        </div>
        <div class="agent-info">
          <div class="agent-name">{{ agent.name }}</div>
          <!-- 只在选中时显示详细信息 -->
          <template v-if="isAgentSelected(agent.id)">
            <div v-if="agent.description" class="agent-desc">
              {{ agent.description }}
            </div>
          </template>
        </div>
        <!-- 三点菜单 -->
        <div class="agent-actions">
          <el-dropdown trigger="click" @click.stop>
            <el-button text circle :icon="MoreFilled" />
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="handleEdit(agent)">
                  <el-icon><Edit /></el-icon>
                  编辑
                </el-dropdown-item>
                <el-dropdown-item @click="handleDelete(agent)" :disabled="agent.isBuiltIn" divided>
                  <el-icon><Delete /></el-icon>
                  删除
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </div>

    <!-- 底部常驻添加按钮 -->
    <div class="agents-footer">
      <el-button type="primary" @click="handleOpenCreateDialog" :icon="Plus" style="width: 100%">
        添加智能体
      </el-button>
    </div>

    <!-- 创建智能体选择对话框 -->
    <CreateAgentDialog
      v-model:visible="createDialogVisible"
      @create-from-preset="handleCreateFromPreset"
      @create-from-blank="handleCreateFromBlank"
    />

    <!-- 智能体编辑对话框 -->
    <EditAgentDialog
      v-model:visible="editDialogVisible"
      :mode="editDialogMode"
      :agent="editingAgent"
      :initial-data="editDialogInitialData"
      @save="handleSaveAgent"
    />
  </div>
</template>

<style scoped>
.agents-sidebar-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-color-light);
}

.agents-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  padding-bottom: 0;
}

.agents-footer {
  flex-shrink: 0;
  padding: 12px;
  background-color: var(--card-bg);
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-color-light);
}

.empty-state p {
  margin: 0;
}

.empty-state .hint {
  font-size: 12px;
  margin-top: 8px;
  opacity: 0.7;
}

.agent-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background-color: var(--container-bg);
  border-left: 3px solid transparent;
}

.agent-item:hover {
  background-color: var(--hover-bg);
}

.agent-item.selected {
  background-color: rgba(var(--primary-color-rgb), 0.1);
  border-left-color: var(--primary-color);
}

.agent-item:hover .agent-actions {
  opacity: 1;
}

.agent-actions {
  display: flex;
  align-items: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.agent-item.selected .agent-actions {
  opacity: 1;
}

.agent-actions .el-button {
  width: 28px;
  height: 28px;
  font-size: 16px;
}

.agent-icon {
  font-size: 24px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 6px;
  transition: all 0.2s;
}

.agent-item.selected .agent-icon {
  width: 48px;
  height: 48px;
  font-size: 32px;
  border-radius: 8px;
  border-color: rgba(var(--primary-color-rgb), 0.3);
}

.agent-icon-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.agent-icon-emoji {
  font-size: 24px;
  line-height: 1;
}

.agent-info {
  flex: 1;
  min-width: 0;
}

.agent-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
  margin-bottom: 4px;
}

.agent-desc {
  font-size: 11px;
  color: var(--text-color-light);
  margin-top: 4px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 滚动条样式 */
.agents-list::-webkit-scrollbar {
  width: 6px;
}

.agents-list::-webkit-scrollbar-track {
  background: transparent;
}

.agents-list::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb-color);
  border-radius: 3px;
}

.agents-list::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover-color);
}
</style>
