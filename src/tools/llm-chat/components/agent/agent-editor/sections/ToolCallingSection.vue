<script setup lang="ts">
import { inject, computed, ref, type Ref } from "vue";
import { CopyDocument, Files, InfoFilled, Search } from "@element-plus/icons-vue";
import { useToolCalling } from "@/tools/tool-calling/composables/useToolCalling";
import { useToolSearch } from "@/tools/tool-calling/composables/useToolSearch";
import { DEFAULT_TOOL_CALL_CONFIG } from "@/tools/llm-chat/types/agent";
import { customMessage } from "@/utils/customMessage";
import { writeText, readText } from "@tauri-apps/plugin-clipboard-manager";
import ToolCallingItem from "./ToolCallingItem.vue";

// 宏示例常量（避免格式化工具添加空格）
const toolsMacro = "{{tools}}";
const toolUsageMacro = "{{tool_usage}}";
const toolsParamMacro = "{{tools::id}}";

const editForm = inject<any>("agent-edit-form");
const activeTab = inject<Ref<string>>("active-tab");

// 宏检查
const isToolsMacroMissing = computed(() => {
  if (!editForm.toolCallConfig?.enabled) return false;
  const messages = editForm.presetMessages || [];
  // 扫描所有启用的消息（如果未定义 enabled 则默认视为启用）
  return !messages.some((m: any) => m.enabled !== false && m.content?.includes("{{tools}}"));
});

const switchToPersonality = () => {
  if (activeTab) {
    activeTab.value = "personality";
  }
};

// 工具发现逻辑
const { getDiscoveredMethods } = useToolCalling();
const discoveredTools = computed(() => {
  if (!editForm.toolCallConfig?.enabled) return [];
  return getDiscoveredMethods();
});

const searchQuery = ref("");
const { filteredTools } = useToolSearch(discoveredTools, searchQuery);

