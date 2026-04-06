<script setup lang="ts">
import { inject, computed, onMounted } from "vue";
import { InfoFilled } from "@element-plus/icons-vue";
import { useToolCalling } from "@/tools/tool-calling/composables/useToolCalling";
import { DEFAULT_AGENT_EXTENSION_CONFIG } from "@/tools/llm-chat/types/agent";

const toolContextMacro = "{{tool_context}}";

const editForm = inject<any>("agent-edit-form");

const { getDiscoveredExtensions } = useToolCalling();

const discoveredExtensions = computed(() => {
  return getDiscoveredExtensions();
});

const ensureConfig = () => {
  if (!editForm) return;
  if (!editForm.extensionConfig) {
    editForm.extensionConfig = JSON.parse(JSON.stringify(DEFAULT_AGENT_EXTENSION_CONFIG));
  }
  if (!editForm.extensionConfig.extensionToggles) {
    editForm.extensionConfig.extensionToggles = {};
  }
};

onMounted(() => {
  ensureConfig();
});

const isEnabled = computed({
  get: () => editForm?.extensionConfig?.enabled ?? false,
  set: (val) => {
    ensureConfig();
    editForm.extensionConfig.enabled = val;
  },
});

const toggleExtension = (id: string, enabled: boolean) => {
  ensureConfig();
  editForm.extensionConfig.extensionToggles[id] = enabled;
};

const isExtensionEnabled = (id: string) => {
  if (!editForm?.extensionConfig?.extensionToggles) return editForm?.extensionConfig?.defaultExtensionEnabled ?? true;
  const toggle = editForm.extensionConfig.extensionToggles[id];
  if (typeof toggle === "boolean") return toggle;
  return editForm.extensionConfig.defaultExtensionEnabled;
};
</script>

<template>
  <div class="agent-section" v-if="editForm">
    <div class="section-group" data-setting-id="environmentEnhancement">
      <div class="section-header">
        <div class="section-group-title">环境增强 (Context)</div>
        <el-switch v-model="isEnabled" />
      </div>
      <div class="form-hint">
        允许 Agent 感知当前的运行时环境、用户偏好或其他实时上下文。启用后，相关信息将通过
        <code style="color: var(--el-color-primary)">{{ toolContextMacro }}</code>
        宏注入到提示词中。
      </div>

      <template v-if="editForm.extensionConfig?.enabled">
        <div class="extension-config-grid">
          <el-form-item label="默认启用新插件">
            <el-switch v-model="editForm.extensionConfig.defaultExtensionEnabled" />
          </el-form-item>
        </div>

        <div class="extensions-box">
          <div class="box-header">
            <span class="box-title">可用环境增强插件</span>
          </div>

          <div v-if="discoveredExtensions.length === 0" class="empty-extensions">
            <el-empty :image-size="40" description="未发现可用的环境增强插件" />
          </div>

          <div v-else class="extensions-list">
            <div v-for="ext in discoveredExtensions" :key="ext.id" class="extension-item">
              <div class="extension-info">
                <div class="extension-icon">
                  <el-icon v-if="ext.icon"><component :is="ext.icon" /></el-icon>
                  <el-icon v-else><InfoFilled /></el-icon>
                </div>
                <div class="extension-meta">
                  <div class="extension-name">{{ ext.name }}</div>
                  <div class="extension-desc">{{ ext.description || "提供额外的运行时上下文信息" }}</div>
                </div>
              </div>
              <div class="extension-action">
                <el-switch
                  :model-value="isExtensionEnabled(ext.id)"
                  @update:model-value="toggleExtension(ext.id, $event)"
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

.extension-config-grid {
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

.extension-config-grid :deep(.el-form-item) {
  margin-bottom: 0;
  display: flex;
  align-items: center;
}

.extensions-box {
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

.extensions-list {
  display: flex;
  flex-direction: column;
}

.extension-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: var(--border-width) solid var(--border-color);
}

.extension-item:last-child {
  border-bottom: none;
}

.extension-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.extension-icon {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background-color: var(--el-fill-color);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: var(--el-color-primary);
  flex-shrink: 0;
}

.extension-meta {
  flex: 1;
  min-width: 0;
}

.extension-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  margin-bottom: 2px;
}

.extension-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.empty-extensions {
  padding: 32px;
  display: flex;
  justify-content: center;
}
</style>
