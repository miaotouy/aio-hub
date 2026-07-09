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

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useAgentStore } from "./stores/agentStore";
import { useToolsStore } from "@/stores/tools";
import { useLlmChatUiState } from "@/tools/llm-chat/composables/ui/useLlmChatUiState";
import { resolveAgentAvatarPath } from "@/tools/agent-manager/utils/agentAssetUtils";
import { customMessage } from "@/utils/customMessage";
import { ElMessageBox } from "element-plus";
import Avatar from "@/components/common/Avatar.vue";
import EditAgentDialog from "./components/management/EditAgentDialog.vue";
import type { ChatAgent } from "./types/agent";
import {
  Plus,
  Search,
  MessageSquare,
  Edit,
  Copy,
  Trash2,
  Upload,
} from "lucide-vue-next";

const agentStore = useAgentStore();
const toolsStore = useToolsStore();

// 搜索与过滤状态
const searchQuery = ref("");
const selectedCategory = ref("");

// 弹窗控制
const editDialogVisible = ref(false);
const editDialogMode = ref<"create" | "edit">("create");
const selectedAgentForEdit = ref<ChatAgent | null>(null);

// 过滤后的智能体列表
const filteredAgents = computed(() => {
  return agentStore.sortedAgents.filter((agent) => {
    const matchesSearch =
      agent.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      (agent.displayName &&
        agent.displayName
          .toLowerCase()
          .includes(searchQuery.value.toLowerCase())) ||
      (agent.description &&
        agent.description
          .toLowerCase()
          .includes(searchQuery.value.toLowerCase()));

    const matchesCategory =
      !selectedCategory.value || agent.category === selectedCategory.value;

    return matchesSearch && matchesCategory;
  });
});

// 所有可用的分类
const categories = computed(() => {
  const set = new Set<string>();
  agentStore.agents.forEach((agent) => {
    if (agent.category) {
      set.add(agent.category);
    }
  });
  return Array.from(set);
});

// 初始化加载
onMounted(async () => {
  const { loadAgentsIndex } =
    await import("./composables/storage/useAgentStorage").then((m) =>
      m.useAgentStorage()
    );
  const { agents } = await loadAgentsIndex();
  agentStore.agents = agents as any;
});

// 发起对话
const handleStartChat = async (agent: ChatAgent) => {
  const { currentAgentId } = useLlmChatUiState();
  currentAgentId.value = agent.id;
  await toolsStore.openTool("llm-chat");
  customMessage.success(`已切换到智能体: ${agent.displayName || agent.name}`);
};

// 新建智能体
const handleCreateAgent = () => {
  editDialogMode.value = "create";
  selectedAgentForEdit.value = null;
  editDialogVisible.value = true;
};

// 编辑智能体
const handleEditAgent = async (agent: ChatAgent) => {
  const fullAgent = await agentStore.ensureAgentLoaded(agent.id);
  if (fullAgent) {
    editDialogMode.value = "edit";
    selectedAgentForEdit.value = fullAgent;
    editDialogVisible.value = true;
  }
};

// 复制智能体
const handleDuplicateAgent = async (agent: ChatAgent) => {
  const newId = await agentStore.duplicateAgent(agent.id);
  if (newId) {
    customMessage.success("智能体克隆成功");
  }
};

