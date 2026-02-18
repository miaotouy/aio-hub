<script setup lang="ts">
import { inject, computed } from "vue";
import { Cpu } from "@element-plus/icons-vue";
import { useToolCalling } from "@/tools/tool-calling/composables/useToolCalling";
import { DEFAULT_TOOL_CALL_CONFIG } from "@/tools/llm-chat/types/agent";

const editForm = inject<any>("agent-edit-form");

// 工具调用相关
const { getDiscoveredMethods } = useToolCalling();
const discoveredTools = computed(() => getDiscoveredMethods(editForm.toolCallConfig));
const toggleTool = (toolId: string) => {
  if (!editForm.toolCallConfig) {
    editForm.toolCallConfig = { ...DEFAULT_TOOL_CALL_CONFIG };
  }
  if (!editForm.toolCallConfig.toolToggles) {
    editForm.toolCallConfig.toolToggles = {};
  }
  const currentValue =
    editForm.toolCallConfig.toolToggles[toolId] ?? editForm.toolCallConfig.defaultToolEnabled;
  editForm.toolCallConfig.toolToggles[toolId] = !currentValue;
};

const isToolEnabled = (toolId: string) => {
  if (!editForm.toolCallConfig) return false;
  return (
    editForm.toolCallConfig.toolToggles?.[toolId] ?? editForm.toolCallConfig.defaultToolEnabled
  );
};

const ensureConfig = () => {
  if (!editForm.toolCallConfig) {
    editForm.toolCallConfig = { ...DEFAULT_TOOL_CALL_CONFIG };
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
        <el-switch
          :model-value="editForm.toolCallConfig?.enabled ?? false"
          @update:model-value="
            (val: boolean) => {
              ensureConfig();
              editForm.toolCallConfig.enabled = val;
            }
          "
        />
      </el-form-item>

      <template v-if="editForm.toolCallConfig?.enabled">
        <div class="tool-config-grid">
          <el-form-item label="执行模式">
            <el-radio-group v-model="editForm.toolCallConfig.mode" size="small">
              <el-radio-button label="auto">自动</el-radio-button>
              <el-radio-button label="manual">手动</el-radio-button>
            </el-radio-group>
          </el-form-item>

          <el-form-item label="最大迭代">
            <el-input-number
              v-model="editForm.toolCallConfig.maxIterations"
              :min="1"
              :max="10"
              size="small"
            />
          </el-form-item>

          <el-form-item label="超时 (ms)">
            <el-input-number
              v-model="editForm.toolCallConfig.timeout"
              :min="1000"
              :step="5000"
              size="small"
            />
          </el-form-item>

          <el-form-item label="需要确认">
            <el-switch v-model="editForm.toolCallConfig.requireConfirmation" />
          </el-form-item>

          <el-form-item label="并行执行">
            <el-switch v-model="editForm.toolCallConfig.parallelExecution" />
          </el-form-item>
        </div>

        <!-- 工具发现列表 -->
        <div class="discovered-tools-box">
          <div class="box-header">
            <span class="box-title">可用工具列表</span>
            <div class="box-actions">
              <span class="form-hint">默认开启新工具:</span>
              <el-switch v-model="editForm.toolCallConfig.defaultToolEnabled" size="small" />
            </div>
          </div>

          <div v-if="discoveredTools.length === 0" class="empty-tools">
            <el-empty :image-size="40" description="未发现可调用的工具方法" />
          </div>

          <div v-else class="tools-list">
            <div v-for="tool in discoveredTools" :key="tool.toolId" class="tool-item">
              <div class="tool-info">
                <div class="tool-name-row">
                  <el-icon><Cpu /></el-icon>
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
              <div class="tool-action">
                <el-switch
                  :model-value="isToolEnabled(tool.toolId)"
                  @change="toggleTool(tool.toolId)"
                  size="small"
                />
              </div>
            </div>
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
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0 24px;
  margin-bottom: 16px;
  padding: 12px;
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  border-radius: 8px;
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

.box-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.box-actions :deep(.form-hint) {
  margin: 0;
  line-height: 1;
}

.tools-list {
  max-height: 400px;
  overflow-y: auto;
}

.tool-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
}

.tool-item:last-child {
  border-bottom: none;
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
</style>
