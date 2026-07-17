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
import { inject, computed, ref, onMounted, type Ref } from "vue";
import { InfoFilled, Search, Plus } from "@element-plus/icons-vue";
import { useRecallCollectionStore } from "@/tools/recall/stores/recallCollectionStore";
import type { RecallBinding } from "@/tools/agent-manager/types/agent";
import type { SettingItem } from "@/types/settings-renderer";
import KnowledgeBaseItem from "./KnowledgeBaseItem.vue";
import SettingListRenderer from "@/components/common/SettingListRenderer.vue";

// 宏示例常量
const recallMacro = "{{recall}}";
const recallNameMacro = "{{recall::<collection-id>}}";
const recallListMacro = "{{recall_list}}";

const editForm = inject<any>("agent-edit-form");
const activeTab = inject<Ref<string>>("active-tab");

const recallStore = useRecallCollectionStore();

// 确保配置存在
const ensureConfig = () => {
  if (!editForm.recallConfig) {
    editForm.recallConfig = {
      enabled: false,
      bindings: [],
      groups: [],
      autoInjectIfMacroMissing: true,
      autoInjectPosition: "context_head",
    };
  }
  if (!editForm.recallConfig.bindings) {
    editForm.recallConfig.bindings = [];
  }
  if (!editForm.recallConfig.groups) {
    editForm.recallConfig.groups = [];
  }
};

// 初始化
ensureConfig();

// 初始化知识库设置 + 旧版数据迁移
if (!editForm.recallSettings) {
  editForm.recallSettings = {
    defaultProfile: "semantic",
    defaultLimit: 5,
    maxRecallChars: 0,
    defaultMinScore: 0.3,
    resultTemplate: "---\n### 相关内容 (共 {count} 条)\n\n{items}\n---",
    emptyText: "（未检索到相关内容）",
    gateScanDepth: 3,
    enableCache: true,
  };
} else {
  if (editForm.recallSettings.gateScanDepth === undefined) {
    editForm.recallSettings.gateScanDepth = 3;
  }
  if (editForm.recallSettings.enableCache === undefined) {
    editForm.recallSettings.enableCache = true;
  }
}

// 初始化知识库 store
if (recallStore.bases.length === 0) {
  recallStore.init();
}

// 宏检查
const isRecallMacroMissing = computed(() => {
  if (!editForm.recallConfig?.enabled) return false;
  const messages = editForm.presetMessages || [];
  return !messages.some((m: any) => {
    if (m.enabled === false || !m.content) return false;
    const content = m.content;
    return (
      content.includes("{{recall}}") ||
      content.includes("{{recall::") ||
      content.includes("{{recall_list}}") ||
      content.includes("【recall")
    );
  });
});

const switchToPersonality = () => {
  if (activeTab) {
    activeTab.value = "personality";
  }
};

// 搜索
const searchQuery = ref("");
const filteredBindings = computed(() => {
  const bindings = editForm.recallConfig?.bindings || [];
  if (!searchQuery.value) return bindings;
  const q = searchQuery.value.toLowerCase();
  return bindings.filter(
    (b: RecallBinding) =>
      b.recallName.toLowerCase().includes(q) || b.recallId.toLowerCase().includes(q)
  );
});

// 展开的知识库 ID
const expandedRecallId = ref<string | null>(null);

const toggleExpand = (recallId: string) => {
  expandedRecallId.value = expandedRecallId.value === recallId ? null : recallId;
};

// 添加知识库
const showAddSelector = ref(false);
const availableBases = computed(() => {
  const existingIds = new Set(
    (editForm.recallConfig?.bindings || []).map(
      (b: RecallBinding) => b.recallId
    )
  );
  return recallStore.bases.filter((b) => !existingIds.has(b.id));
});

const addRecallCollection = (base: { id: string; name: string }) => {
  ensureConfig();
  editForm.recallConfig.bindings.push({
    recallId: base.id,
    recallName: base.name,
    enabled: true,
    when: "always",
  } as RecallBinding);
  showAddSelector.value = false;
};

// 移除知识库
const removeBinding = (recallId: string) => {
  ensureConfig();
  const idx = editForm.recallConfig.bindings.findIndex(
    (b: RecallBinding) => b.recallId === recallId
  );
  if (idx !== -1) {
    editForm.recallConfig.bindings.splice(idx, 1);
  }
};

