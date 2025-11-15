<script setup lang="ts">
import { computed, ref } from "vue";
import { useAgentStore } from "../../agentStore";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useLlmChatUiState } from "../../composables/useLlmChatUiState";
import { Plus, Edit, Delete, MoreFilled, Search, Download, Upload } from "@element-plus/icons-vue";
import { ElMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import type { ChatAgent, ChatMessageNode } from "../../types";
import CreateAgentDialog from "../agent/CreateAgentDialog.vue";
import EditAgentDialog from "../agent/EditAgentDialog.vue";
import type { AgentPreset } from "../../types";
import ExportAgentDialog from "../export/ExportAgentDialog.vue";
import ImportAgentDialog from "../export/ImportAgentDialog.vue";
import Avatar from "@/components/common/Avatar.vue";
import { useResolvedAvatar } from "../../composables/useResolvedAvatar";

const agentStore = useAgentStore();

// 使用持久化的UI状态
const { agentSortBy } = useLlmChatUiState();

// 搜索状态（不需要持久化）
const searchQuery = ref("");

// 过滤和排序后的智能体列表
const filteredAndSortedAgents = computed(() => {
  let agents = [...agentStore.agents];

  // 搜索过滤
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase().trim();
    agents = agents.filter((agent) => {
      return (
        agent.name.toLowerCase().includes(query) ||
        (agent.description && agent.description.toLowerCase().includes(query)) ||
        (agent.icon && agent.icon.toLowerCase().includes(query))
      );
    });
  }

  // 排序
  agents.sort((a, b) => {
    switch (agentSortBy.value) {
      case "lastUsed":
        const aTime = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
        const bTime = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
        return bTime - aTime;
      case "name":
        return a.name.localeCompare(b.name, undefined, {
          sensitivity: "base",
          numeric: true,
        });
      case "createdAt":
        const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bCreated - aCreated;
      default:
        return 0;
    }
  });

  return agents;
});

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

// 导入导出对话框状态
const exportDialogVisible = ref(false);
const importDialogVisible = ref(false);
const importPreflightResult = ref<any>(null);
const importLoading = ref(false);

// 导出相关
const handleExportAgents = (agentIds: string[], options: { includeAssets: boolean }) => {
  agentStore.exportAgents(agentIds, options);
};

// 导入相关
const handleImportFromFile = async () => {
  try {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".agent.zip,.agent.json";
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      importLoading.value = true;
      try {
        const result = await agentStore.preflightImportAgents(file);
        importPreflightResult.value = result;
        importDialogVisible.value = true;
      } catch (error) {
        // preflightImportAgents 内部已经处理了错误提示
      } finally {
        importLoading.value = false;
      }
    };
    input.click();
  } catch (error) {
    customMessage.error(`打开文件选择器失败: ${error}`);
  }
};

const handleConfirmImport = (resolvedAgents: any[]) => {
  if (!importPreflightResult.value) return;
  agentStore.confirmImportAgents({
    resolvedAgents,
    assets: importPreflightResult.value.assets,
  });
  importDialogVisible.value = false;
  importPreflightResult.value = null;
};

const handleCancelImport = () => {
  importDialogVisible.value = false;
  importPreflightResult.value = null;
};

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
    icon: "",
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
  iconMode: "path" | "builtin";
  profileId: string;
  modelId: string;
  userProfileId: string | null;
  presetMessages: ChatMessageNode[];
  displayPresetCount: number;
  parameters: {
    temperature: number;
    maxTokens: number;
  };
  llmThinkRules: import("@/tools/rich-text-renderer/types").LlmThinkRule[];
}) => {
  if (editDialogMode.value === "edit" && editingAgent.value) {
    // 更新模式
    agentStore.updateAgent(editingAgent.value.id, {
      name: data.name,
      description: data.description,
      icon: data.icon,
      iconMode: data.iconMode,
      profileId: data.profileId,
      modelId: data.modelId,
      userProfileId: data.userProfileId,
      presetMessages: data.presetMessages,
      displayPresetCount: data.displayPresetCount,
      parameters: data.parameters,
      llmThinkRules: data.llmThinkRules,
    });
    customMessage.success("智能体已更新");
  } else {
    // 创建模式
    const newAgentId = agentStore.createAgent(data.name, data.profileId, data.modelId, {
      description: data.description,
      icon: data.icon,
      userProfileId: data.userProfileId,
      presetMessages: data.presetMessages,
      displayPresetCount: data.displayPresetCount,
      parameters: data.parameters,
      llmThinkRules: data.llmThinkRules,
    });
    customMessage.success(`智能体 "${data.name}" 创建成功`);
    // 自动选中新创建的智能体
    selectAgent(newAgentId);
  }
};

