<script setup lang="ts">
import { Delete, Setting, InfoFilled } from "@element-plus/icons-vue";
import type { PluginProxy } from "@/services/plugin-types";

// Props
interface Props {
  plugin: PluginProxy;
}

defineProps<Props>();

// Emits
const emit = defineEmits<{
  toggle: [];
  detail: [];
  settings: [];
  uninstall: [];
}>();
</script>

<template>
  <div class="plugin-card">
    <!-- 左侧：图标和主要信息 -->
    <div class="plugin-main">
      <div class="plugin-icon">📦</div>
      <div class="plugin-info">
        <div class="plugin-name-line">
          <h3 class="plugin-name">{{ plugin.name }}</h3>
          <div class="plugin-badges">
            <el-tag
              :type="plugin.manifest.type === 'javascript' ? 'success' : 'warning'"
              size="small"
              effect="plain"
            >
              {{ plugin.manifest.type === "javascript" ? "JS" : "Sidecar" }}
            </el-tag>
            <el-tag v-if="plugin.devMode" type="info" size="small" effect="plain"> Dev </el-tag>
          </div>
        </div>
        <div class="plugin-meta">
          <span class="plugin-version">v{{ plugin.manifest.version }}</span>
          <span class="plugin-separator">·</span>
          <span class="plugin-author">{{ plugin.manifest.author }}</span>
        </div>
        <p class="plugin-description">{{ plugin.description }}</p>
      </div>
    </div>

    <!-- 右侧：操作按钮 -->
    <div class="plugin-actions">
      <el-button :icon="InfoFilled" size="small" text @click="emit('detail')">
        详情
      </el-button>
      
      <el-button
        v-if="plugin.manifest.settingsSchema"
        :icon="Setting"
        size="small"
        text
        @click="emit('settings')"
      >
        设置
      </el-button>

      <el-tooltip
        v-if="plugin.devMode"
        content="开发模式插件无法卸载，请手动删除源码目录"
        placement="top"
      >
        <el-button :icon="Delete" size="small" type="danger" text disabled> 卸载 </el-button>
      </el-tooltip>
      <el-button v-else :icon="Delete" size="small" type="danger" text @click="emit('uninstall')">
        卸载
      </el-button>

      <el-tooltip :content="plugin.enabled ? '禁用插件' : '启用插件'" placement="top">
        <el-switch :model-value="plugin.enabled" @change="emit('toggle')" />
      </el-tooltip>
    </div>
  </div>
</template>

<style scoped>
.plugin-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  transition: all 0.2s ease;
}

.plugin-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.plugin-main {
  flex: 1;
  display: flex;
  gap: 12px;
  min-width: 0;
}

.plugin-icon {
  font-size: 32px;
  flex-shrink: 0;
  line-height: 1;
}

.plugin-info {
  flex: 1;
  min-width: 0;
}

.plugin-name-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.plugin-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.plugin-badges {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.plugin-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-bottom: 6px;
}

.plugin-version {
  font-weight: 500;
}

.plugin-separator {
  color: var(--border-color);
}

.plugin-description {
  font-size: 13px;
  color: var(--text-color);
  line-height: 1.5;
  margin: 0;
  display: -webkit-box;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.plugin-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
