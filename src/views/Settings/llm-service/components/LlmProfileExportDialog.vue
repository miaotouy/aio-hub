<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
-->

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { Download, Search } from "lucide-vue-next";
import BaseDialog from "@/components/common/BaseDialog.vue";
import DynamicIcon from "@/components/common/DynamicIcon.vue";
import type { LlmProfile } from "@/types/llm-profiles";
import { createLlmProfileBundle } from "@/utils/llm-profile-transfer";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useModelMetadata } from "@/composables/useModelMetadata";
import { providerTypes } from "@/config/llm-providers";

interface Props {
  visible: boolean;
  profiles: LlmProfile[];
  selectedProfileId?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
  selectedProfileId: null,
});
const emit = defineEmits<{
  (event: "update:visible", value: boolean): void;
}>();

const errorHandler = createModuleErrorHandler("LlmProfileExport");
const includeSecrets = ref(false);
const exporting = ref(false);
const searchQuery = ref("");

// 选中的渠道 ID 集合
const selectedIds = ref<Set<string>>(new Set());

// ─── 图标与元数据 ───
const { getDisplayIconPath, getIconPath } = useModelMetadata();

const getProviderIcon = (profile: LlmProfile) => {
  if (profile.icon) {
    return getDisplayIconPath(profile.icon);
  }
  const iconPath = getIconPath("", profile.type);
  return iconPath ? getDisplayIconPath(iconPath) : null;
};

const getProviderTypeName = (type: string) => {
  return providerTypes.find((p) => p.type === type)?.name || type;
};

// 过滤后的渠道列表
const filteredProfiles = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return props.profiles;
  return props.profiles.filter((profile) => {
    const nameMatch = profile.name.toLowerCase().includes(query);
    const typeName = getProviderTypeName(profile.type).toLowerCase();
    const typeMatch =
      typeName.includes(query) || profile.type.toLowerCase().includes(query);
    return nameMatch || typeMatch;
  });
});

// 选中的渠道对象列表
const selectedProfiles = computed(() =>
  props.profiles.filter((profile) => selectedIds.value.has(profile.id))
);

// ─── 全选与半选状态 ───
const isAllSelected = computed({
  get: () => {
    if (filteredProfiles.value.length === 0) return false;
    return filteredProfiles.value.every((p) => selectedIds.value.has(p.id));
  },
  set: (val) => {
    if (val) {
      filteredProfiles.value.forEach((p) => selectedIds.value.add(p.id));
    } else {
      filteredProfiles.value.forEach((p) => selectedIds.value.delete(p.id));
    }
  },
});

const isIndeterminate = computed(() => {
  const filtered = filteredProfiles.value;
  if (filtered.length === 0) return false;
  const selectedCount = filtered.filter((p) =>
    selectedIds.value.has(p.id)
  ).length;
  return selectedCount > 0 && selectedCount < filtered.length;
});

const handleSelectAllChange = (val: boolean) => {
  isAllSelected.value = val;
};

const toggleSelect = (id: string) => {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id);
  } else {
    selectedIds.value.add(id);
  }
};

// ─── 弹窗打开时的默认选中逻辑 ───
watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    searchQuery.value = "";
    includeSecrets.value = false;
    selectedIds.value.clear();

    if (props.selectedProfileId) {
      // 如果有选中的渠道，默认只勾选当前渠道
      selectedIds.value.add(props.selectedProfileId);
    } else {
      // 如果没有选中的渠道（比如从侧边栏头部点击），默认全选所有渠道
      props.profiles.forEach((p) => selectedIds.value.add(p.id));
    }
  },
  { immediate: true }
);

const sanitizeFileName = (value: string) =>
  value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/[. ]+$/g, "") || "llm-channel";

const defaultFileName = computed(() => {
  if (selectedProfiles.value.length === 1) {
    return `${sanitizeFileName(selectedProfiles.value[0].name)}.aio-llm.json`;
  }
  return `aiohub-llm-channels.aio-llm.json`;
});

const handleExport = async () => {
  if (!selectedProfiles.value.length) {
    customMessage.warning("请选择要导出的渠道");
    return;
  }

  exporting.value = true;
  try {
    const filePath = await save({
      title: "导出 LLM 渠道",
      defaultPath: defaultFileName.value,
      filters: [{ name: "AIO Hub LLM 渠道", extensions: ["json"] }],
    });
    if (!filePath) return;

    const bundle = createLlmProfileBundle(selectedProfiles.value, {
      includeSecrets: includeSecrets.value,
    });
    await writeTextFile(filePath, JSON.stringify(bundle, null, 2));
    customMessage.success(`已成功导出 ${bundle.profiles.length} 个渠道`);
    emit("update:visible", false);
  } catch (error) {
    errorHandler.error(error, "导出 LLM 渠道失败");
  } finally {
    exporting.value = false;
  }
};
</script>

