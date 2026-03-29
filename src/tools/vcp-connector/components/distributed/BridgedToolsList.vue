<template>
  <div class="bridged-tools-list">
    <div class="list-header">
      <div class="title-row">
        <div class="title-with-switch">
          <h4 class="title">从 VCP 桥接的工具</h4>
          <el-switch v-model="distStore.config.enableBridge" size="small" @change="handleBridgeToggle" />
        </div>
        <div class="header-actions" v-if="distStore.config.enableBridge">
          <el-button
            type="primary"
            link
            :loading="distStore.bridgeStatus === 'fetching'"
            :icon="RefreshCw"
            @click="handleRefresh"
          >
            刷新清单
          </el-button>
        </div>
      </div>
      <div class="description-text">开启后，AIO 将自动发现并注册 VCP 服务器提供的工具，使其可被 Agent 直接调用。</div>
    </div>

    <div v-if="!distStore.config.enableBridge" class="bridge-disabled-state">
      <el-empty description="桥接功能已关闭" :image-size="80">
        <template #extra>
          <el-button type="primary" @click="handleBridgeToggle(true)">开启桥接功能</el-button>
        </template>
      </el-empty>
    </div>

    <div v-else v-loading="distStore.bridgeStatus === 'fetching'" class="tools-container">
      <div
        v-for="tool in distStore.bridgeManifests"
        :key="tool.name"
        class="tool-item"
        :class="{ 'is-expanded': expandedTools.has(tool.name) }"
      >
        <div class="tool-main" @click="toggleExpand(tool.name)">
          <div class="tool-info">
            <el-icon class="expand-icon" :class="{ 'is-active': expandedTools.has(tool.name) }">
              <ChevronRight :size="14" />
            </el-icon>
            <div class="tool-name-wrapper">
              <div class="method-name">
                {{ tool.displayName || tool.name }}
              </div>
              <div class="tool-id-tag">
                {{ tool.name }}
              </div>
            </div>
            <div class="tool-tags">
              <el-tag size="small" type="primary" effect="plain" class="mini-tag">远程</el-tag>
              <el-tag size="small" type="info" effect="plain" class="mini-tag">
                {{ tool.capabilities.invocationCommands.length }} 命令
              </el-tag>
            </div>
          </div>

          <div class="tool-actions" @click.stop>
            <el-switch
              :model-value="!isToolDisabled(tool.name)"
              size="small"
              @change="(val: boolean) => toggleTool(tool.name, val)"
            />
          </div>
        </div>

        <el-collapse-transition>
          <div v-if="expandedTools.has(tool.name)" class="tool-detail">
            <div class="tool-desc" v-if="tool.description">{{ tool.description }}</div>

            <!-- 命令列表 -->
            <div class="methods-management-section">
              <div class="section-label">可用命令 (Commands)</div>
              <div class="methods-list">
                <div v-for="cmd in tool.capabilities.invocationCommands" :key="cmd.command" class="method-item">
                  <div class="method-info">
                    <div class="method-header">
                      <div class="method-title-group">
                        <span class="method-name">{{ cmd.displayName || cmd.command }}</span>
                        <code class="method-raw-name">{{ cmd.command }}</code>
                      </div>
                      <el-switch
                        v-if="cmd.command"
                        :model-value="!isCommandDisabled(tool.name, cmd.command!)"
                        size="small"
                        @change="(val: boolean) => toggleCommand(tool.name, cmd.command!, val)"
                      />
                    </div>
                    <span v-if="cmd.description" class="method-desc">{{ cmd.description }}</span>

                    <div v-if="cmd.example" class="method-example">
                      <div class="example-label">示例:</div>
                      <pre class="example-code">{{ cmd.example }}</pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </el-collapse-transition>
      </div>

      <el-empty
        v-if="distStore.bridgeManifests.length === 0 && distStore.bridgeStatus !== 'fetching'"
        description="暂无桥接工具"
        :image-size="60"
      >
        <template #extra>
          <el-button type="primary" plain @click="handleRefresh">尝试刷新</el-button>
        </template>
      </el-empty>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useVcpDistributedStore } from "../../stores/vcpDistributedStore";
