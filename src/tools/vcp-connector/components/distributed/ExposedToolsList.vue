<template>
  <div class="exposed-tools-list">
    <div class="list-header">
      <h4 class="title">暴露给 VCP 的工具</h4>
      <div class="header-actions">
        <el-switch
          v-model="distStore.config.autoRegisterTools"
          active-text="自动注册标记工具"
          size="small"
          @change="distStore.updateConfig({ autoRegisterTools: $event })"
        />
      </div>
    </div>

    <el-table :data="distStore.exposedTools" size="small" border stripe style="width: 100%">
      <el-table-column prop="name" label="工具 ID : 方法" min-width="200">
        <template #default="{ row }">
          <code class="tool-id">{{ row.name }}</code>
        </template>
      </el-table-column>
      <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
      <el-table-column label="操作" width="100" align="center">
        <template #default="{ row }">
          <el-button
            type="danger"
            size="small"
            link
            @click="toggleTool(row.name)"
          >
            停止暴露
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="add-manual" v-if="availableTools.length > 0">
      <h5 class="subtitle">手动添加工具</h5>
      <div class="manual-row">
        <el-select
          v-model="selectedToolId"
          placeholder="选择要暴露的工具"
          size="small"
          filterable
          style="flex: 1"
        >
          <el-option
            v-for="tool in availableTools"
            :key="tool.fullId"
            :label="tool.fullId"
            :value="tool.fullId"
          />
        </el-select>
        <el-button type="primary" size="small" :disabled="!selectedToolId" @click="addTool">
          添加
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useVcpDistributedStore } from "../../stores/vcpDistributedStore";
import { toolRegistryManager } from "@/services/registry";

const distStore = useVcpDistributedStore();
const selectedToolId = ref("");

const availableTools = computed(() => {
  const allTools = toolRegistryManager.getAllTools();
  const options: { fullId: string }[] = [];
  const currentlyExposed = distStore.exposedTools.map(t => t.name);

  for (const tool of allTools) {
    if (typeof tool.getMetadata !== "function") continue;
    const metadata = tool.getMetadata();
    if (!metadata?.methods) continue;

    for (const method of metadata.methods) {
      const fullId = `${tool.id}:${method.name}`;
      if (!currentlyExposed.includes(fullId)) {
        options.push({ fullId });
      }
    }
  }
  return options;
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
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.tool-id {
  color: var(--el-color-primary);
  font-weight: 500;
}

.add-manual {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px dashed var(--border-color);
}

.subtitle {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--text-color-secondary);
}

.manual-row {
  display: flex;
  gap: 12px;
}
</style>