// 展开配置的工具ID
const expandedToolId = ref<string | null>(null);

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
  if (!editForm.toolCallConfig.methodToggles) {
    editForm.toolCallConfig.methodToggles = {};
  }
  if (!editForm.toolCallConfig.autoApproveMethods) {
    editForm.toolCallConfig.autoApproveMethods = {};
  }
  if (editForm.toolCallConfig.showMethodsCount === undefined) {
    editForm.toolCallConfig.showMethodsCount = true;
  }
  if (editForm.toolCallConfig.autoInjectIfMacroMissing === undefined) {
    editForm.toolCallConfig.autoInjectIfMacroMissing = false;
  }
  if (!editForm.toolCallConfig.overrides) {
    editForm.toolCallConfig.overrides = {};
  }
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
      <div class="section-header">
        <div class="section-group-title">工具调用 (Agent)</div>
        <el-switch v-model="editForm.toolCallConfig.enabled" @change="ensureConfig" />
      </div>
      <div class="form-hint">
        允许智能体在对话中使用 AIO 内部工具。启用后，你可以通过
        <code style="color: var(--el-color-primary)">{{ toolsMacro }}</code>
        获取定义，通过
        <code style="color: var(--el-color-primary)">{{ toolUsageMacro }}</code>
        获取协议说明，或使用
        <code style="color: var(--el-color-primary)">{{ toolsParamMacro }}</code>
        精确注入指定工具。
      </div>

      <!-- 宏缺失警告 -->
      <transition name="el-zoom-in-top">
        <div v-if="isToolsMacroMissing" class="macro-warning-alert">
          <el-alert
            :type="editForm.toolCallConfig.autoInjectIfMacroMissing ? 'info' : 'warning'"
            :closable="false"
            show-icon
          >
            <template #title>
              <div class="alert-title-content">
                <span v-if="editForm.toolCallConfig.autoInjectIfMacroMissing"> 自动注入已启用 </span>
                <span v-else>
                  提示词中未发现 <code>{{ toolsMacro }}</code> 宏
                </span>
                <div class="alert-actions">
                  <el-button
                    v-if="!editForm.toolCallConfig.autoInjectIfMacroMissing"
                    type="primary"
                    size="small"
                    @click="editForm.toolCallConfig.autoInjectIfMacroMissing = true"
                  >
                    立即开启保底注入
                  </el-button>
                  <el-button link type="primary" size="small" @click="switchToPersonality"> 前往编辑提示词 </el-button>
                </div>
              </div>
            </template>
            <template #default>
              <span v-if="editForm.toolCallConfig.autoInjectIfMacroMissing">
                工具定义将自动注入到对话历史之前。你也可以在"角色设定"中手动添加
                <code>{{ toolsMacro }}</code> 宏以精确控制注入位置。
              </span>
              <span v-else>
                智能体需要此宏来感知当前启用的工具定义。你可以开启"自动注入"，或在"角色设定"中手动添加此宏。
              </span>
            </template>
          </el-alert>
        </div>
      </transition>

      <template v-if="editForm.toolCallConfig?.enabled">
        <div class="tool-config-grid">
          <el-form-item label="自动批准">
            <el-switch v-model="editForm.toolCallConfig.mode" active-value="auto" inactive-value="manual" />
          </el-form-item>

          <el-form-item label="并行执行">
            <el-switch v-model="editForm.toolCallConfig.parallelExecution" />
          </el-form-item>

          <el-form-item label="最大迭代">
            <el-input-number v-model="editForm.toolCallConfig.maxIterations" :min="1" :max="10" size="small" />
          </el-form-item>

          <el-form-item label="超时 (ms)">
            <el-input-number v-model="editForm.toolCallConfig.timeout" :min="1000" :step="5000" size="small" />
          </el-form-item>

          <el-form-item label="角色转换">
            <template #label>
              <el-tooltip
                content="开启后，工具执行结果将以“用户”身份发送给模型。适用于不支持工具角色的纯文本协议（如 VCP）。"
                placement="top"
              >
                <div style="display: flex; align-items: center; gap: 4px">
                  <span>角色转换</span>
                  <el-icon :size="14"><InfoFilled /></el-icon>
                </div>
              </el-tooltip>
            </template>
            <el-switch v-model="editForm.toolCallConfig.convertToolRoleToUser" />
          </el-form-item>

          <el-form-item label="保底注入">
            <template #label>
              <el-tooltip
                content="开启后，如果提示词中未手动添加 {{tools}} 宏，系统会自动将工具定义注入到对话历史之前。"
                placement="top"
              >
                <div style="display: flex; align-items: center; gap: 4px">
                  <span>保底注入</span>
                  <el-icon :size="14"><InfoFilled /></el-icon>
                </div>
              </el-tooltip>
            </template>
            <el-switch v-model="editForm.toolCallConfig.autoInjectIfMacroMissing" />
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
                <span class="form-hint">显示方法统计:</span>
                <el-switch v-model="editForm.toolCallConfig.showMethodsCount" size="small" />
              </div>
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

          <!-- 搜索栏独立出来 -->
          <div class="box-search-bar">
            <el-input
              v-model="searchQuery"
              placeholder="搜索工具名称、ID、方法或描述..."
              size="small"
              clearable
              :prefix-icon="Search"
            />
          </div>

          <div v-if="filteredTools.length === 0" class="empty-tools">
            <el-empty :image-size="40" :description="searchQuery ? '未找到匹配结果' : '未发现可调用的工具方法'" />
          </div>

          <div v-else class="tools-list">
            <ToolCallingItem
              v-for="tool in filteredTools"
              :key="tool.toolId"
              :tool="tool"
              :expanded="expandedToolId === tool.toolId"
              @toggle-expand="toggleToolSettings(tool.toolId)"
            />
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

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.section-group-title {
  font-size: 16px;
  font-weight: bold;
}

.form-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  line-height: 1.6;
  margin-bottom: 12px;
}

.macro-warning-alert {
  margin-bottom: 16px;
}

.alert-title-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 12px;
}

.alert-title-content code {
  color: var(--el-color-primary);
  font-weight: bold;
  margin: 0 4px;
}

.alert-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.tool-config-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 8px 24px;
  margin-bottom: 16px;
  padding: 16px;
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
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
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.box-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  border-bottom: var(--border-width) solid var(--border-color);
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

.box-search-bar {
  padding: 10px 12px;
  background: var(--el-fill-color-lighter);
  border-bottom: var(--border-width) solid var(--border-color);
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

.empty-tools {
  padding: 32px;
  display: flex;
  justify-content: center;
}
</style>
