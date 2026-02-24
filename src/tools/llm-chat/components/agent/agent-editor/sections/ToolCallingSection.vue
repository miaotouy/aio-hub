<script setup lang="ts">
import { inject, computed, ref, markRaw } from "vue";
import { Cpu, ArrowDown, CopyDocument, Files } from "@element-plus/icons-vue";
import { useToolCalling } from "@/tools/tool-calling/composables/useToolCalling";
import { useToolsStore } from "@/stores/tools";
import { DEFAULT_TOOL_CALL_CONFIG } from "@/tools/llm-chat/types/agent";
import { toolRegistryManager } from "@/services/registry";
import { VcpToolCallingProtocol } from "@/tools/tool-calling/core/protocols/vcp-protocol";
import SettingListRenderer from "@/components/common/SettingListRenderer.vue";
import { customMessage } from "@/utils/customMessage";
import { writeText, readText } from "@tauri-apps/plugin-clipboard-manager";

const editForm = inject<any>("agent-edit-form");
const toolsStore = useToolsStore();

// 工具调用相关
const { getDiscoveredMethods } = useToolCalling();
const discoveredTools = computed(() => {
  if (!editForm.toolCallConfig?.enabled) return [];
  return getDiscoveredMethods();
});

// 展开配置的工具ID
const expandedToolId = ref<string | null>(null);

const toggleTool = (toolId: string) => {
  if (!editForm.toolCallConfig) {
    editForm.toolCallConfig = JSON.parse(JSON.stringify(DEFAULT_TOOL_CALL_CONFIG));
  }
  if (!editForm.toolCallConfig.toolToggles) {
    editForm.toolCallConfig.toolToggles = {};
  }
  const currentValue = editForm.toolCallConfig.toolToggles[toolId] ?? editForm.toolCallConfig.defaultToolEnabled;
  editForm.toolCallConfig.toolToggles[toolId] = !currentValue;

  // 关闭工具时收起配置
  if (!editForm.toolCallConfig.toolToggles[toolId] && expandedToolId.value === toolId) {
    expandedToolId.value = null;
  }
};

const toggleAutoApprove = (toolId: string) => {
  if (!editForm.toolCallConfig) {
    editForm.toolCallConfig = JSON.parse(JSON.stringify(DEFAULT_TOOL_CALL_CONFIG));
  }
  if (!editForm.toolCallConfig.autoApproveTools) {
    editForm.toolCallConfig.autoApproveTools = {};
  }
  const currentValue = editForm.toolCallConfig.autoApproveTools[toolId] ?? editForm.toolCallConfig.defaultAutoApprove;
  editForm.toolCallConfig.autoApproveTools[toolId] = !currentValue;
};

const isToolEnabled = (toolId: string) => {
  if (!editForm.toolCallConfig) return false;
  return editForm.toolCallConfig.toolToggles?.[toolId] ?? editForm.toolCallConfig.defaultToolEnabled;
};

const isAutoApproveEnabled = (toolId: string) => {
  if (!editForm.toolCallConfig) return false;
  return editForm.toolCallConfig.autoApproveTools?.[toolId] ?? editForm.toolCallConfig.defaultAutoApprove;
};

const ensureConfig = () => {
  if (!editForm.toolCallConfig) {
    editForm.toolCallConfig = JSON.parse(JSON.stringify(DEFAULT_TOOL_CALL_CONFIG));
  }
  if (!editForm.toolCallConfig.toolToggles) {
    editForm.toolCallConfig.toolToggles = {};
  }
  if (!editForm.toolCallConfig.autoApproveTools) {
    editForm.toolCallConfig.autoApproveTools = {};
  }
  if (!editForm.toolCallConfig.toolSettings) {
    editForm.toolCallConfig.toolSettings = {};
  }
};

// 获取工具的 settingsSchema
const getToolSettingsSchema = (toolId: string) => {
  try {
    const registry = toolRegistryManager.getRegistry(toolId);
    return registry.settingsSchema || [];
  } catch (e) {
    return [];
  }
};

// 获取工具当前的配置值
const getToolSettings = (toolId: string) => {
  ensureConfig();
  return editForm.toolCallConfig.toolSettings[toolId] || {};
};

// 更新工具配置
const updateToolSettings = (toolId: string, newSettings: any) => {
  ensureConfig();
  editForm.toolCallConfig.toolSettings[toolId] = newSettings;
};

// 切换配置展开状态
const toggleToolSettings = (toolId: string) => {
  if (expandedToolId.value === toolId) {
    expandedToolId.value = null;
  } else {
    expandedToolId.value = toolId;
    ensureConfig();
  }
};
// 获取工具图标
const getToolIcon = (toolId: string) => {
  const tool = toolsStore.tools.find((t) => t.path === `/${toolId}`);
  return tool?.icon || markRaw(Cpu);
};

// 提示词预览
const vcpProtocol = new VcpToolCallingProtocol();

