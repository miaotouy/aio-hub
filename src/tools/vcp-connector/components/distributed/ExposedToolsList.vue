<template>
  <div class="exposed-tools-list">
    <div class="list-header">
      <div class="title-row">
        <h4 class="title">暴露给 VCP 的工具</h4>
        <div class="header-actions">
          <el-switch
            v-model="distStore.config.autoRegisterTools"
            active-text="自动发现 AI 工具"
            @change="distStore.updateConfig({ autoRegisterTools: $event })"
          />
        </div>
      </div>

      <div class="add-manual-inline">
        <el-select
          v-model="selectedToolId"
          placeholder="搜索或手动添加工具 (ID:Method)"
          filterable
          clearable
          style="flex: 1"
        >
          <el-option
            v-for="tool in availableTools"
            :key="tool.fullId"
            :label="tool.displayName ? `${tool.displayName} (${tool.fullId})` : tool.fullId"
            :value="tool.fullId"
          >
            <div class="option-content">
              <div class="option-name-group">
                <span class="option-display-name">{{ tool.displayName || tool.fullId.split(":")[1] }}</span>
                <span class="option-full-id">{{ tool.fullId }}</span>
              </div>
              <div class="option-tags">
                <el-tag v-if="tool.isAgent" size="small" type="success" effect="plain">AI</el-tag>
                <el-tag v-if="tool.isExposed" size="small" type="info" effect="plain">已暴露</el-tag>
              </div>
            </div>
          </el-option>
        </el-select>
        <el-button type="primary" :disabled="!selectedToolId" @click="addTool"> 添加至列表 </el-button>
      </div>
    </div>

    <div class="tools-container">
      <div
        v-for="tool in displayTools"
        :key="tool.toolId"
        class="tool-item"
        :class="{ 'is-disabled': !tool.isEnabled, 'is-expanded': expandedTools.has(tool.toolId) }"
      >
        <div class="tool-main" @click="toggleExpand(tool.toolId)">
          <div class="tool-info">
            <el-icon class="expand-icon" :class="{ 'is-active': expandedTools.has(tool.toolId) }">
              <ChevronRight :size="14" />
            </el-icon>
            <div class="tool-name-wrapper">
              <div class="method-name">
                {{ tool.displayName || tool.toolId }}
              </div>
              <div class="tool-id-tag">
                {{ tool.toolId }}
              </div>
            </div>
            <div class="tool-tags">
              <el-tag v-if="tool.isBuiltin" size="small" type="warning" effect="dark" class="mini-tag">内置</el-tag>
              <el-tag v-else-if="tool.isAuto" size="small" type="info" effect="plain" class="mini-tag">自动</el-tag>
              <el-tag v-else size="small" type="success" effect="plain" class="mini-tag">手动</el-tag>

              <el-tooltip :content="tool.isSynced ? '已同步至 VCP' : '等待连接同步'">
                <el-icon :class="['status-dot', tool.isSynced ? 'synced' : 'pending']">
                  <component :is="tool.isSynced ? CheckCircle2 : Clock" :size="12" />
                </el-icon>
              </el-tooltip>
            </div>
          </div>

          <div class="tool-actions" @click.stop>
            <el-switch
              :model-value="tool.isEnabled"
              :disabled="tool.isBuiltin"
              size="small"
              @change="handleToggleToolEnabled(tool.toolId, $event)"
            />
          </div>
        </div>

        <el-collapse-transition>
          <div v-if="expandedTools.has(tool.toolId)" class="tool-detail">
            <!-- 方法列表 -->
            <div v-if="tool.methods.length > 0" class="methods-management-section">
              <div class="section-label">方法列表 (Commands)</div>
              <div class="methods-list">
                <div v-for="method in tool.methods" :key="method.name" class="method-item">
                  <div class="method-info">
                    <span class="method-name">{{ method.displayName || method.name }}</span>
                    <span v-if="method.description" class="method-desc">{{ method.description }}</span>
                  </div>
                  <div class="method-actions" @click.stop>
                    <el-button
                      v-if="!method.isAuto && !tool.isBuiltin"
                      type="danger"
                      size="small"
                      link
                      class="remove-btn"
                      @click="toggleToolMethod(tool.toolId, method.name)"
                    >
                      移除
                    </el-button>
                    <el-switch
                      :model-value="method.isEnabled"
                      :disabled="tool.isBuiltin"
                      size="small"
                      @change="handleToggleMethodEnabled(tool.toolId, method.name, $event)"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="empty-methods">
              <el-empty :image-size="40" description="该工具暂无可用方法" />
            </div>
          </div>
        </el-collapse-transition>
      </div>

      <el-empty v-if="displayTools.length === 0" description="暂无暴露工具" :image-size="60" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useVcpDistributedStore } from "../../stores/vcpDistributedStore";
import { toolRegistryManager } from "@/services/registry";
import { CheckCircle2, Clock, ChevronRight } from "lucide-vue-next";
import { BUILTIN_VCP_TOOLS, getExposableTools } from "../../composables/useVcpDistributedNode";