// 删除智能体
const handleDeleteAgent = async (agent: ChatAgent) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除智能体 "${agent.displayName || agent.name}" 吗？此操作不可撤销。`,
      "提示",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
        lockScroll: false,
      }
    );

    await agentStore.deleteAgent(agent.id);
    customMessage.success("智能体删除成功");
  } catch (e) {
    // 取消删除
  }
};

// 导入智能体
const handleImportAgents = () => {
  customMessage.info("请在智能体编辑弹窗中导入角色卡");
  handleCreateAgent();
};
</script>

<template>
  <div class="agent-manager-wrapper">
    <div class="agent-manager-container">
      <!-- 头部操作区 -->
      <div class="manager-header">
        <div class="header-title">
          <h2>智能体大厅</h2>
          <p class="subtitle">在这里发现、创建和管理你的专属 AI 智能体</p>
        </div>
        <div class="header-actions">
          <el-button type="primary" :icon="Plus" @click="handleCreateAgent">
            新建智能体
          </el-button>
          <el-button :icon="Upload" @click="handleImportAgents">
            导入智能体
          </el-button>
        </div>
      </div>

      <!-- 搜索与过滤栏 -->
      <div class="filter-bar">
        <el-input
          v-model="searchQuery"
          placeholder="搜索智能体名称、描述..."
          :prefix-icon="Search"
          clearable
          class="search-input"
        />
        <el-select
          v-model="selectedCategory"
          placeholder="全部分类"
          clearable
          class="category-select"
        >
          <el-option
            v-for="cat in categories"
            :key="cat"
            :label="cat"
            :value="cat"
          />
        </el-select>
      </div>

      <!-- 智能体网格列表 -->
      <div v-if="filteredAgents.length > 0" class="agent-grid">
        <div v-for="agent in filteredAgents" :key="agent.id" class="agent-card">
          <div class="card-body">
            <div class="agent-avatar-wrapper">
              <Avatar
                :src="resolveAgentAvatarPath(agent) || ''"
                :name="agent.name"
                :size="64"
                class="agent-avatar"
              />
            </div>
            <div class="agent-info">
              <h3 class="agent-name">{{ agent.displayName || agent.name }}</h3>
              <span v-if="agent.category" class="agent-category-tag">
                {{ agent.category }}
              </span>
              <p class="agent-desc">
                {{ agent.description || "暂无描述" }}
              </p>
            </div>
          </div>
          <div class="card-footer">
            <el-button
              type="primary"
              link
              :icon="MessageSquare"
              @click="handleStartChat(agent)"
            >
              开聊
            </el-button>
            <div class="footer-right-actions">
              <el-tooltip content="编辑" placement="top">
                <el-button link :icon="Edit" @click="handleEditAgent(agent)" />
              </el-tooltip>
              <el-tooltip content="克隆" placement="top">
                <el-button
                  link
                  :icon="Copy"
                  @click="handleDuplicateAgent(agent)"
                />
              </el-tooltip>
              <el-tooltip content="删除" placement="top">
                <el-button
                  link
                  type="danger"
                  :icon="Trash2"
                  @click="handleDeleteAgent(agent)"
                />
              </el-tooltip>
            </div>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else class="empty-state">
        <el-empty description="没有找到匹配的智能体">
          <el-button type="primary" @click="handleCreateAgent">
            立即创建一个
          </el-button>
        </el-empty>
      </div>

      <!-- 编辑/新建弹窗 -->
      <EditAgentDialog
        v-model:visible="editDialogVisible"
        :mode="editDialogMode"
        :agent="selectedAgentForEdit"
      />
    </div>
  </div>
</template>

<style scoped>
.agent-manager-wrapper {
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
}

.agent-manager-container {
  padding: 24px;
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
  background-color: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 12px;
  backdrop-filter: blur(var(--ui-blur));
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.header-title h2 {
  margin: 0 0 4px 0;
  font-size: 24px;
  color: var(--el-text-color-primary);
}

.header-title .subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.header-actions {
  display: flex;
  gap: 12px;
}

.filter-bar {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
}

.search-input {
  max-width: 320px;
}

.category-select {
  width: 160px;
}

.agent-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.agent-card {
  background-color: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.agent-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--el-box-shadow-light);
  border-color: var(--el-color-primary-light-5);
}

.card-body {
  padding: 20px;
  display: flex;
  gap: 16px;
}

.agent-avatar-wrapper {
  flex-shrink: 0;
}

.agent-info {
  flex-grow: 1;
  min-width: 0;
}

.agent-name {
  margin: 0 0 6px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-category-tag {
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  border-radius: 4px;
  background-color: rgba(var(--el-color-primary-rgb), 0.1);
  color: var(--el-color-primary);
  margin-bottom: 8px;
}

.agent-desc {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
  display: -webkit-box;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-footer {
  padding: 12px 20px;
  background-color: rgba(0, 0, 0, 0.02);
  border-top: var(--border-width) solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.footer-right-actions {
  display: flex;
  gap: 8px;
}

.empty-state {
  padding: 60px 0;
}
</style>