const getToolPromptPreview = (toolId: string): string => {
  const tool = discoveredTools.value.find((t) => t.toolId === toolId);
  if (!tool) return "";
  return vcpProtocol.generateToolDefinitions([{ toolId: tool.toolId, toolName: tool.toolName, methods: tool.methods }]);
};

// 复制配置
const copyToolSettings = async (toolId: string) => {
  const settings = getToolSettings(toolId);
  try {
    await writeText(JSON.stringify(settings, null, 2));
    customMessage.success("配置已复制到剪贴板");
  } catch (e) {
    customMessage.error("复制失败");
  }
};

// 粘贴配置
const pasteToolSettings = async (toolId: string) => {
  try {
    const text = await readText();
    if (!text) return;
    const settings = JSON.parse(text);
    if (typeof settings !== "object") throw new Error("无效的配置格式");

    updateToolSettings(toolId, settings);
    customMessage.success("配置已粘贴");
  } catch (e) {
    customMessage.error("粘贴失败：无效的 JSON 格式");
  }
};

// 复制所有工具配置
const copyAllToolSettings = async () => {
  ensureConfig();
  try {
    await writeText(JSON.stringify(editForm.toolCallConfig.toolSettings, null, 2));
    customMessage.success("所有工具配置已复制");
  } catch (e) {
    customMessage.error("复制失败");
  }
};

// 粘贴所有工具配置
const pasteAllToolSettings = async () => {
  try {
    const text = await readText();
    if (!text) return;
    const settings = JSON.parse(text);
    if (typeof settings !== "object") throw new Error("无效的配置格式");

    ensureConfig();
    editForm.toolCallConfig.toolSettings = settings;
    customMessage.success("所有工具配置已同步");
  } catch (e) {
    customMessage.error("粘贴失败：无效的 JSON 格式");
  }
};
</script>

<template>
  <div class="agent-section">
    <div class="section-group" data-setting-id="toolCalling">
      <div class="section-group-title">工具调用 (Agent)</div>
      <div class="form-hint">
        允许智能体在对话中使用 AIO 内部工具。启用后，智能体将能够通过
        <code v-pre style="color: var(--el-color-primary)">{{ tools }}</code>
        宏获取工具定义并发出调用请求。
      </div>

      <el-form-item label="启用工具调用">
        <el-switch v-model="editForm.toolCallConfig.enabled" @change="ensureConfig" />
      </el-form-item>

      <template v-if="editForm.toolCallConfig?.enabled">
        <div class="tool-config-grid">
          <el-form-item label="自动批准">
            <el-radio-group v-model="editForm.toolCallConfig.mode" size="small">
              <el-radio-button label="auto">开启</el-radio-button>
              <el-radio-button label="manual">关闭</el-radio-button>
            </el-radio-group>
          </el-form-item>

          <el-form-item label="最大迭代">
            <el-input-number v-model="editForm.toolCallConfig.maxIterations" :min="1" :max="10" size="small" />
          </el-form-item>

          <el-form-item label="超时 (ms)">
            <el-input-number v-model="editForm.toolCallConfig.timeout" :min="1000" :step="5000" size="small" />
          </el-form-item>

          <el-form-item label="并行执行">
            <el-switch v-model="editForm.toolCallConfig.parallelExecution" />
          </el-form-item>
        </div>

        <!-- 工具发现列表 -->
        <div class="discovered-tools-box">
          <div class="box-header">
            <div class="box-title-group">
              <span class="box-title">可用工具列表</span>
              <div class="header-actions">
                <el-tooltip content="复制所有工具配置" placement="top" :show-after="500">
                  <el-button link :icon="CopyDocument" @click="copyAllToolSettings" />
                </el-tooltip>
                <el-tooltip content="粘贴所有工具配置" placement="top" :show-after="500">
                  <el-button link :icon="Files" @click="pasteAllToolSettings" />
                </el-tooltip>
              </div>
            </div>
            <div class="box-actions">
              <div class="action-item">
                <span class="form-hint">默认启用:</span>
                <el-switch v-model="editForm.toolCallConfig.defaultToolEnabled" size="small" />
              </div>
              <div class="action-item">
                <span class="form-hint">默认自动批准:</span>
                <el-switch v-model="editForm.toolCallConfig.defaultAutoApprove" size="small" />
              </div>
            </div>
          </div>

          <div v-if="discoveredTools.length === 0" class="empty-tools">
            <el-empty :image-size="40" description="未发现可调用的工具方法" />
          </div>

          <div v-else class="tools-list">
            <template v-for="tool in discoveredTools" :key="tool.toolId">
              <div class="tool-item tool-item--expandable" @click="toggleToolSettings(tool.toolId)">
                <div class="tool-info">
                  <div class="tool-name-row">
                    <el-icon>
                      <component :is="getToolIcon(tool.toolId)" />
                    </el-icon>
                    <span class="tool-name">{{ tool.toolName }}</span>
                    <span class="tool-id">({{ tool.toolId }})</span>
                  </div>
                  <div class="tool-methods">
                    <el-tag
                      v-for="method in tool.methods"
                      :key="method.name"
                      size="small"
                      type="info"
                      effect="plain"
                      class="method-tag"
                    >
                      {{ method.name }}
                    </el-tag>
                  </div>
                </div>
                <div class="tool-action" @click.stop>
                  <template v-if="getToolSettingsSchema(tool.toolId).length > 0">
                    <el-tooltip content="复制配置" placement="top" :show-after="500">
                      <el-button link :icon="CopyDocument" @click="copyToolSettings(tool.toolId)" />
                    </el-tooltip>
                    <el-tooltip content="粘贴配置" placement="top" :show-after="500">
                      <el-button link :icon="Files" @click="pasteToolSettings(tool.toolId)" />
                    </el-tooltip>
                  </template>
                  <el-icon class="expand-icon" :class="{ 'expand-icon--open': expandedToolId === tool.toolId }">
                    <ArrowDown />
                  </el-icon>
                  <div class="tool-switch-group">
                    <el-tooltip content="自动批准" placement="top" :show-after="500">
                      <el-switch
                        :model-value="isAutoApproveEnabled(tool.toolId)"
                        @change="toggleAutoApprove(tool.toolId)"
                        size="small"
                        :disabled="editForm.toolCallConfig.mode !== 'auto'"
                        class="auto-approve-switch"
                      />
                    </el-tooltip>
                    <el-switch
                      :model-value="isToolEnabled(tool.toolId)"
                      @change="toggleTool(tool.toolId)"
                      size="small"
                    />
                  </div>
                </div>
              </div>

              <!-- 工具展开区域：提示词预览 + 可选配置 -->
              <el-collapse-transition>
                <div v-if="expandedToolId === tool.toolId" class="tool-settings-container">
                  <!-- 提示词注入预览 -->
                  <div class="prompt-preview-section">
                    <div class="preview-header">
                      <span class="preview-label">提示词注入预览</span>
                      <el-tag size="small" type="info" effect="plain">VCP 纯文本协议</el-tag>
                    </div>
                    <pre class="preview-content">{{ getToolPromptPreview(tool.toolId) }}</pre>
                  </div>
                  <!-- 工具配置（如有） -->
                  <template v-if="getToolSettingsSchema(tool.toolId).length > 0">
                    <el-divider style="margin: 8px 0" />
                    <SettingListRenderer
                      :items="getToolSettingsSchema(tool.toolId)"
                      :settings="getToolSettings(tool.toolId)"
                      @update:settings="(newSettings) => updateToolSettings(tool.toolId, newSettings)"
                    />
                  </template>
                </div>
              </el-collapse-transition>
            </template>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.section-group {
  margin-bottom: 24px;
}

