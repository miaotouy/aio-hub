<script setup lang="ts">
import { computed, ref, markRaw, inject } from "vue";
import { ArrowDown, CopyDocument, Edit, Files } from "@element-plus/icons-vue";
import { Cpu, Power, Zap } from "lucide-vue-next";
import { useToolsStore } from "@/stores/tools";
import { toolRegistryManager } from "@/services/registry";
import { VcpToolCallingProtocol } from "@/tools/tool-calling/core/protocols/vcp-protocol";
import SettingListRenderer from "@/components/common/SettingListRenderer.vue";
import { customMessage } from "@/utils/customMessage";
import { writeText, readText } from "@tauri-apps/plugin-clipboard-manager";

const props = defineProps<{
  tool: any;
  expanded: boolean;
}>();

const emit = defineEmits<{
  (e: "toggle-expand"): void;
}>();

const editForm = inject<any>("agent-edit-form");
const toolsStore = useToolsStore();

// 覆盖相关逻辑
const editingOverrideId = ref<string | null>(null);
const overrideForm = ref({
  enabled: false,
  displayName: "",
  description: "",
  example: "",
});

const ensureConfig = () => {
  if (!editForm.toolCallConfig) {
    // 这里依赖父组件初始化，但为了健壮性还是做下检查
    return;
  }
  if (!editForm.toolCallConfig.toolToggles) editForm.toolCallConfig.toolToggles = {};
  if (!editForm.toolCallConfig.autoApproveTools) editForm.toolCallConfig.autoApproveTools = {};
  if (!editForm.toolCallConfig.toolSettings) editForm.toolCallConfig.toolSettings = {};
  if (!editForm.toolCallConfig.methodToggles) editForm.toolCallConfig.methodToggles = {};
  if (!editForm.toolCallConfig.autoApproveMethods) editForm.toolCallConfig.autoApproveMethods = {};
  if (!editForm.toolCallConfig.overrides) editForm.toolCallConfig.overrides = {};
};

const getOverride = (id: string) => {
  return editForm.toolCallConfig?.overrides?.[id] || {};
};

const startEditingOverride = (id: string, original: any) => {
  if (editingOverrideId.value === id) {
    editingOverrideId.value = null;
    return;
  }

  editingOverrideId.value = id;
  const existing = getOverride(id);

  const originalDisplayName = original.displayName || original.toolName || original.name || "";
  const originalDescription = original.description || original.toolDescription || "";

  overrideForm.value = {
    enabled: existing.enabled ?? false,
    displayName: existing.displayName || originalDisplayName,
    description: existing.description || originalDescription,
    example: existing.example || original.example || "",
  };
};

const cancelOverride = () => {
  editingOverrideId.value = null;
};

const saveOverride = () => {
  if (!editingOverrideId.value) return;
  ensureConfig();
  editForm.toolCallConfig.overrides[editingOverrideId.value] = { ...overrideForm.value };
  customMessage.success("覆盖配置已保存");
  editingOverrideId.value = null;
};

const removeOverride = (id: string) => {
  if (editForm.toolCallConfig.overrides?.[id]) {
    delete editForm.toolCallConfig.overrides[id];
    customMessage.info("已移除覆盖配置");
  }
};

// 工具开关逻辑
const isToolEnabled = computed(() => {
  if (!editForm.toolCallConfig) return false;
  return editForm.toolCallConfig.toolToggles?.[props.tool.toolId] ?? editForm.toolCallConfig.defaultToolEnabled;
});

const isAutoApproveEnabled = computed(() => {
  if (!editForm.toolCallConfig) return false;
  return editForm.toolCallConfig.autoApproveTools?.[props.tool.toolId] ?? editForm.toolCallConfig.defaultAutoApprove;
});

const toggleTool = () => {
  ensureConfig();
  const currentValue = isToolEnabled.value;
  editForm.toolCallConfig.toolToggles[props.tool.toolId] = !currentValue;
  if (!editForm.toolCallConfig.toolToggles[props.tool.toolId] && props.expanded) {
    emit("toggle-expand");
  }
};

const toggleAutoApprove = () => {
  ensureConfig();
  const currentValue = isAutoApproveEnabled.value;
  editForm.toolCallConfig.autoApproveTools[props.tool.toolId] = !currentValue;
};

