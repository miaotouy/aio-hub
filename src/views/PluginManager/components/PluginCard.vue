<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<script setup lang="ts">
import { computed } from "vue";
import { Delete, Setting, WarningFilled } from "@element-plus/icons-vue";
import type { PluginProxy } from "@/services/plugin-types";
import { getPrimaryPluginDiagnostic } from "@/services/plugin-diagnostics";
import Avatar from "@/components/common/Avatar.vue";

// Props
interface Props {
  plugin: PluginProxy;
  selected?: boolean;
}

const props = defineProps<Props>();

const isBroken = computed(() => props.plugin.isBroken === true);
const errorDiagnostics = computed(() => {
  const diagnostics = (props.plugin.diagnostics ?? []).filter(
    (item) => item.severity === "error"
  );
  if (diagnostics.length > 0) return diagnostics;

  const fallback = getPrimaryPluginDiagnostic(props.plugin);
  return [
    fallback ?? {
      code: "PLUGIN_UNKNOWN_FAILURE",
      severity: "error" as const,
      title: "插件不可用",
      message:
        props.plugin.error?.message || "未记录具体故障原因，请查看应用日志",
      details: [
        { label: "插件 ID", value: props.plugin.manifest.id },
        { label: "安装目录", value: props.plugin.installPath },
      ],
    },
  ];
});

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
  <div
    class="plugin-card"
    :class="{ selected: selected }"
    @click="emit('select')"
  >
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
        <el-tooltip
          :content="plugin.enabled ? '禁用插件' : '启用插件'"
          placement="right"
        >
          <el-switch :model-value="plugin.enabled" @change="emit('toggle')" />
        </el-tooltip>
      </div>
      <div v-else class="plugin-status-tag" @click.stop>
        <el-tag type="danger" size="small" effect="dark">不可用</el-tag>
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
            <el-tag
              v-if="plugin.devMode"
              type="info"
              size="small"
              effect="plain"
            >
              Dev
            </el-tag>
            <el-tag v-if="isBroken" type="danger" size="small" effect="plain">
              不可用
            </el-tag>
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
            <el-button :icon="Delete" size="small" type="danger" text disabled>
              卸载
            </el-button>
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
      <div
        v-if="plugin.manifest.tags && plugin.manifest.tags.length > 0"
        class="plugin-tags"
      >
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
      <p v-if="!isBroken" class="plugin-description" @click.stop>
        {{ plugin.description }}
      </p>
      <div v-else class="plugin-diagnostics" @click.stop>
        <section
          v-for="diagnostic in errorDiagnostics"
          :key="`${diagnostic.code}-${diagnostic.message}`"
          class="diagnostic-item"
        >
          <div class="diagnostic-heading">
            <el-icon :size="15"><WarningFilled /></el-icon>
            <strong>{{ diagnostic.title }}</strong>
            <code>{{ diagnostic.code }}</code>
          </div>
          <p class="diagnostic-message">{{ diagnostic.message }}</p>
          <dl v-if="diagnostic.details?.length" class="diagnostic-details">
            <div v-for="detail in diagnostic.details" :key="detail.label">
              <dt>{{ detail.label }}</dt>
              <dd>{{ detail.value }}</dd>
            </div>
          </dl>
          <p v-if="diagnostic.resolution" class="diagnostic-resolution">
            处理建议：{{ diagnostic.resolution }}
          </p>
        </section>
      </div>
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

.plugin-toggle,
.plugin-status-tag {
  display: flex;
  justify-content: center;
}

.plugin-diagnostics {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-left: 3px solid var(--el-color-danger);
  padding-left: 10px;
}

.diagnostic-item {
  min-width: 0;
}

.diagnostic-heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--el-color-danger);
  font-size: 13px;
}

.diagnostic-heading code {
  color: var(--text-color-secondary);
  font-size: 11px;
  font-weight: 400;
  overflow-wrap: anywhere;
}

.diagnostic-message,
.diagnostic-resolution {
  margin: 4px 0 0;
  color: var(--text-color);
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.diagnostic-details {
  display: grid;
  gap: 3px;
  margin: 6px 0 0;
  font-size: 12px;
}

.diagnostic-details > div {
  display: grid;
  grid-template-columns: minmax(88px, 120px) minmax(0, 1fr);
  gap: 8px;
}

.diagnostic-details dt {
  color: var(--text-color-secondary);
}

.diagnostic-details dd {
  margin: 0;
  color: var(--text-color);
  font-family: monospace;
  overflow-wrap: anywhere;
}

.diagnostic-resolution {
  color: var(--el-color-warning-dark-2);
}

:deep(.el-button) {
  margin-left: 0px;
}
</style>