.section-group-title {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 12px;
}

.form-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  line-height: 1.6;
  margin-bottom: 12px;
}

.tool-config-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 8px 24px;
  margin-bottom: 16px;
  padding: 16px;
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.tool-config-grid :deep(.el-form-item) {
  margin-bottom: 8px;
  display: flex;
  align-items: center;
}

.tool-config-grid :deep(.el-form-item__label) {
  margin-bottom: 0;
  flex-shrink: 0;
}

.tool-config-grid :deep(.el-form-item__content) {
  margin-left: 0 !important;
  display: flex;
  align-items: center;
}

.discovered-tools-box {
  margin-top: 16px;
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.box-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  border-bottom: 1px solid var(--border-color);
}

.box-title {
  font-size: 13px;
  font-weight: bold;
  color: var(--el-text-color-primary);
}

.box-title-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.box-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.action-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.box-actions :deep(.form-hint) {
  margin: 0;
  line-height: 1;
}

.tools-list {
  overflow-y: auto;
}

.tool-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
  transition: background-color 0.15s;
}

.tool-item:last-child {
  border-bottom: none;
}

.tool-item--expandable {
  cursor: pointer;
}

.tool-item--expandable:hover {
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.05));
}

.tool-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.tool-name {
  font-size: 14px;
  font-weight: 500;
}

.tool-id {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.tool-methods {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.method-tag {
  font-family: var(--el-font-family-mono);
}

.empty-tools {
  padding: 32px;
  display: flex;
  justify-content: center;
}

.tool-settings-container {
  padding: 12px;
  background: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.03));
  border-bottom: 1px solid var(--border-color);
}

.prompt-preview-section {
  margin-bottom: 4px;
}

.preview-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.preview-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
}

.preview-content {
  margin: 0;
  padding: 8px 10px;
  font-family: var(--el-font-family-mono);
  font-size: 11px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
  background: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 300px;
  overflow-y: auto;
}

.tool-action {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.tool-switch-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.auto-approve-switch :deep(.el-switch__core) {
  --el-switch-on-color: var(--el-color-warning);
}

.expand-icon {
  color: var(--el-text-color-secondary);
  transition: transform 0.2s;
  font-size: 12px;
}

.expand-icon--open {
  transform: rotate(180deg);
}
</style>