// 方法开关逻辑
const isMethodEnabled = (methodName: string) => {
  if (!editForm.toolCallConfig?.methodToggles) return true;
  const key = `${props.tool.toolId}_${methodName}`;
  return editForm.toolCallConfig.methodToggles[key] !== false;
};

const isMethodAutoApproveEnabled = (methodName: string) => {
  if (!editForm.toolCallConfig?.autoApproveMethods) return false;
  const key = `${props.tool.toolId}_${methodName}`;
  return editForm.toolCallConfig.autoApproveMethods[key] === true;
};

const toggleMethod = (methodName: string) => {
  ensureConfig();
  const key = `${props.tool.toolId}_${methodName}`;
  const currentValue = isMethodEnabled(methodName);
  editForm.toolCallConfig.methodToggles[key] = !currentValue;
};

const toggleMethodAutoApprove = (methodName: string) => {
  ensureConfig();
  const key = `${props.tool.toolId}_${methodName}`;
  const currentValue = isMethodAutoApproveEnabled(methodName);
  editForm.toolCallConfig.autoApproveMethods[key] = !currentValue;
};

// 统计
const enabledMethodsCount = computed(() => {
  const total = props.tool.methods.length;
  const enabled = props.tool.methods.filter((m: any) => isMethodEnabled(m.name)).length;
  return { enabled, total };
});

// 配置 Schema
const toolSettingsSchema = computed(() => {
  try {
    const registry = toolRegistryManager.getRegistry(props.tool.toolId);
    return registry.settingsSchema || [];
  } catch (e) {
    return [];
  }
});

const toolSettings = computed(() => {
  return editForm.toolCallConfig?.toolSettings?.[props.tool.toolId] || {};
});

const updateToolSettings = (newSettings: any) => {
  ensureConfig();
  editForm.toolCallConfig.toolSettings[props.tool.toolId] = newSettings;
};

const getToolIcon = () => {
  const tool = toolsStore.tools.find((t) => t.path === `/${props.tool.toolId}`);
  return tool?.icon || markRaw(Cpu);
};

// 提示词预览
const vcpProtocol = new VcpToolCallingProtocol();
const toolPromptPreview = computed(() => {
  const toolOverride = getOverride(props.tool.toolId);
  const toolName = toolOverride?.enabled ? toolOverride.displayName || props.tool.toolName : props.tool.toolName;
  const toolDescription = toolOverride?.enabled
    ? toolOverride.description || props.tool.toolDescription
    : props.tool.toolDescription;

  const methodsWithOverrides = props.tool.methods.map((method: any) => {
    const methodKey = `${props.tool.toolId}:${method.name}`;
    const methodOverride = getOverride(methodKey);

    if (methodOverride?.enabled) {
      return {
        ...method,
        displayName: methodOverride.displayName || method.displayName,
        description: methodOverride.description || method.description,
        example: methodOverride.example || method.example,
      };
    }
    return method;
  });

  return vcpProtocol.generateToolDefinitions([
    {
      toolId: props.tool.toolId,
      toolName,
      toolDescription,
      methods: methodsWithOverrides,
    },
  ]);
});

// 剪贴板操作
const copyToolSettings = async () => {
  try {
    await writeText(JSON.stringify(toolSettings.value, null, 2));
    customMessage.success("配置已复制到剪贴板");
  } catch (e) {
    customMessage.error("复制失败");
  }
};

const pasteToolSettings = async () => {
  try {
    const text = await readText();
    if (!text) return;
    const settings = JSON.parse(text);
    if (typeof settings !== "object") throw new Error("无效的配置格式");
    updateToolSettings(settings);
    customMessage.success("配置已粘贴");
  } catch (e) {
    customMessage.error("粘贴失败：无效的 JSON 格式");
  }
};
</script>