<template>
  <BaseDialog
    :model-value="visible"
    title="导出 LLM 渠道"
    width="560px"
    height="75vh"
    @update:model-value="(value: boolean) => emit('update:visible', value)"
  >
    <template #content>
      <div
        class="export-dialog-content"
        data-testid="llm-profile-export-dialog"
      >
        <!-- 敏感信息开关 -->
        <div class="setting-row">
          <div class="setting-copy">
            <div class="setting-label">包含敏感信息</div>
            <div class="setting-hint">
              开启时会包含 API Key、自定义请求头等凭据，请妥善保管导出文件。
            </div>
          </div>
          <el-switch
            v-model="includeSecrets"
            data-testid="llm-profile-export-secrets"
          />
        </div>

        <el-alert
          v-if="includeSecrets"
          title="导出文件将包含可直接使用的凭据，请仅保存到受信任位置。"
          type="warning"
          :closable="false"
          show-icon
          class="security-alert"
        />

        <!-- 渠道选择区域 -->
        <div class="channel-selector-section">
          <div class="selector-header">
            <span class="section-title">选择要导出的渠道</span>
            <el-input
              v-model="searchQuery"
              placeholder="搜索渠道名称或类型..."
              size="small"
              clearable
              class="search-input"
              :prefix-icon="Search"
            />
          </div>

          <!-- 全选与统计 -->
          <div class="selector-toolbar">
            <el-checkbox
              v-model="isAllSelected"
              :indeterminate="isIndeterminate"
              @change="handleSelectAllChange"
            >
              全选 (已选 {{ selectedIds.size }} / {{ filteredProfiles.length }})
            </el-checkbox>
          </div>

          <!-- 渠道列表滚动区 -->
          <div class="channel-list-scroll">
            <div
              v-for="profile in filteredProfiles"
              :key="profile.id"
              class="channel-item"
              :class="{ checked: selectedIds.has(profile.id) }"
              @click="toggleSelect(profile.id)"
            >
              <el-checkbox
                :model-value="selectedIds.has(profile.id)"
                @click.stop
                @change="toggleSelect(profile.id)"
              />
              <DynamicIcon
                :src="getProviderIcon(profile) || ''"
                class="profile-icon"
                :alt="profile.name"
              />
              <div class="profile-info">
                <div class="profile-name">{{ profile.name }}</div>
                <div class="profile-meta">
                  <span class="profile-type">{{
                    getProviderTypeName(profile.type)
                  }}</span>
                  <span class="divider">·</span>
                  <span class="profile-models"
                    >{{ profile.models.length }} 个模型</span
                  >
                </div>
              </div>
            </div>
            <div v-if="filteredProfiles.length === 0" class="empty-search">
              无匹配的渠道
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="exporting"
        :disabled="!selectedProfiles.length"
        data-testid="llm-profile-export-submit"
        @click="handleExport"
      >
        <Download :size="15" />
        导出 ({{ selectedProfiles.length }})
      </el-button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.export-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;
  min-height: 0;
}

.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding-bottom: 14px;
  border-bottom: var(--border-width) solid var(--border-color);
  flex-shrink: 0;
}

.setting-copy {
  min-width: 0;
}

.setting-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
}

.setting-hint {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-color-secondary);
}

.security-alert {
  flex-shrink: 0;
}

/* 渠道选择器区域 */
.channel-selector-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background: rgba(var(--primary-color-rgb), calc(var(--card-opacity) * 0.02));
  min-height: 0;
  overflow: hidden;
}

.selector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-bottom: var(--border-width) solid var(--border-color);
  background: rgba(var(--primary-color-rgb), calc(var(--card-opacity) * 0.04));
  gap: 12px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
  white-space: nowrap;
}

.search-input {
  width: 200px;
}

.selector-toolbar {
  padding: 8px 12px;
  border-bottom: var(--border-width) solid var(--border-color);
  background: rgba(var(--primary-color-rgb), calc(var(--card-opacity) * 0.02));
}

.channel-list-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
}

.channel-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
  margin-bottom: 4px;
}

.channel-item:hover {
  background: rgba(var(--primary-color-rgb), calc(var(--card-opacity) * 0.05));
}

.channel-item.checked {
  background: rgba(var(--primary-color-rgb), calc(var(--card-opacity) * 0.08));
}

.profile-icon {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  flex-shrink: 0;
}

.profile-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.profile-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.profile-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-color-secondary);
}

.divider {
  opacity: 0.5;
}

.empty-search {
  padding: 32px;
  text-align: center;
  color: var(--text-color-secondary);
  font-size: 13px;
}
</style>