const distStore = useVcpDistributedStore();
const selectedToolId = ref("");
const expandedTools = ref<Set<string>>(new Set());

function toggleExpand(name: string) {
  if (expandedTools.value.has(name)) {
    expandedTools.value.delete(name);
  } else {
    expandedTools.value.add(name);
  }
}

/**
 * 实时计算当前配置下"潜在"暴露的工具列表
 */
const displayTools = computed(() => {
  const syncedIds = new Set(distStore.exposedTools.map((t) => t.name));
  const disabledIds = new Set(distStore.config.disabledToolIds || []);
  const autoRegister = distStore.config.autoRegisterTools;
  const manualIds = new Set(distStore.config.exposedToolIds || []);

  const toolMap = new Map<string, any>();

  // 辅助函数：获取或创建工具条目
  const getOrCreateTool = (toolId: string, isBuiltin = false, isAuto = false) => {
    if (!toolMap.has(toolId)) {
      toolMap.set(toolId, {
        toolId,
        isBuiltin,
        isAuto,
        isEnabled: true, // 默认工具级别是启用的
        isSynced: syncedIds.has(toolId),
        methods: [],
      });
    }
    return toolMap.get(toolId);
  };

  // 1. 处理内置工具
  for (const tool of BUILTIN_VCP_TOOLS) {
    const entry = getOrCreateTool(tool.name, true, false);
    entry.displayName = tool.displayName;
    entry.description = tool.description;

    // 从 BUILTIN_VCP_TOOLS 中提取方法信息
    if (tool.capabilities?.invocationCommands) {
      for (const cmd of tool.capabilities.invocationCommands) {
        entry.methods.push({
          name: cmd.command,
          displayName: cmd.command,
          description: cmd.description || "",
          isAuto: false,
          isEnabled: true, // 内置工具的方法默认启用
        });
      }
    }
  }

  // 使用统一的工具发现逻辑
  const exposableTools = getExposableTools();

  // 2. 自动发现
  if (autoRegister) {
    for (const tool of exposableTools) {
      for (const method of tool.methods) {
        if (method.agentCallable || method.distributedExposed) {
          const fullId = `${tool.toolId}:${method.name}`;
          const entry = getOrCreateTool(tool.toolId, false, true);
          if (!entry.methods.some((m: any) => m.name === method.name)) {
            entry.methods.push({
              name: method.name,
              displayName: method.displayName || method.name,
              description: method.description || "",
              isAuto: true,
              isEnabled: !disabledIds.has(fullId),
            });
          }
        }
      }
    }
  }

  // 3. 手动添加
  for (const fullId of manualIds) {
    const [toolId, methodName] = fullId.split(":");

    // 检查是否在可暴露列表中（已在 getExposableTools 中过滤了 vcp:）
    if (!exposableTools.some((t) => t.toolId === toolId)) continue;

    // 检查是否已经被自动发现了
    let entry = toolMap.get(toolId);
    const alreadyAutoDiscovered = entry && entry.methods.some((m: any) => m.name === methodName);

    if (!alreadyAutoDiscovered) {
      entry = getOrCreateTool(toolId, false, false);

      let description = "";
      let displayName = methodName;
      let toolDisplayName = toolId;
      try {
        const registry = toolRegistryManager.getRegistry(toolId);
        const metadata = registry.getMetadata?.();
        const method = metadata?.methods.find((m) => m.name === methodName);
        description = method?.description || "";
        displayName = method?.displayName || methodName;
        // 从 registry 实例获取工具名称
        toolDisplayName = registry.name || toolId;
      } catch (e) {}

      // 设置工具的显示名称
      if (!entry.displayName) {
        entry.displayName = toolDisplayName;
      }

      entry.methods.push({
        name: methodName,
        displayName,
        description,
        isAuto: false,
        isEnabled: !disabledIds.has(fullId),
      });
    }
  }

  const results = Array.from(toolMap.values());

  // 计算工具整体是否启用和来源标签
  results.forEach((tool) => {
    if (tool.methods.length > 0) {
      tool.isEnabled = tool.methods.some((m: any) => m.isEnabled);

      // 重新计算工具的来源标签：如果所有方法都是自动的，则工具标记为自动
      const allMethodsAuto = tool.methods.every((m: any) => m.isAuto);
      const hasManualMethod = tool.methods.some((m: any) => !m.isAuto);

      if (!tool.isBuiltin) {
        if (allMethodsAuto) {
          tool.isAuto = true;
        } else if (hasManualMethod) {
          tool.isAuto = false;
        }
      }
    }
    // 从 registry 获取工具的显示名称（如果还没有）
    if (!tool.displayName && !tool.isBuiltin) {
      try {
        const registry = toolRegistryManager.getRegistry(tool.toolId);
        // 从 registry 实例获取工具名称
        tool.displayName = registry.name || tool.toolId;
      } catch (e) {
        tool.displayName = tool.toolId;
      }
    }
  });

  return results.sort((a, b) => {
    if (a.isBuiltin !== b.isBuiltin) return a.isBuiltin ? -1 : 1;
    return a.toolId.localeCompare(b.toolId);
  });
});