<template>
  <div class="tool-item-wrapper">
    <div class="tool-item tool-item--expandable" @click="$emit('toggle-expand')">
      <div class="tool-info">
        <div class="tool-name-row">
          <el-icon>
            <component :is="getToolIcon()" />
          </el-icon>
          <span class="tool-name">{{ tool.toolName }}</span>
          <span class="tool-id">({{ tool.toolId }})</span>
          <el-tag
            v-if="editForm.toolCallConfig.showMethodsCount"
            size="small"
            :type="enabledMethodsCount.enabled === enabledMethodsCount.total ? 'success' : 'warning'"
            effect="plain"
            class="methods-count-tag"
          >
            {{ enabledMethodsCount.enabled }}/{{ enabledMethodsCount.total }}
          </el-tag>
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
        <template v-if="toolSettingsSchema.length > 0">
          <el-tooltip content="复制配置" placement="top" :show-after="500">
            <el-button link :icon="CopyDocument" @click="copyToolSettings" />
          </el-tooltip>
          <el-tooltip content="粘贴配置" placement="top" :show-after="500">
            <el-button link :icon="Files" @click="pasteToolSettings" />
          </el-tooltip>
        </template>

        <el-tooltip
          :content="getOverride(tool.toolId).enabled ? '编辑工具覆盖' : '点击配置工具覆盖'"
          placement="top"
          :show-after="500"
        >
          <div
            class="icon-toggle icon-toggle--edit"
            :class="{
              active: editingOverrideId === tool.toolId,
              'is-overridden': !!getOverride(tool.toolId).enabled,
            }"
            @click="startEditingOverride(tool.toolId, tool)"
          >
            <Edit style="width: 14px; height: 14px" />
          </div>
        </el-tooltip>

        <el-icon class="expand-icon" :class="{ 'expand-icon--open': expanded }">
          <ArrowDown />
        </el-icon>
        <div class="tool-switch-group">
          <el-tooltip
            :content="isAutoApproveEnabled ? '已开启自动批准' : '点击开启自动批准'"
            placement="top"
            :show-after="500"
          >
            <div
              class="icon-toggle icon-toggle--auto"
              :class="{
                active: isAutoApproveEnabled,
                'is-ineffective': editForm.toolCallConfig.mode !== 'auto',
              }"
              @click.stop="toggleAutoApprove"
            >
              <Zap :size="16" class="toggle-icon" :fill="isAutoApproveEnabled ? 'currentColor' : 'none'" />
            </div>
          </el-tooltip>
          <el-tooltip :content="isToolEnabled ? '工具已启用' : '工具已禁用'" placement="top" :show-after="500">
            <div class="icon-toggle icon-toggle--power" :class="{ active: isToolEnabled }" @click.stop="toggleTool">
              <Power :size="16" class="toggle-icon" />
            </div>
          </el-tooltip>
        </div>
      </div>
    </div>

    <!-- 工具展开区域：方法列表 + 提示词预览 + 可选配置 -->
    <el-collapse-transition>
      <div v-if="expanded" class="tool-settings-container">
        <!-- 工具级覆盖编辑表单 -->
        <el-collapse-transition>
          <div v-if="editingOverrideId === tool.toolId" class="tool-override-form">
            <div class="form-header">
              <span class="form-title">工具模块提示词覆盖</span>
              <div class="form-switch">
                <span class="switch-label">{{ overrideForm.enabled ? "已启用" : "已禁用" }}</span>
                <el-switch v-model="overrideForm.enabled" size="small" />
              </div>
            </div>
            <div class="form-row">
              <el-input
                v-model="overrideForm.displayName"
                placeholder="自定义工具显示名称"
                size="small"
                :disabled="!overrideForm.enabled"
              >
                <template #prefix>
                  <el-icon><Edit /></el-icon>
                </template>
              </el-input>
            </div>
            <div class="form-row">
              <el-input
                v-model="overrideForm.description"
                type="textarea"
                :rows="4"
                placeholder="自定义工具模块描述（优化模型对工具整体用途的理解）"
                size="small"
                :disabled="!overrideForm.enabled"
              />
            </div>
            <div class="form-actions">
              <el-button size="small" @click="cancelOverride">收起</el-button>
              <el-button type="primary" size="small" @click="saveOverride">保存配置</el-button>
              <el-button
                v-if="getOverride(tool.toolId).enabled !== undefined"
                type="danger"
                plain
                size="small"
                @click="
                  removeOverride(tool.toolId);
                  cancelOverride();
                "
              >
                清空配置
              </el-button>
            </div>
          </div>
        </el-collapse-transition>

        <el-divider v-if="editingOverrideId === tool.toolId" style="margin: 12px 0" />

        <!-- 方法管理列表 -->
        <div class="methods-management-section">
          <div class="section-label">方法管理</div>
          <div class="methods-list">
            <div v-for="method in tool.methods" :key="method.name" class="method-item-container">
              <div class="method-item">
                <div class="method-info">
                  <div class="method-name-row">
                    <span class="method-name">
                      {{
                        (getOverride(`${tool.toolId}:${method.name}`).enabled &&
                          getOverride(`${tool.toolId}:${method.name}`).displayName) ||
                        method.name
                      }}
                    </span>
                    <el-tag
                      v-if="getOverride(`${tool.toolId}:${method.name}`).enabled"
                      size="small"
                      type="warning"
                      effect="light"
                      class="override-tag"
                    >
                      覆盖生效中
                    </el-tag>
                  </div>
                  <el-tooltip
                    :content="
                      (getOverride(`${tool.toolId}:${method.name}`).enabled &&
                        getOverride(`${tool.toolId}:${method.name}`).description) ||
                      method.description
                    "
                    placement="top"
                  >
                    <span class="method-desc">
                      {{
                        (getOverride(`${tool.toolId}:${method.name}`).enabled &&
                          getOverride(`${tool.toolId}:${method.name}`).description) ||
                        method.description ||
                        ""
                      }}
                    </span>
                  </el-tooltip>
                </div>
                <div class="method-actions" @click.stop>
                  <el-tooltip
                    :content="getOverride(`${tool.toolId}:${method.name}`).enabled ? '编辑覆盖内容' : '点击配置覆盖'"
                    placement="top"
                    :show-after="500"
                  >
                    <div
                      class="icon-toggle icon-toggle--edit icon-toggle--small"
                      :class="{
                        active: editingOverrideId === `${tool.toolId}:${method.name}`,
                        'is-overridden': !!getOverride(`${tool.toolId}:${method.name}`).enabled,
                      }"
                      @click="startEditingOverride(`${tool.toolId}:${method.name}`, method)"
                    >
                      <Edit style="width: 12px; height: 12px" />
                    </div>
                  </el-tooltip>
                  <el-tooltip
                    :content="isMethodAutoApproveEnabled(method.name) ? '已开启自动批准' : '点击开启自动批准'"
                    placement="top"
                    :show-after="500"
                  >
                    <div
                      class="icon-toggle icon-toggle--auto icon-toggle--small"
                      :class="{
                        active: isMethodAutoApproveEnabled(method.name),
                        'is-ineffective': editForm.toolCallConfig.mode !== 'auto',
                      }"
                      @click="toggleMethodAutoApprove(method.name)"
                    >
                      <Zap
                        :size="14"
                        class="toggle-icon"
                        :fill="isMethodAutoApproveEnabled(method.name) ? 'currentColor' : 'none'"
                      />
                    </div>
                  </el-tooltip>
                  <el-tooltip
                    :content="isMethodEnabled(method.name) ? '方法已启用' : '方法已禁用'"
                    placement="top"
                    :show-after="500"
                  >
                    <div
                      class="icon-toggle icon-toggle--power icon-toggle--small"
                      :class="{ active: isMethodEnabled(method.name) }"
                      @click="toggleMethod(method.name)"
                    >
                      <Power :size="14" class="toggle-icon" />
                    </div>
                  </el-tooltip>
                </div>
              </div>

              <!-- 方法级覆盖编辑表单 -->
              <el-collapse-transition>
                <div v-if="editingOverrideId === `${tool.toolId}:${method.name}`" class="method-override-form">
                  <div class="form-header">
                    <span class="form-title">方法提示词覆盖</span>
                    <div class="form-switch">
                      <span class="switch-label">{{ overrideForm.enabled ? "已启用" : "已禁用" }}</span>
                      <el-switch v-model="overrideForm.enabled" size="small" />
                    </div>
                  </div>
                  <div class="form-row">
                    <el-input
                      v-model="overrideForm.displayName"
                      placeholder="自定义方法显示名称"
                      size="small"
                      :disabled="!overrideForm.enabled"
                    >
                      <template #prefix>
                        <el-icon><Edit /></el-icon>
                      </template>
                    </el-input>
                  </div>
                  <div class="form-row">
                    <el-input
                      v-model="overrideForm.description"
                      type="textarea"
                      :rows="5"
                      placeholder="自定义方法描述（优化模型理解）"
                      size="small"
                      :disabled="!overrideForm.enabled"
                    />
                  </div>
                  <div class="form-row">
                    <el-input
                      v-model="overrideForm.example"
                      type="textarea"
                      :rows="6"
                      placeholder="自定义方法调用示例（Few-shot，帮助模型学习如何调用）"
                      size="small"
                      :disabled="!overrideForm.enabled"
                    />
                  </div>
                  <div class="form-actions">
                    <el-button size="small" @click="cancelOverride">收起</el-button>
                    <el-button type="primary" size="small" @click="saveOverride">保存配置</el-button>
                    <el-button
                      v-if="getOverride(`${tool.toolId}:${method.name}`).enabled !== undefined"
                      type="danger"
                      plain
                      size="small"
                      @click="
                        removeOverride(`${tool.toolId}:${method.name}`);
                        cancelOverride();
                      "
                    >
                      清空配置
                    </el-button>
                  </div>
                </div>
              </el-collapse-transition>
            </div>
          </div>
        </div>

        <el-divider style="margin: 12px 0" />

        <!-- 提示词注入预览 -->
        <div class="prompt-preview-section">
          <div class="preview-header">
            <span class="preview-label">提示词注入预览</span>
            <el-tag size="small" type="info" effect="plain">VCP 纯文本协议</el-tag>
          </div>
          <pre class="preview-content">{{ toolPromptPreview }}</pre>
        </div>
        <!-- 工具配置（如有） -->
        <template v-if="toolSettingsSchema.length > 0">
          <el-divider style="margin: 8px 0" />
          <SettingListRenderer
            :items="toolSettingsSchema"
            :settings="toolSettings"
            @update:settings="updateToolSettings"
          />
        </template>
      </div>
    </el-collapse-transition>
  </div>
