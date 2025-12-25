<script setup lang="ts">
import { computed, ref, watch, onMounted, defineAsyncComponent } from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
import yaml from "js-yaml";
import { useAgentStore } from "../../agentStore";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useLlmChatUiState } from "../../composables/useLlmChatUiState";
import { useLlmSearch, type MatchDetail } from "../../composables/useLlmSearch";
import { Plus, Search, Download, Upload, DocumentAdd, Loading } from "@element-plus/icons-vue";
import { ElMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import type { ChatAgent, AgentEditData } from "../../types";
import type { AgentPreset } from "../../types";
import { AgentCategory, AgentCategoryLabels } from "../../types";
import type { ExportableAgent, AgentExportFile } from "../../types/agentImportExport";
import AgentListItem from "./AgentListItem.vue";

console.log("[AgentsSidebar] Setup started");

const CreateAgentDialog = defineAsyncComponent(() => import("../agent/CreateAgentDialog.vue"));
const EditAgentDialog = defineAsyncComponent(() => import("../agent/EditAgentDialog.vue"));
const ExportAgentDialog = defineAsyncComponent(() => import("../export/ExportAgentDialog.vue"));
const ImportAgentDialog = defineAsyncComponent(() => import("../export/ImportAgentDialog.vue"));

const agentStore = useAgentStore();

// 使用持久化的UI状态
const { agentSortBy } = useLlmChatUiState();

// 后端搜索功能
const { isSearching, showLoadingIndicator, agentResults, search, clearSearch } = useLlmSearch({ debounceMs: 300, scope: "agent" });

// 搜索和筛选状态
const searchQuery = ref("");
const selectedCategory = ref("all");

// 搜索结果 ID 到匹配详情的映射
const searchMatchesMap = computed(() => {
  const map = new Map<string, MatchDetail[]>();
  for (const result of agentResults.value) {
    map.set(result.id, result.matches);
  }
  return map;
});

// 是否处于搜索模式（有搜索词且长度>=2）
const isInSearchMode = computed(() => searchQuery.value.trim().length >= 2);

// 监听搜索词变化
watch(searchQuery, (newQuery) => {
  const trimmed = newQuery.trim();
  if (trimmed.length >= 2) {
    search(trimmed);
  } else {
    clearSearch();
  }
});

// 获取所有唯一的分类
const allCategories = computed(() => {
  const categories = new Set<string>();
  agentStore.agents.forEach((agent) => {
    if (agent.category) {
      categories.add(agent.category);
    }
  });
  // 转换为 { value, label } 数组并排序
  return Array.from(categories)
    .sort()
    .map((cat) => ({
      value: cat,
      label: AgentCategoryLabels[cat as AgentCategory] || cat, // 如果不是标准枚举，回退到原始值
    }));
});

// 过滤和排序后的智能体列表（非搜索模式）
const filteredAndSortedAgents = computed(() => {
  const start = performance.now();
  let agents = [...agentStore.agents];

  // 1. 分类过滤
  if (selectedCategory.value !== "all") {
    agents = agents.filter((agent) => agent.category === selectedCategory.value);
  }

  // 2. 本地搜索过滤（始终生效，作为后端搜索的补充或过渡）
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase().trim();
    agents = agents.filter((agent) => {
      return (
        agent.name.toLowerCase().includes(query) ||
        (agent.displayName && agent.displayName.toLowerCase().includes(query)) ||
        (agent.description && agent.description.toLowerCase().includes(query)) ||
        (agent.icon && agent.icon.toLowerCase().includes(query)) ||
        (agent.category &&
          (agent.category.toLowerCase().includes(query) ||
            (AgentCategoryLabels[agent.category as AgentCategory] || "")
              .toLowerCase()
              .includes(query))) ||
        (agent.tags && agent.tags.some((tag) => tag.toLowerCase().includes(query)))
      );
    });
  }

  // 3. 排序
  agents.sort((a, b) => {
    switch (agentSortBy.value) {
      case "lastUsed":
        const aTime = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
        const bTime = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
        return bTime - aTime;
      case "name":
        const nameA = a.displayName || a.name;
        const nameB = b.displayName || b.name;
        return nameA.localeCompare(nameB, undefined, {
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

  const end = performance.now();
  console.log(
    `[AgentsSidebar] filteredAndSortedAgents calculation took ${(end - start).toFixed(2)}ms for ${agents.length} agents`
  );
  return agents;
});

// 搜索模式下的智能体列表（基于后端搜索结果）
const searchResultAgents = computed(() => {
  if (!isInSearchMode.value) return [];
  
  // 根据后端返回的搜索结果顺序获取 agent 对象
  const agents: ChatAgent[] = [];
  for (const result of agentResults.value) {
    const agent = agentStore.getAgentById(result.id);
    if (agent) {
      // 如果有分类筛选，也需要应用
      if (selectedCategory.value === "all" || agent.category === selectedCategory.value) {
        agents.push(agent);
      }
    }
  }
  return agents;
});

// 最终显示的智能体列表
const displayAgents = computed(() => {
  // 如果处于搜索模式
  if (isInSearchMode.value) {
    // 1. 如果有后端搜索结果，优先显示
    if (searchResultAgents.value.length > 0) {
      return searchResultAgents.value;
    }
    // 2. 如果正在搜索中（后端结果尚未返回），显示前端过滤结果作为过渡
    if (isSearching.value) {
      return filteredAndSortedAgents.value;
    }
    // 3. 搜索完成且无结果，返回空数组
    return [];
  }

  // 非搜索模式，显示常规过滤列表
  return filteredAndSortedAgents.value;
});

// 获取某个 agent 的匹配详情
const getAgentMatches = (agentId: string): MatchDetail[] | undefined => {
  if (!isInSearchMode.value) return undefined;
  const matches = searchMatchesMap.value.get(agentId);
  if (!matches) return undefined;
  // 过滤掉名称显示，因为名称已经显示在列表项中了
  return matches.filter(m => m.field !== 'name' && m.field !== 'displayName');
};

// 虚拟滚动
const parentRef = ref<HTMLElement | null>(null);

const virtualizer = useVirtualizer({
  get count() {
    return displayAgents.value.length;
  },
  getScrollElement: () => parentRef.value,
  estimateSize: () => 65, // 预估高度（基于未选中状态：padding 24 + content 32 + margin 8）
  overscan: 10,
});

const virtualItems = computed(() => virtualizer.value.getVirtualItems());
const totalSize = computed(() => virtualizer.value.getTotalSize());

onMounted(() => {
  console.log("[AgentsSidebar] Mounted");
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
const exportInitialSelection = ref<string[]>([]);
const importDialogVisible = ref(false);
const importPreflightResult = ref<any>(null);
const importLoading = ref(false);

// 打开导出对话框
const handleOpenExportDialog = (agentIds?: string[]) => {
  exportInitialSelection.value = agentIds || [];
  exportDialogVisible.value = true;
};

// 执行导出
const handleExportAgents = (
  agentIds: string[],
  options: {
    includeAssets: boolean;
    format?: "json" | "yaml";
    exportType?: "zip" | "folder" | "file" | "png";
    separateFolders?: boolean;
    previewImage?: File | string;
  }
) => {
  agentStore.exportAgents(agentIds, options);
};

// 导入相关
const handleImportFromFile = async () => {
  try {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = ".agent.zip,.agent.json,.agent.yaml,.agent.yml,.agent.png";
    input.onchange = async (event) => {
      const files = Array.from((event.target as HTMLInputElement).files || []);
      if (files.length === 0) return;

      importLoading.value = true;
      try {
        const result = await agentStore.preflightImportAgents(files);
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

const handleConfirmImport = (resolvedAgents: any[], worldbookOptions: {
  bundledWorldbooks: Record<string, any[]>;
  embeddedWorldbooks: Record<string, any>;
}) => {
  if (!importPreflightResult.value) return;
  agentStore.confirmImportAgents({
    resolvedAgents,
    assets: importPreflightResult.value.assets,
    bundledWorldbooks: worldbookOptions.bundledWorldbooks,
    embeddedWorldbooks: worldbookOptions.embeddedWorldbooks,
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
    maxTokens: 8192,
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

  // 剔除不需要直接复制的字段（如果有的话，目前预设结构基本都可以直接用）
  // 使用解构和 rest 运算符获取所有其他属性
  const { presetMessages, parameters, ...otherProps } = preset;

  editDialogInitialData.value = {
    // 1. 展开所有其他属性 (name, description, icon, category, tags, virtualTimeConfig 等)
    // 使用深拷贝防止引用污染
    ...JSON.parse(JSON.stringify(otherProps)),

    // 2. 覆盖或特殊处理的字段
    profileId: defaultProfile.id,
    modelId: defaultModel.id,

    // 兼容处理 parameters (扁平化映射到 editDialogInitialData)
    // 注意：EditAgentDialog 内部已经支持处理嵌套的 parameters 对象，
    // 但为了保险和统一，这里我们保留 parameters 对象传递，让 Dialog 内部去解构
    parameters: parameters
      ? JSON.parse(JSON.stringify(parameters))
      : { temperature: 0.7, maxTokens: 8192 },

    // 深度复制 presetMessages，并确保它们有唯一的 ID，同时保持引用关系
    presetMessages: (() => {
      const rawMessages = JSON.parse(JSON.stringify(presetMessages));
      const idMap = new Map<string, string>();

      // 第一步：生成新 ID 映射
      rawMessages.forEach((msg: any) => {
        const newId = `preset-${msg.role}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        idMap.set(msg.id, newId);
      });

      // 第二步：重建消息，更新 ID 引用
      return rawMessages.map((msg: any) => {
        const newId = idMap.get(msg.id)!;

        // 更新 parentId
        const newParentId = msg.parentId ? idMap.get(msg.parentId) || null : null;

        // 更新 childrenIds
        const newChildrenIds = (msg.childrenIds || [])
          .map((childId: string) => idMap.get(childId))
          .filter((id: string | undefined): id is string => !!id);

        return {
          ...msg,
          id: newId,
          parentId: newParentId,
          childrenIds: newChildrenIds,
          status: "complete",
          isEnabled: true,
          timestamp: new Date().toISOString(),
        };
      });
    })(),
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
// 使用统一的 AgentEditData 类型，确保字段完整传递
const handleSaveAgent = (data: AgentEditData, options: { silent?: boolean } = {}) => {
  if (editDialogMode.value === "edit" && editingAgent.value) {
    // 更新模式
    agentStore.updateAgent(editingAgent.value.id, data);
    if (!options.silent) {
      customMessage.success("智能体已更新");
    }
  } else {
    // 创建模式
    const newAgentId = agentStore.createAgent(data.name, data.profileId, data.modelId, data);
    customMessage.success(`智能体 "${data.name}" 创建成功`);
    // 自动选中新创建的智能体
    selectAgent(newAgentId);
  }
};

// 删除智能体
const handleDelete = (agent: ChatAgent) => {
  const name = agent.displayName || agent.name;
  ElMessageBox.confirm(`确定要删除智能体 "${name}" 吗？文件将被移入回收站。`, "确认删除", {
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

// 复制智能体
const handleDuplicateAgent = async (agent: ChatAgent) => {
  const newAgentId = await agentStore.duplicateAgent(agent.id);
  if (newAgentId) {
    const name = agent.displayName || agent.name;
    customMessage.success(`智能体 "${name}" 已复制`);
    // 可以选择是否自动选中新的智能体
    // selectAgent(newAgentId);
  }
};

// 复制配置到剪贴板
const handleCopyConfig = async (agent: ChatAgent, format: "json" | "yaml") => {
  try {
    // 构造可导出的智能体对象（参照 agentExportService）
    // 动态剔除不需要导出的本地字段 (id, createdAt, updatedAt, lastUsedAt)
    const { id, createdAt, lastUsedAt, ...rest } = agent;

    const exportableAgent: ExportableAgent = JSON.parse(JSON.stringify(rest));

    const exportData: AgentExportFile = {
      version: 1,
      type: "AIO_Agent_Export",
      agents: [exportableAgent],
    };

    const contentString =
      format === "yaml" ? yaml.dump(exportData) : JSON.stringify(exportData, null, 2);

    await navigator.clipboard.writeText(contentString);
    const name = agent.displayName || agent.name;
    customMessage.success(`智能体 "${name}" 的 ${format.toUpperCase()} 配置已复制到剪贴板`);
  } catch (error) {
    customMessage.error(`复制配置失败: ${error}`);
  }
};

// 从剪贴板导入
const handleImportFromClipboard = async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text.trim()) {
      customMessage.warning("剪贴板内容为空");
      return;
    }

    let file: File;
    const trimmedText = text.trim();

    // 简单判断是 JSON 还是 YAML
    if (trimmedText.startsWith("{") && trimmedText.endsWith("}")) {
      file = new File([text], "from-clipboard.agent.json", { type: "application/json" });
    } else {
      // 否则尝试作为 YAML 处理
      file = new File([text], "from-clipboard.agent.yaml", { type: "application/x-yaml" });
    }

    importLoading.value = true;
    try {
      const result = await agentStore.preflightImportAgents([file]);
      importPreflightResult.value = result;
      importDialogVisible.value = true;
    } catch (error) {
      // preflightImportAgents 内部已经处理了错误提示
    } finally {
      importLoading.value = false;
    }
  } catch (error) {
    customMessage.error(`读取剪贴板失败: ${error}`);
  }
};

// 从酒馆角色卡导入
const handleImportFromTavernCard = async () => {
  try {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = ".json,.png"; // 酒馆角色卡通常是 json 或包含数据的 png
    input.onchange = async (event) => {
      const files = Array.from((event.target as HTMLInputElement).files || []);
      if (files.length === 0) return;

      importLoading.value = true;
      try {
        // preflightImportAgents 应该能自动识别文件类型
        const result = await agentStore.preflightImportAgents(files);
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
</script>

<template>
  <div class="agents-sidebar-content">
    <!-- 搜索和排序工具栏 -->
    <div class="agents-toolbar">
      <div class="toolbar-row">
        <el-input
          v-model="searchQuery"
          :prefix-icon="Search"
          :suffix-icon="showLoadingIndicator ? Loading : ''"
          placeholder="搜索名称、描述或标签..."
          clearable
          size="small"
        >
          <template #suffix v-if="showLoadingIndicator">
             <el-icon class="is-loading"><Loading /></el-icon>
          </template>
        </el-input>
      </div>
      <div class="toolbar-row">
        <el-select
          v-if="allCategories.length > 0"
          v-model="selectedCategory"
          size="small"
          placeholder="全部分类"
          style="flex: 1"
        >
          <el-option label="全部分类" value="all" />
          <el-option
            v-for="cat in allCategories"
            :key="cat.value"
            :label="cat.label"
            :value="cat.value"
          />
        </el-select>
        <el-select
          v-model="agentSortBy"
          size="small"
          :style="{ width: allCategories.length > 0 ? '110px' : '100%' }"
        >
          <el-option label="最近使用" value="lastUsed" />
          <el-option label="按名称" value="name" />
          <el-option label="创建时间" value="createdAt" />
        </el-select>
      </div>
    </div>

    <div class="agents-list" ref="parentRef">
      <div v-if="displayAgents.length === 0 && !searchQuery" class="empty-state">
        <p>暂无智能体</p>
        <p class="hint">点击下方按钮创建智能体</p>
      </div>

      <div v-else-if="displayAgents.length === 0" class="empty-state">
        <p>没有找到匹配的智能体</p>
        <p class="hint">{{ isInSearchMode ? '尝试其他搜索关键词，或减少筛选条件' : '尝试其他搜索关键词' }}</p>
      </div>

      <div
        v-else
        :style="{
          height: `${totalSize}px`,
          width: '100%',
          position: 'relative',
        }"
      >
        <div
          v-for="virtualItem in virtualItems"
          :key="displayAgents[virtualItem.index].id"
          :data-index="virtualItem.index"
          :ref="(el) => virtualizer.measureElement(el as HTMLElement)"
          :style="{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${virtualItem.start}px)`,
          }"
        >
          <AgentListItem
            :agent="displayAgents[virtualItem.index]"
            :selected="isAgentSelected(displayAgents[virtualItem.index].id)"
            :matches="getAgentMatches(displayAgents[virtualItem.index].id)"
            @select="selectAgent"
            @edit="handleEdit"
            @duplicate="handleDuplicateAgent"
            @export="(a) => handleOpenExportDialog([a.id])"
            @copy-config="handleCopyConfig"
            @delete="handleDelete"
          />
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
        <el-button type="info">更多</el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item @click="handleImportFromFile">
              <el-icon><Download /></el-icon>
              导入智能体...
            </el-dropdown-item>
            <el-dropdown-item @click="handleImportFromTavernCard">
              <el-icon><Download /></el-icon>
              导入酒馆角色卡...
            </el-dropdown-item>
            <el-dropdown-item @click="handleImportFromClipboard">
              <el-icon><DocumentAdd /></el-icon>
              从剪贴板导入
            </el-dropdown-item>
            <el-dropdown-item @click="handleOpenExportDialog()" divided>
              <el-icon><Upload /></el-icon>
              批量导出智能体...
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <!-- 创建智能体选择对话框 -->
    <CreateAgentDialog
      v-if="createDialogVisible"
      v-model:visible="createDialogVisible"
      @create-from-preset="handleCreateFromPreset"
      @create-from-blank="handleCreateFromBlank"
    />

    <!-- 智能体编辑对话框 -->
    <EditAgentDialog
      v-if="editDialogVisible"
      v-model:visible="editDialogVisible"
      :mode="editDialogMode"
      :agent="editingAgent"
      :initial-data="editDialogInitialData"
      @save="handleSaveAgent"
    />

    <!-- 导出对话框 -->
    <ExportAgentDialog
      v-if="exportDialogVisible"
      v-model:visible="exportDialogVisible"
      :initial-selection="exportInitialSelection"
      @export="handleExportAgents"
    />

    <!-- 导入对话框 -->
    <ImportAgentDialog
      v-if="importDialogVisible"
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
  flex-direction: column;
  gap: 8px;
  background-color: var(--card-bg);
  border-bottom: 1px solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
}

.toolbar-row {
  display: flex;
  gap: 8px;
  width: 100%;
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

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px;
  color: var(--text-color-secondary);
  font-size: 13px;
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
