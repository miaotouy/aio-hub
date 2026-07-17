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
import { ref, onMounted, watch, computed } from "vue";
import { RotateCcw, Search } from "lucide-vue-next";
import { ElMessageBox } from "element-plus";
import { useRecallCollectionStore } from "../stores/recallCollectionStore";
import { useRecallIndexer } from "../composables/useRecallIndexer";
import SettingListRenderer from "@/components/common/SettingListRenderer.vue";
import { customMessage } from "@/utils/customMessage";

const store = useRecallCollectionStore();
const { detectDimension } = useRecallIndexer();

const activeCollapse = ref<string[]>([]);
const searchQuery = ref("");

// 缓存用户手动调整的折叠状态，便于清空搜索后恢复
const userActiveCollapse = ref<string[]>([]);

// 监听配置变化，初始化折叠状态
watch(
  () => store.settingsConfig,
  (newConfig) => {
    if (activeCollapse.value.length === 0 && newConfig.length > 0) {
      const allTitles = newConfig.map((s: any) => s.title);
      activeCollapse.value = allTitles;
      userActiveCollapse.value = [...allTitles];
    }
  },
  { immediate: true }
);

// 核心搜索过滤逻辑
const filteredSettingsConfig = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return store.settingsConfig;

  return store.settingsConfig
    .map((section: any) => {
      const matchedItems = section.items
        .filter((item: any) => {
          const label = (item.label || "").toLowerCase();
          const hint = (item.hint || "").toLowerCase();
          const keywords = (item.keywords || "").toLowerCase();
          return (
            label.includes(query) ||
            hint.includes(query) ||
            keywords.includes(query)
          );
        })
        // 搜索时去掉折叠分组，让命中的高级参数直接平铺展示
        .map((item: any) => {
          if (item.groupCollapsible) {
            const { groupCollapsible: _omit, ...rest } = item;
            return rest;
          }
          return item;
        });

      return { ...section, items: matchedItems };
    })
    .filter((section: any) => section.items.length > 0);
});

// 监听折叠面板的手动切换（仅非搜索状态记录）
const handleCollapseChange = (val: any) => {
  if (!searchQuery.value.trim()) {
    userActiveCollapse.value = Array.isArray(val) ? val : [val];
  }
};

// 搜索词变化时，自动展开匹配分类；清空时恢复用户折叠状态
watch(searchQuery, (newQuery) => {
  if (newQuery.trim()) {
    activeCollapse.value = filteredSettingsConfig.value.map(
      (s: any) => s.title
    );
  } else {
    activeCollapse.value = [...userActiveCollapse.value];
  }
});

const handleUpdate = (newConfig: any) => {
  store.config = newConfig;
  store.saveWorkspace();
};

const handleAction = (action: string) => {
  if (action === "detectDimension") {
    detectDimension();
  }
};

const handleReset = async () => {
  try {
    await ElMessageBox.confirm(
      "确定要将思绪集全局设置重置为默认值吗？此操作不可撤销。",
      "重置确认",
      {
        confirmButtonText: "确定重置",
        cancelButtonText: "取消",
        type: "warning",
        lockScroll: false,
      }
    );
    store.resetConfig();
    customMessage.success("设置已重置为默认值");
  } catch {
    // 用户取消
  }
};

onMounted(() => {
  store.loadBases();
});
</script>

<template>
  <div class="settings-view">
    <el-form :model="store.config" label-position="top" class="settings-form">
      <div class="settings-header">
        <div class="header-info">
          <h3 class="header-title">思绪集全局配置</h3>
          <p class="header-desc">配置向量化模型、索引策略及存储参数</p>
        </div>
        <el-button :icon="RotateCcw" @click="handleReset" plain type="danger">
          一键重置
        </el-button>
      </div>

      <!-- 搜索栏 -->
      <el-input
        v-model="searchQuery"
        class="settings-search"
        placeholder="搜索设置项（支持名称、描述或关键字，如 embedding、维度、重试）"
        clearable
        :prefix-icon="Search"
      />

      <el-collapse
        v-if="filteredSettingsConfig.length > 0"
        v-model="activeCollapse"
        @change="handleCollapseChange"
      >
        <el-collapse-item
          v-for="section in filteredSettingsConfig"
          :key="section.title"
          :name="section.title"
        >
          <template #title>
            <div class="collapse-title">
              <el-icon><component :is="section.icon" /></el-icon>
              <span>{{ section.title }}</span>
              <el-tag
                v-if="searchQuery.trim()"
                size="small"
                type="info"
                class="match-tag"
              >
                {{ section.items.length }} 项匹配
              </el-tag>
            </div>
          </template>
          <div class="section-content">
            <SettingListRenderer
              :items="section.items"
              :settings="store.config"
              @update:settings="handleUpdate"
              @action="handleAction"
            />
          </div>
        </el-collapse-item>
      </el-collapse>

      <!-- 搜索无结果空状态 -->
      <el-empty
        v-else
        class="empty-state"
        description="未找到相关设置项，换个关键词试试吧"
        :image-size="100"
      />
    </el-form>
  </div>
</template>

<style scoped>
.settings-view {
  height: 100%;
  overflow-y: auto;
  background-color: transparent;
  box-sizing: border-box;
}

.settings-form {
  max-width: 800px;
  margin: 0 auto;
  padding: 24px;
  padding-bottom: 48px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 16px;
  border-bottom: var(--border-width) solid var(--border-color);
}

.header-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.header-desc {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.settings-search :deep(.el-input__wrapper) {
  background-color: var(--input-bg);
  backdrop-filter: blur(var(--ui-blur));
  border-radius: 8px;
  box-shadow: none;
  border: var(--border-width) solid var(--border-color);
}

.settings-search :deep(.el-input__wrapper.is-focus) {
  border-color: var(--el-color-primary);
}

.collapse-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 600;
  width: 100%;
}

.match-tag {
  margin-left: auto;
  margin-right: 12px;
}

.section-content {
  padding: 12px 8px;
}

.empty-state {
  padding: 40px 0;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) dashed var(--border-color);
  border-radius: 12px;
}

:deep(.el-form-item__label) {
  font-weight: 500;
  padding-bottom: 8px !important;
}

:deep(.el-input-number) {
  width: 100%;
}
</style>