</template>

<style scoped>
.tool-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
  transition: background-color 0.15s;
}

.tool-item-wrapper:last-child .tool-item {
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

.methods-count-tag {
  font-size: 11px;
  font-weight: 500;
  margin-left: 4px;
}

.tool-methods {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.method-tag {
  font-family: var(--el-font-family-mono);
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

.icon-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--el-text-color-placeholder);
  opacity: 0.4;
}

.icon-toggle:hover:not(.disabled) {
  background-color: var(--el-fill-color-light);
  opacity: 0.8;
}

.icon-toggle.active {
  opacity: 1;
}

.icon-toggle--auto.active {
  color: var(--el-color-warning);
  filter: drop-shadow(0 0 3px rgba(var(--el-color-warning-rgb), 0.4));
}

.icon-toggle--auto.active.is-ineffective {
  opacity: 0.25;
  filter: none;
}

.icon-toggle--power.active {
  color: var(--el-color-success);
  filter: drop-shadow(0 0 3px rgba(var(--el-color-success-rgb), 0.4));
}

.icon-toggle.disabled {
  cursor: not-allowed;
  opacity: 0.15;
}

.toggle-icon {
  transition: all 0.2s;
}

.expand-icon {
  color: var(--el-text-color-secondary);
  transition: transform 0.2s;
  font-size: 12px;
}

.expand-icon--open {
  transform: rotate(180deg);
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
  display: -webkit-box;
  line-clamp: 2; /* 限制显示两行 */
  -webkit-line-clamp: 2; /* 限制显示两行 */
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-all;
}

.method-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.icon-toggle--small {
  width: 24px;
  height: 24px;
}

.icon-toggle--edit {
  cursor: pointer;
  transition: all 0.2s;
}

.icon-toggle--edit:hover {
  color: var(--el-color-primary);
  background-color: rgba(var(--el-color-primary-rgb), 0.1);
}

.icon-toggle--edit.active {
  color: var(--el-color-primary);
  background-color: rgba(var(--el-color-primary-rgb), 0.1);
  opacity: 1;
}

.icon-toggle--edit.is-overridden {
  color: var(--el-color-warning);
  background-color: rgba(var(--el-color-warning-rgb), 0.1);
  border-color: rgba(var(--el-color-warning-rgb), 0.2);
}

.method-item-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 4px;
}

.method-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.override-tag {
  height: 16px;
  padding: 0 4px;
  font-size: 10px;
  line-height: 14px;
}

.method-override-form,
.tool-override-form {
  margin: 0 4px 8px 12px;
  padding: 12px;
  background: var(--card-bg);
  border: 1px dashed var(--el-color-primary-light-5);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tool-override-form {
  margin: 0 0 12px 0;
}

.form-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.form-title {
  font-size: 12px;
  font-weight: bold;
  color: var(--el-text-color-primary);
}

.form-switch {
  display: flex;
  align-items: center;
  gap: 8px;
}

.switch-label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.form-row {
  width: 100%;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}
</style>