function handleToggleToolEnabled(toolId: string, enabled: boolean) {
  // 如果是关闭工具，则禁用该工具下的所有方法
  const tool = displayTools.value.find((t) => t.toolId === toolId);
  if (!tool) return;

  tool.methods.forEach((m: any) => {
    const fullId = `${toolId}:${m.name}`;
    distStore.toggleToolDisabled(fullId, !enabled);
  });
}

function handleToggleMethodEnabled(toolId: string, methodName: string, enabled: boolean) {
  const fullId = `${toolId}:${methodName}`;
  distStore.toggleToolDisabled(fullId, !enabled);
}

/**
 * 手动添加工具时的候选列表
 * 彻底放开：显示 Registry 中存在的所有方法
 */
const availableTools = computed(() => {
  const exposableTools = getExposableTools();
  const options: { fullId: string; displayName: string; isAgent: boolean; isExposed: boolean }[] = [];

  const currentFullIds = new Set();
  displayTools.value.forEach((t) => {
    t.methods.forEach((m: any) => currentFullIds.add(`${t.toolId}:${m.name}`));
  });

  for (const tool of exposableTools) {
    for (const method of tool.methods) {
      const fullId = `${tool.toolId}:${method.name}`;
      options.push({
        fullId,
        displayName: method.displayName || "",
        isAgent: !!method.agentCallable,
        isExposed: currentFullIds.has(fullId),
      });
    }
  }
  return options.sort((a, b) => a.fullId.localeCompare(b.fullId));
});

function toggleToolMethod(toolId: string, methodName: string) {
  distStore.unregisterToolFromVcp(toolId, methodName);
}

function addTool() {
  if (!selectedToolId.value) return;
  const [toolId, methodName] = selectedToolId.value.split(":");
  distStore.registerToolToVcp(toolId, methodName);
  selectedToolId.value = "";
}
</script>

<style scoped lang="css">
.exposed-tools-list {
  padding: 16px;
  background: var(--card-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
  box-sizing: border-box;
}

.exposed-tools-list * {
  box-sizing: border-box;
}

.list-header {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 16px;
}

.title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.add-manual-inline {
  display: flex;
  gap: 12px;
  background: transparent;
  margin-bottom: 4px;
}

.option-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  gap: 8px;
}

.option-name-group {
  display: flex;
  flex-direction: column;
  gap: 1px;
  overflow: hidden;
  flex: 1;
}

.option-display-name {
  font-size: 13px;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.option-full-id {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-family: var(--el-font-family-mono);
  opacity: 0.7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.option-tags {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.tools-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  padding-bottom: 24px;
}

.tools-container::-webkit-scrollbar {
  width: 5px;
}

.tools-container::-webkit-scrollbar-thumb {
  background: var(--el-border-color-lighter);
  border-radius: 10px;
}

.tools-container::-webkit-scrollbar-thumb:hover {
  background: var(--el-border-color);
}

.tool-item {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
  transition: all 0.2s ease;
  background: var(--input-bg);
  flex-shrink: 0;
}

.tool-item:hover {
  border-color: var(--el-color-primary-light-5);
}

.tool-item.is-disabled {
  opacity: 0.6;
  filter: grayscale(0.5);
}

.tool-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 8px;
  cursor: pointer;
}

.tool-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.expand-icon {
  transition: transform 0.2s ease;
  color: var(--el-text-color-secondary);
  margin-right: 8px;
}

.expand-icon.is-active {
  transform: rotate(90deg);
}

.tool-name-wrapper {
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
  flex: 1;
}

.method-name {
  color: var(--el-text-color-primary);
  font-weight: 600;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--el-font-family-mono);
}

.tool-id-tag {
  color: var(--el-text-color-secondary);
  font-size: 11px;
  font-family: var(--el-font-family-mono);
  opacity: 0.7;
}

.tool-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
}

.mini-tag {
  font-size: 10px;
  height: 18px;
  padding: 0 4px;
  line-height: 16px;
}

.status-dot {
  display: flex;
  align-items: center;
}

.status-dot.synced {
  color: var(--el-color-success);
}

.status-dot.pending {
  color: var(--el-color-info);
  opacity: 0.5;
}

.tool-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.remove-btn {
  font-size: 12px;
  padding: 0;
}

.tool-detail {
  padding: 12px 12px 16px 12px;
  background: rgba(var(--el-color-primary-rgb), 0.02);
  border-top: 1px solid var(--border-color);
  font-size: 12px;
}

.empty-methods {
  padding: 16px;
  display: flex;
  justify-content: center;
}

.methods-management-section {
  margin-bottom: 8px;
}

.section-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}

.methods-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.method-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  padding-left: 24px;
  background: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  transition: all 0.15s;
  position: relative;
}

.method-item::before {
  content: "";
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--el-text-color-placeholder);
}

.method-item:hover {
  background: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.05));
  border-color: var(--el-color-primary-light-7);
}

.method-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.method-name {
  font-size: 13px;
  font-weight: 500;
  font-family: var(--el-font-family-mono);
  color: var(--el-text-color-primary);
}

.method-desc {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}

.method-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
</style>