// 切换单个知识库的启用状态
const toggleBinding = (recallId: string, enabled: boolean) => {
  const binding = editForm.recallConfig.bindings.find(
    (b: RecallBinding) => b.recallId === recallId
  );
  if (binding) {
    binding.enabled = enabled;
  }
};

// 知识库高级设置（精简版：移除传统 RAG 残留，对齐记忆系统定位）
const recallAdvancedSettings = computed<SettingItem[]>(() => [
  {
    id: "recallDefaultProfile",
    label: "默认召回配置",
    component: "ElSelect",
    modelPath: "recallSettings.defaultProfile",
    hint: "semantic 用于稳定语义检索，associative 用于联想式多信号召回。",
    keywords: "recall profile 思绪 召回 配置",
    props: { style: { width: "100%" } },
    options: () => [
      {
        label: "语义 (semantic)",
        value: "semantic",
        description: "稳定的语义相关性召回",
      },
      {
        label: "联想 (associative)",
        value: "associative",
        description: "标签和多信号的联想式召回",
      },
    ],
    groupCollapsible: {
      name: "recall-advanced",
      title: "思绪高级设置",
    },
  },
  {
    id: "recallDefaultLimit",
    label: "召回上限",
    component: "SliderWithInput",
    modelPath: "recallSettings.defaultLimit",
    hint: "检索结果的数量上限。实际截断以最低分数为主要依据——即使设为 50，只有超过分数阈值的条目才会被召回。",
    keywords: "recall limit 思绪 召回 上限",
    props: { min: 1, max: 50, step: 1, controlsPosition: "right" },
    groupCollapsible: {
      name: "recall-advanced",
      title: "思绪高级设置",
    },
  },
  {
    id: "recallDefaultMinScore",
    label: "最低分数阈值",
    component: "SliderWithInput",
    modelPath: "recallSettings.defaultMinScore",
    hint: "低于此相关度分数的条目直接丢弃。这是实际的截断依据，比召回上限更重要。",
    keywords: "recall score 思绪 分数 阈值 截断",
    props: { min: 0, max: 1, step: 0.05, controlsPosition: "right" },
    groupCollapsible: {
      name: "recall-advanced",
      title: "思绪高级设置",
    },
  },
  {
    id: "recallMaxChars",
    label: "召回字数上限",
    component: "SliderWithInput",
    modelPath: "recallSettings.maxRecallChars",
    hint: "检索结果的总字数上限，0 表示不限制。超出部分将被丢弃。",
    keywords: "recall char 思绪 字数",
    props: { min: 0, step: 100, controlsPosition: "right" },
    groupCollapsible: {
      name: "recall-advanced",
      title: "思绪高级设置",
    },
  },
  {
    id: "recallGateScanDepth",
    label: "门控扫描深度",
    component: "SliderWithInput",
    modelPath: "recallSettings.gateScanDepth",
    hint: "标签门控 (gate) 模式下，扫描最近多少条消息以匹配关键词",
    keywords: "recall gate 思绪 深度",
    props: { min: 1, max: 20, step: 1, controlsPosition: "right" },
    groupCollapsible: {
      name: "recall-advanced",
      title: "思绪高级设置",
    },
  },
  {
    id: "recallEnableCache",
    label: "启用检索缓存",
    layout: "inline",
    component: "ElSwitch",
    modelPath: "recallSettings.enableCache",
    hint: "精确文本匹配缓存：同一查询文本直接复用结果，避免重复检索。适用于同轮多占位符和重试场景。",
    keywords: "recall cache 思绪 缓存",
    groupCollapsible: {
      name: "recall-advanced",
      title: "思绪高级设置",
    },
  },
  {
    id: "recallResultTemplate",
    label: "结果模板",
    component: "ElInput",
    modelPath: "recallSettings.resultTemplate",
    hint: "检索结果注入提示词的模板。支持变量: {recallName}, {content}, {key}, {score}, {tags}, {count}, {items}",
    keywords: "recall template 思绪 模板",
    props: { type: "textarea", rows: 4, placeholder: "检索结果注入模板" },
    groupCollapsible: {
      name: "recall-advanced",
      title: "思绪高级设置",
    },
  },
  {
    id: "recallEmptyText",
    label: "空结果提示",
    component: "ElInput",
    modelPath: "recallSettings.emptyText",
    hint: "未检索到内容时的占位文本",
    keywords: "recall empty 思绪 提示",
    props: { placeholder: "未检索到内容时的提示词" },
    groupCollapsible: {
      name: "recall-advanced",
      title: "思绪高级设置",
    },
  },
]);

