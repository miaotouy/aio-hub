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
            :label="tool.fullId"
            :value="tool.fullId"
          >
            <div class="option-content">
              <span>{{ tool.fullId }}</span>
              <el-tag v-if="tool.isAgent" size="mini" type="success" effect="plain">AI</el-tag>
              <el-tag v-if="tool.isExposed" size="mini" type="info" effect="plain">已暴露</el-tag>
            </div>
          </el-option>
        </el-select>
        <el-button type="primary" :disabled="!selectedToolId" @click="addTool">
          添加至列表
        </el-button>
      </div>
    </div>

    <div class="tools-container">
      <div
        v-for="tool in displayTools"
        :key="tool.name"
        class="tool-item"
        :class="{ 'is-disabled': !tool.isEnabled, 'is-expanded': expandedTools.has(tool.name) }"
      >
        <div class="tool-main" @click="toggleExpand(tool.name)">
          <div class="tool-info">
            <el-icon class="expand-icon" :class="{ 'is-active': expandedTools.has(tool.name) }">
              <ChevronRight :size="14" />
            </el-icon>
            <div class="tool-name-wrapper">
              <div class="method-name">
                {{ tool.displayName || tool.name.split(":")[1] || tool.name }}
              </div>
              <div class="tool-id-tag">{{ tool.isInternal ? 'VCP Protocol' : tool.name.split(":")[0] }}</div>
            </div>
            <div class="tool-tags">
              <el-tag
                v-if="tool.isBuiltin"
                size="mini"
                type="warning"
                effect="dark"
                class="mini-tag"
                >内置</el-tag
              >
              <el-tag
                v-else-if="tool.isAuto"
                size="mini"
                type="info"
                effect="plain"
                class="mini-tag"
                >自动</el-tag
              >
              <el-tag v-else size="mini" type="success" effect="plain" class="mini-tag"
                >手动</el-tag
              >

              <el-tooltip :content="tool.isSynced ? '已同步至 VCP' : '等待连接同步'">
                <el-icon :class="['status-dot', tool.isSynced ? 'synced' : 'pending']">
                  <component :is="tool.isSynced ? CheckCircle2 : Clock" :size="12" />
                </el-icon>
              </el-tooltip>
            </div>
          </div>

          <div class="tool-actions" @click.stop>
            <el-button
              v-if="!tool.isAuto && !tool.isBuiltin"
              type="danger"
              size="small"
              link
              class="remove-btn"
              @click="toggleTool(tool.name)"
            >
              移除
            </el-button>
            <el-switch
              :model-value="tool.isEnabled"
              :disabled="tool.isBuiltin"
              size="small"
              @change="handleToggleEnabled(tool.name, $event)"
            />
          </div>
        </div>

        <el-collapse-transition>
          <div v-if="expandedTools.has(tool.name)" class="tool-detail">
            <div class="detail-row">
              <span class="detail-label">描述:</span>
              <span class="detail-value">{{ tool.description || "暂无描述" }}</span>
            </div>
            <div v-if="tool.parameters" class="detail-row">
              <span class="detail-label">参数定义 (JSON Schema):</span>
              <pre class="detail-code">{{ JSON.stringify(tool.parameters, null, 2) }}</pre>
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
import { BUILTIN_VCP_TOOLS } from "../../composables/useVcpDistributedNode";

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

  const results: any[] = [];

  // 1. 处理内置工具 (强制暴露，不可关闭)
  for (const tool of BUILTIN_VCP_TOOLS) {
    results.push({
      ...tool,
      isBuiltin: true,
      isAuto: false,
      isEnabled: true,
      isSynced: syncedIds.has(tool.name),
    });
  }

  // 2. 获取所有标记为自动发现的工具
  if (autoRegister) {
    const discovery = toolRegistryManager.getAllTools();
    for (const tool of discovery) {
      if (typeof tool.getMetadata !== "function") continue;
      const methods = tool.getMetadata()?.methods || [];
      for (const method of methods) {
        if (method.agentCallable || method.distributedExposed) {
          const fullId = `${tool.id}:${method.name}`;
          // 避免与内置重复
          if (results.some((r) => r.name === fullId)) continue;

          results.push({
            name: fullId,
            description: method.description || "",
            parameters: method.parameters,
            isAuto: true,
            isBuiltin: false,
            isEnabled: !disabledIds.has(fullId),
            isSynced: syncedIds.has(fullId),
          });
        }
      }
    }
  }

  // 3. 获取手动添加的工具
  for (const fullId of manualIds) {
    if (results.some((r) => r.name === fullId)) continue;

    const [toolId, methodName] = fullId.split(":");
    let description = "";
    let parameters = null;
    try {
      const registry = toolRegistryManager.getRegistry(toolId);
      const method = registry.getMetadata?.()?.methods.find((m) => m.name === methodName);
      description = method?.description || "";
      parameters = method?.parameters || null;
    } catch (e) {}

    results.push({
      name: fullId,
      description,
      parameters,
      isAuto: false,
      isBuiltin: false,
      isEnabled: !disabledIds.has(fullId),
      isSynced: syncedIds.has(fullId),
    });
  }

  return results.sort((a, b) => {
    // 内置最前，然后按名称排
    if (a.isBuiltin !== b.isBuiltin) return a.isBuiltin ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
});

function handleToggleEnabled(fullId: string, enabled: any) {
  distStore.toggleToolDisabled(fullId, !enabled);
}

/**
 * 手动添加工具时的候选列表
 * 彻底放开：显示 Registry 中存在的所有方法
 */
const availableTools = computed(() => {
  const allTools = toolRegistryManager.getAllTools();
  const options: { fullId: string; isAgent: boolean; isExposed: boolean }[] = [];

  const currentIds = new Set(displayTools.value.map((t) => t.name));

  for (const tool of allTools) {
    const metadata = tool.getMetadata?.();
    const methods = metadata?.methods || [];

    for (const method of methods) {
      const fullId = `${tool.id}:${method.name}`;
      options.push({
        fullId,
        isAgent: !!method.agentCallable,
        isExposed: currentIds.has(fullId),
      });
    }
  }
  return options.sort((a, b) => a.fullId.localeCompare(b.fullId));
});

function toggleTool(fullId: string) {
  const [toolId, methodName] = fullId.split(":");
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

.detail-row {
  margin-bottom: 8px;
}

.detail-row:last-child {
  margin-bottom: 0;
}

.detail-label {
  font-weight: 600;
  color: var(--el-text-color-secondary);
  display: block;
  margin-bottom: 4px;
}

.detail-value {
  color: var(--el-text-color-primary);
}

.detail-code {
  background: var(--vscode-editor-background);
  padding: 12px;
  border-radius: 6px;
  margin: 8px 0 0 0;
  font-family: var(--el-font-family-mono);
  font-size: 11px;
  line-height: 1.5;
  overflow: auto;
  max-height: 280px;
  border: 1px solid var(--border-color);
  color: var(--el-text-color-primary);
  display: block;
  width: 100%;
  scrollbar-width: thin;
}

.detail-code::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.detail-code::-webkit-scrollbar-thumb {
  background: var(--el-border-color);
  border-radius: 3px;
}

.detail-code::-webkit-scrollbar-corner {
  background: transparent;
}
</style>
