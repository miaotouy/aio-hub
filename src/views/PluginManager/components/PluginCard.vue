<script setup lang="ts">
import { computed } from "vue";
import { Delete, Setting } from "@element-plus/icons-vue";
import type { PluginProxy } from "@/services/plugin-types";
import Avatar from "@/components/common/Avatar.vue";

// Props
interface Props {
  plugin: PluginProxy;
  selected?: boolean;
}

const props = defineProps<Props>();

const isBroken = computed(() => (props.plugin as any).isBroken);
const brokenError = computed(() => (props.plugin as any).error?.message || '未知错误');

// Emits
const emit = defineEmits<{
  select: [];
  toggle: [];
  settings: [];
  uninstall: [];
}>();

const pluginTypeInfo = computed(() => {
  switch (props.plugin.manifest.type) {
    case "javascript":
      return { text: "JS", type: "success" as const };
    case "sidecar":
      return { text: "Sidecar", type: "warning" as const };
    case "native":
      return { text: "Native", type: "info" as const };
    default:
      return { text: props.plugin.manifest.type, type: "info" as const };
  }
});
</script>

<template>
  <div class="plugin-card" :class="{ selected: selected }" @click="emit('select')">
    <!-- 左侧：图标 + 开关 -->
    <div class="plugin-left">
      <Avatar
        :src="plugin.iconUrl || plugin.manifest.icon || '📦'"
        :size="40"
        :alt="plugin.name"
        shape="square"
        :radius="8"
        :style="{ filter: isBroken ? 'grayscale(1) opacity(0.6)' : 'none' }"
      />
      <div v-if="!isBroken" class="plugin-toggle" @click.stop>
        <el-tooltip :content="plugin.enabled ? '禁用插件' : '启用插件'" placement="right">
          <el-switch :model-value="plugin.enabled" @change="emit('toggle')" />
        </el-tooltip>
      </div>
      <div v-else class="plugin-status-tag" @click.stop>
        <el-tag type="danger" size="small" effect="dark">损坏</el-tag>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="plugin-content">
      <!-- 第一行：名字 + 徽章 + 操作按钮（可换行） -->
      <div class="plugin-top">
        <div class="plugin-name-badges">
          <h3 class="plugin-name">{{ plugin.name }}</h3>
          <div class="plugin-badges">
            <el-tag :type="pluginTypeInfo.type" size="small" effect="plain">
              {{ pluginTypeInfo.text }}
            </el-tag>
            <el-tag v-if="plugin.devMode" type="info" size="small" effect="plain"> Dev </el-tag>
            <el-tag v-if="isBroken" type="danger" size="small" effect="plain"> 损坏 </el-tag>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="plugin-actions" @click.stop>
          <el-button
            v-if="!isBroken && plugin.manifest.settingsSchema"
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
          <el-button
            v-else
            :icon="Delete"
            size="small"
            type="danger"
            text
            @click="emit('uninstall')"
          >
            卸载
          </el-button>
        </div>
      </div>

      <!-- 元信息 -->
      <div class="plugin-meta">
        <span class="plugin-version">v{{ plugin.manifest.version }}</span>
        <span class="plugin-separator">·</span>
        <span class="plugin-author">{{ plugin.manifest.author }}</span>
      </div>

      <!-- 标签 -->
      <div v-if="plugin.manifest.tags && plugin.manifest.tags.length > 0" class="plugin-tags">
        <el-tag
          v-for="tag in plugin.manifest.tags"
          :key="tag"
          size="small"
          effect="plain"
          type="info"
          class="tag-item"
        >
          {{ tag }}
        </el-tag>
      </div>

      <!-- 描述 -->
      <p v-if="!isBroken" class="plugin-description" @click.stop>{{ plugin.description }}</p>
      <p v-else class="plugin-description broken-error" @click.stop>
        加载失败: {{ brokenError }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.plugin-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  background-color: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  transition: all 0.2s ease;
  cursor: pointer;
  backdrop-filter: blur(var(--ui-blur));
}

.plugin-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.plugin-card.selected {
  border-color: var(--primary-color);
  background-color: var(--primary-color-light-9);
  box-shadow: 0 2px 12px rgba(64, 158, 255, 0.15);
}

.plugin-left {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.plugin-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.plugin-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}

.plugin-name-badges {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 200px;
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

.plugin-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.plugin-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-color-secondary);
}

.plugin-version {
  font-weight: 500;
}

.plugin-separator {
  color: var(--border-color);
}

.plugin-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}

.tag-item {
  font-size: 11px;
  padding: 0 6px;
  height: 20px;
  line-height: 20px;
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

.plugin-toggle, .plugin-status-tag {
  display: flex;
  justify-content: center;
}

.broken-error {
  color: var(--el-color-danger) !important;
  font-family: monospace;
  font-size: 12px;
}

:deep(.el-button) {
  margin-left: 0px;
}
</style>