const handleAdvancedSettingsUpdate = (newSettings: any) => {
  Object.assign(editForm, newSettings);
};

onMounted(() => {
  if (recallStore.engines.length === 0) {
    recallStore.loadEngines();
  }
});
</script>

<template>
  <div class="agent-section">
    <div class="section-group" data-setting-id="recall">
      <div class="section-header">
        <div class="section-group-title">思绪 (Recall)</div>
        <el-switch
          v-model="editForm.recallConfig.enabled"
          @change="ensureConfig"
        />
      </div>
      <div class="form-hint">
        关联知识库后，智能体可在对话中自动检索相关知识。通过
        <code style="color: var(--el-color-primary)">{{ recallMacro }}</code>
        注入所有已启用知识库的检索结果，或使用
        <code style="color: var(--el-color-primary)">{{ recallNameMacro }}</code>
        精确指定，还可通过
        <code style="color: var(--el-color-primary)">{{ recallListMacro }}</code>
        让 LLM 感知可用知识源。
      </div>

      <!-- 宏缺失警告 -->
      <transition name="el-zoom-in-top">
        <div v-if="isRecallMacroMissing" class="macro-warning-alert">
          <el-alert
            :type="
              editForm.recallConfig.autoInjectIfMacroMissing
                ? 'info'
                : 'warning'
            "
            :closable="false"
            show-icon
          >
            <template #title>
              <div class="alert-title-content">
                <span
                  v-if="editForm.recallConfig.autoInjectIfMacroMissing"
                >
                  自动注入已启用
                </span>
                <span v-else>
                  提示词中未发现 <code>{{ recallMacro }}</code> 宏
                </span>
                <div class="alert-actions">
                  <el-button
                    v-if="
                      !editForm.recallConfig.autoInjectIfMacroMissing
                    "
                    type="primary"
                    size="small"
                    @click="
                      editForm.recallConfig.autoInjectIfMacroMissing = true
                    "
                  >
                    立即开启保底注入
                  </el-button>
                  <el-button
                    link
                    type="primary"
                    size="small"
                    @click="switchToPersonality"
                  >
                    前往编辑提示词
                  </el-button>
                </div>
              </div>
            </template>
            <template #default>
              <span
                v-if="editForm.recallConfig.autoInjectIfMacroMissing"
              >
                检索结果将自动注入到对话历史之前。你也可以在"角色设定"中手动添加
                <code>{{ recallMacro }}</code> 宏以精确控制注入位置。
              </span>
              <span v-else>
                智能体需要此宏来获取知识库检索结果。你可以开启"自动注入"，或在"角色设定"中手动添加此宏。
              </span>
            </template>
          </el-alert>
        </div>
      </transition>

      <template v-if="editForm.recallConfig?.enabled">
        <!-- 全局配置 -->
        <div class="kb-config-grid">
          <el-form-item label="保底注入">
            <template #label>
              <el-tooltip
                content="开启后，如果已启用的思绪集没有对应的 {{recall}} 宏或【recall::collection=集合ID】占位符，系统会自动将检索结果注入到指定位置。"
                placement="top"
              >
                <div style="display: flex; align-items: center; gap: 4px">
                  <span>保底注入</span>
                  <el-icon :size="14"><InfoFilled /></el-icon>
                </div>
              </el-tooltip>
            </template>
            <el-switch
              v-model="editForm.recallConfig.autoInjectIfMacroMissing"
            />
          </el-form-item>

          <el-form-item label="注入位置">
            <el-select
              v-model="editForm.recallConfig.autoInjectPosition"
              size="small"
            >
              <el-option label="上下文最前方" value="context_head" />
              <el-option label="最后用户消息之前" value="before_last_user" />
            </el-select>
          </el-form-item>
        </div>

        <!-- 知识库列表 -->
        <div class="kb-list-box">
          <div class="box-header">
            <div class="box-title-group">
              <span class="box-title">已关联知识库</span>
              <el-tag size="small" type="info">
                {{ editForm.recallConfig.bindings.length }} 个
              </el-tag>
            </div>
          </div>

          <!-- 搜索栏 -->
          <div
            v-if="editForm.recallConfig.bindings.length > 3"
            class="box-search-bar"
          >
            <el-input
              v-model="searchQuery"
              placeholder="搜索知识库名称..."
              size="small"
              clearable
              :prefix-icon="Search"
            />
          </div>

          <!-- 空状态 -->
          <div
            v-if="editForm.recallConfig.bindings.length === 0"
            class="empty-kb"
          >
            <el-empty :image-size="40" description="尚未关联任何知识库">
              <el-popover
                v-model:visible="showAddSelector"
                placement="bottom"
                :width="320"
                trigger="click"
              >
                <template #reference>
                  <el-button type="primary" size="small">
                    <el-icon><Plus /></el-icon>
                    添加知识库
                  </el-button>
                </template>
                <div class="add-kb-popover">
                  <div v-if="availableBases.length === 0" class="add-kb-empty">
                    所有知识库已关联
                  </div>
                  <div
                    v-for="base in availableBases"
                    :key="base.id"
                    class="add-kb-item"
                    @click="addRecallCollection(base)"
                  >
                    <span class="add-kb-name">{{ base.name }}</span>
                    <span class="add-kb-count">{{ base.entryCount }} 条</span>
                  </div>
                </div>
              </el-popover>
            </el-empty>
          </div>

          <!-- 知识库列表 -->
          <div v-else class="kb-list">
            <KnowledgeBaseItem
              v-for="binding in filteredBindings"
              :key="binding.recallId"
              :binding="binding"
              :expanded="expandedRecallId === binding.recallId"
              @toggle-expand="toggleExpand(binding.recallId)"
              @toggle-enabled="toggleBinding(binding.recallId, $event)"
              @remove="removeBinding(binding.recallId)"
            />
          </div>

          <!-- 添加按钮 -->
          <div
            v-if="editForm.recallConfig.bindings.length > 0"
            class="box-footer"
          >
            <el-popover
              v-model:visible="showAddSelector"
              placement="bottom"
              :width="320"
              trigger="click"
            >
              <template #reference>
                <el-button type="primary" link size="small">
                  <el-icon><Plus /></el-icon>
                  添加知识库
                </el-button>
              </template>
              <div class="add-kb-popover">
                <div v-if="availableBases.length === 0" class="add-kb-empty">
                  所有知识库已关联
                </div>
                <div
                  v-for="base in availableBases"
                  :key="base.id"
                  class="add-kb-item"
                  @click="addRecallCollection(base)"
                >
                  <span class="add-kb-name">{{ base.name }}</span>
                  <span class="add-kb-count">{{ base.entryCount }} 条</span>
                </div>
              </div>
            </el-popover>
          </div>
        </div>
      </template>

      <!-- 知识库高级设置 -->
      <div class="kb-advanced-section">
        <SettingListRenderer
          :items="recallAdvancedSettings"
          :settings="editForm"
          @update:settings="handleAdvancedSettingsUpdate"
        />
      </div>
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