const getAvatarSrc = (agent: ChatAgent) => {
  return useResolvedAvatar(ref(agent), "agent").value;
};

// 删除智能体
const handleDelete = (agent: ChatAgent) => {
  ElMessageBox.confirm(`确定要删除智能体 "${agent.name}" 吗？文件将被移入回收站。`, "确认删除", {
    confirmButtonText: "删除",
    cancelButtonText: "取消",
    type: "warning",
  })
    .then(async () => {
      try {
        await agentStore.deleteAgent(agent.id);
        customMessage.success("智能体已删除并移入回收站");
      } catch (error) {
        customMessage.error(`删除智能体失败: ${error}`);
      }
    })
    .catch(() => {
      // 用户取消
    });
};
</script>

<template>
  <div class="agents-sidebar-content">
    <!-- 搜索和排序工具栏 -->
    <div class="agents-toolbar">
      <el-input
        v-model="searchQuery"
        :prefix-icon="Search"
        placeholder="搜索智能体..."
        clearable
        size="small"
      />
      <el-select v-model="agentSortBy" size="small" style="width: 160px">
        <el-option label="最近使用" value="lastUsed" />
        <el-option label="按名称" value="name" />
        <el-option label="创建时间" value="createdAt" />
      </el-select>
    </div>

    <div class="agents-list">
      <div v-if="filteredAndSortedAgents.length === 0 && !searchQuery" class="empty-state">
        <p>暂无智能体</p>
        <p class="hint">点击下方按钮创建智能体</p>
      </div>

      <div v-else-if="filteredAndSortedAgents.length === 0" class="empty-state">
        <p>没有找到匹配的智能体</p>
        <p class="hint">尝试其他搜索关键词</p>
      </div>

      <div
        v-for="agent in filteredAndSortedAgents"
        :key="agent.id"
        :class="['agent-item', { selected: isAgentSelected(agent.id) }]"
        @click="selectAgent(agent.id)"
      >
        <Avatar
          :src="getAvatarSrc(agent) || ''"
          :alt="agent.name"
          :class="['agent-icon', { selected: isAgentSelected(agent.id) }]"
        />
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
        <div class="agent-actions" @click.stop>
          <el-dropdown trigger="click">
            <el-button text circle :icon="MoreFilled" />
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="handleEdit(agent)">
                  <el-icon><Edit /></el-icon>
                  编辑
                </el-dropdown-item>
                <el-dropdown-item @click="handleExportAgents([agent.id], { includeAssets: true })">
                  <el-icon><Download /></el-icon>
                  导出此智能体
                </el-dropdown-item>
                <el-dropdown-item @click="handleDelete(agent)" divided>
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
      <el-button type="primary" @click="handleOpenCreateDialog" :icon="Plus">
        添加智能体
      </el-button>
      <!-- 导入导出下拉菜单 -->
      <el-dropdown trigger="click">
        <el-button type="info" :icon="MoreFilled"> </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item @click="handleImportFromFile">
              <el-icon><Download /></el-icon>
              导入智能体...
            </el-dropdown-item>
            <el-dropdown-item @click="exportDialogVisible = true">
              <el-icon><Upload /></el-icon>
              批量导出智能体...
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
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

    <!-- 导出对话框 -->
    <ExportAgentDialog v-model:visible="exportDialogVisible" @export="handleExportAgents" />

    <!-- 导入对话框 -->
    <ImportAgentDialog
      v-model:visible="importDialogVisible"
      :preflight-result="importPreflightResult"
      :loading="importLoading"
      @confirm="handleConfirmImport"
      @cancel="handleCancelImport"
    />
  </div>
</template>

<style scoped>
.agents-sidebar-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.agents-toolbar {
  flex-shrink: 0;
  padding: 8px 12px;
  display: flex;
  gap: 8px;
  background-color: var(--card-bg);
  border-bottom: 1px solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
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
  backdrop-filter: blur(var(--ui-blur));
  display: flex;
  gap: 8px;
}

.agents-footer .el-button {
  flex: 1;
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
  backdrop-filter: blur(var(--ui-blur));
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
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 6px;
  transition: all 0.2s;
  font-size: 24px;
}

.agent-icon.selected {
  width: 48px;
  height: 48px;
  font-size: 32px;
  border-radius: 8px;
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