import { vcpBridgeFactory } from "../../services/VcpBridgeFactory";
import { ChevronRight, RefreshCw } from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";

import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("vcp-connector/bridged-tools-list");
const distStore = useVcpDistributedStore();
const expandedTools = ref<Set<string>>(new Set());

const handleBridgeToggle = async (val: boolean | string | number) => {
  const enabled = !!val;
  distStore.updateConfig({ enableBridge: enabled });

  if (enabled) {
    if (distStore.status === "connected") {
      try {
        await vcpBridgeFactory.refresh();
      } catch (err) {
        logger.error("Failed to refresh VCP bridge after enabling", err);
      }
    }
  } else {
    try {
      await vcpBridgeFactory.teardown();
    } catch (err) {
      logger.error("Failed to teardown VCP bridge after disabling", err);
    }
  }
};

function toggleExpand(name: string) {
  if (expandedTools.value.has(name)) {
    expandedTools.value.delete(name);
  } else {
    expandedTools.value.add(name);
  }
}

async function handleRefresh() {
  try {
    await vcpBridgeFactory.refresh();
    customMessage.success("已成功刷新 VCP 桥接工具清单");
  } catch (error: any) {
    customMessage.error(`刷新失败: ${error.message}`);
  }
}

const isToolDisabled = (toolName: string) => {
  return distStore.config.disabledBridgeToolIds?.includes(toolName);
};

const isCommandDisabled = (toolName: string, command: string) => {
  return distStore.config.disabledBridgeToolIds?.includes(`${toolName}:${command}`);
};

const toggleTool = async (toolName: string, enabled: boolean) => {
  distStore.toggleBridgeToolDisabled(toolName, !enabled);
  // 变更后立即刷新工厂以生效
  await vcpBridgeFactory.refresh();
};

const toggleCommand = async (toolName: string, command: string, enabled: boolean) => {
  distStore.toggleBridgeToolDisabled(`${toolName}:${command}`, !enabled);
  // 变更后立即刷新工厂以生效
  await vcpBridgeFactory.refresh();
};
</script>

<style scoped lang="css">
.bridged-tools-list {
  padding: 16px;
  background: var(--card-bg);
  border-radius: 8px;
  border: var(--border-width) solid var(--border-color);
  box-sizing: border-box;
}

.bridged-tools-list * {
  box-sizing: border-box;
}

.list-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title-with-switch {
  display: flex;
  align-items: center;
  gap: 12px;
}

.title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.description-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}

.tools-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  padding-bottom: 24px;
}

.tool-item {
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
  transition: all 0.2s ease;
  background: var(--input-bg);
  flex-shrink: 0;
}

.tool-item:hover {
  border-color: var(--el-color-primary-light-5);
}

.tool-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
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

.tool-detail {
  padding: 12px 12px 16px 12px;
  background: rgba(var(--el-color-primary-rgb), 0.02);
  border-top: var(--border-width) solid var(--border-color);
  font-size: 12px;
}

.tool-desc {
  margin-bottom: 12px;
  color: var(--el-text-color-primary);
  line-height: 1.5;
}

.methods-management-section {
  margin-top: 8px;
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
  gap: 8px;
}

.method-item {
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
  background: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
}

.method-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.method-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.method-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.method-raw-name {
  font-size: 11px;
  padding: 1px 4px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  color: var(--el-text-color-secondary);
  font-family: var(--el-font-family-mono);
}

.method-desc {
  font-size: 12px;
  color: var(--el-text-color-regular);
  line-height: 1.4;
}

.method-example {
  margin-top: 8px;
  padding: 8px;
  background: var(--el-fill-color-darker);
  border-radius: 4px;
}

.example-label {
  font-size: 10px;
  color: var(--el-text-color-placeholder);
  margin-bottom: 4px;
  text-transform: uppercase;
}

.example-code {
  margin: 0;
  font-family: var(--el-font-family-mono);
  font-size: 11px;
  color: var(--el-color-success-light-3);
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