.kb-config-grid {
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

.kb-config-grid :deep(.el-form-item) {
  margin-bottom: 8px;
  display: flex;
  align-items: center;
}

.kb-config-grid :deep(.el-form-item__label) {
  margin-bottom: 0;
  flex-shrink: 0;
}

.kb-config-grid :deep(.el-form-item__content) {
  margin-left: 0 !important;
  display: flex;
  align-items: center;
}

.kb-list-box {
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
  gap: 8px;
}

.box-search-bar {
  padding: 10px 12px;
  background: var(--el-fill-color-lighter);
  border-bottom: var(--border-width) solid var(--border-color);
}

.kb-list {
  overflow-y: auto;
  max-height: 400px;
}

.empty-kb {
  padding: 32px;
  display: flex;
  justify-content: center;
}

.box-footer {
  padding: 8px 12px;
  border-top: var(--border-width) solid var(--border-color);
  display: flex;
  justify-content: center;
}

.add-kb-popover {
  max-height: 240px;
  overflow-y: auto;
}

.add-kb-empty {
  padding: 16px;
  text-align: center;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.add-kb-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.2s;
}

.add-kb-item:hover {
  background: var(--el-fill-color-light);
}

.add-kb-name {
  font-size: 13px;
  font-weight: 500;
}

.add-kb-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.kb-advanced-section {
  margin-top: 24px;
}
</style>
