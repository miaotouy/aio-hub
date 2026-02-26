<script setup lang="ts">
import { ref, watch, onMounted, computed } from "vue";
import { useKnowledgeBaseStore } from "../stores/knowledgeBaseStore";
import { useKnowledgeBase } from "../composables/useKnowledgeBase";
import { getPureModelId, getProfileId } from "@/utils/modelIdUtils";
import { useKbIndexer } from "../composables/useKbIndexer";
import { ChevronLeft, BarChart3, Save, RefreshCw, Zap, Bot } from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";
import TagEditor from "./TagEditor.vue";
import InfoCard from "@/components/common/InfoCard.vue";
import DynamicIcon from "@/components/common/DynamicIcon.vue";
import { format } from "date-fns";
import { useModelMetadata } from "@/composables/useModelMetadata";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import type { TagWithWeight } from "../types";

const emit = defineEmits(["close"]);
const kbStore = useKnowledgeBaseStore();
const { updateBaseMeta } = useKnowledgeBase();
const { indexAllPendingEntries } = useKbIndexer();
const { getIconPath, getDisplayIconPath } = useModelMetadata();
const { getProfileById } = useLlmProfiles();

const activeTab = ref("info");

const formData = ref({
  name: "",
  description: "",
  tags: [] as TagWithWeight[],
  config: {
    searchTopK: 5,
    minScore: 0.5,
  },
});

// 初始化表单
const initForm = () => {
  if (kbStore.activeBaseMeta) {
    formData.value = {
      name: kbStore.activeBaseMeta.name || "",
      description: kbStore.activeBaseMeta.description || "",
      tags: [...(kbStore.activeBaseMeta.tags || [])],
      config: {
        searchTopK: kbStore.activeBaseMeta.config?.searchTopK ?? 5,
        minScore: kbStore.activeBaseMeta.config?.minScore ?? 0.5,
      },
    };
  }
};

onMounted(initForm);
watch(() => kbStore.activeBaseId, initForm);

const handleSave = async () => {
  if (!kbStore.activeBaseId) return;
  await updateBaseMeta(kbStore.activeBaseId, {
    name: formData.value.name,
    description: formData.value.description,
    tags: formData.value.tags,
    config: formData.value.config,
  });
  customMessage.success("配置已保存");
};

const formatSize = (chars: number) => {
  if (chars < 1000) return `${chars} 字符`;
  if (chars < 1000000) return `${(chars / 1000).toFixed(1)}k 字符`;
  return `${(chars / 1000000).toFixed(2)}m 字符`;
};

// 获取模型和渠道信息
const embeddingModelInfo = computed(() => {
  const modelId = kbStore.config.defaultEmbeddingModel;
  if (!modelId) return null;

  // 解析模型 ID (格式通常为 profileId:modelName)
  const profileId = getProfileId(modelId);
  const rawModelName = getPureModelId(modelId);

  // 1. 获取模型图标
  const iconPath = getIconPath(rawModelName);
  const modelIcon = iconPath ? getDisplayIconPath(iconPath) : null;

  // 2. 获取渠道信息
  const profile = profileId ? getProfileById(profileId) : null;
  const profileName = profile?.name || profileId;
  const profileIcon = profile?.icon || profile?.logoUrl || null;

  return {
    modelName: rawModelName,
    modelIcon,
    profileName,
    profileIcon,
  };
});
</script>

<template>
  <div class="kb-settings">
    <div class="settings-header">
      <div class="header-left">
        <button class="back-btn" @click="emit('close')" title="返回工作区">
          <ChevronLeft :size="20" />
        </button>
        <div class="title">
          <span>知识库管理</span>
        </div>
      </div>
      <el-button type="primary" size="small" @click="handleSave">
        <template #icon><Save :size="14" /></template>
        保存更改
      </el-button>
    </div>

    <el-tabs v-model="activeTab" class="settings-tabs">
      <!-- 信息统计面板 -->
      <el-tab-pane name="info">
        <template #label>
          <div class="tab-label"><BarChart3 :size="14" /> 统计与概览</div>
        </template>

        <div class="tab-content scrollbar-hidden">
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-value">{{ kbStore.activeBaseStats?.total || 0 }}</div>
              <div class="stat-label">总条目数</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{{ kbStore.activeBaseStats?.indexed || 0 }}</div>
              <div class="stat-label">已向量化</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{{ kbStore.activeBaseStats?.indexedRate.toFixed(1) }}%</div>
              <div class="stat-label">覆盖率</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">
                {{ formatSize(kbStore.activeBaseStats?.totalChars || 0) }}
              </div>
              <div class="stat-label">数据规模</div>
            </div>
          </div>

          <!-- 向量化进度条 -->
          <div v-if="kbStore.indexingProgress.isIndexing" class="indexing-progress">
            <div class="progress-header">
              <span class="progress-text">
                正在补齐向量... ({{ kbStore.indexingProgress.current }} /
                {{ kbStore.indexingProgress.total }})
              </span>
              <span class="progress-percent">
                {{
                  Math.round(
                    (kbStore.indexingProgress.current / kbStore.indexingProgress.total) * 100
                  )
                }}%
              </span>
            </div>
            <el-progress
              :percentage="
                Math.round(
                  (kbStore.indexingProgress.current / kbStore.indexingProgress.total) * 100
                )
              "
              :show-text="false"
              striped
              striped-flow
              :duration="10"
            />
          </div>

          <InfoCard title="基础属性" class="info-section">
            <el-form label-position="top" size="small">
              <el-form-item label="库名称">
                <el-input v-model="formData.name" placeholder="输入库名称" />
              </el-form-item>
              <el-form-item label="库描述">
                <el-input
                  v-model="formData.description"
                  type="textarea"
                  :rows="3"
                  placeholder="输入库描述信息..."
                />
              </el-form-item>
              <el-form-item label="库标签">
                <TagEditor v-model="formData.tags" placeholder="为知识库添加标签..." />
              </el-form-item>
            </el-form>
          </InfoCard>

          <div class="time-info">
            <div class="time-item">
              <span class="label">创建时间：</span>
              <span class="value">{{
                kbStore.activeBaseStats?.createdAt
                  ? format(kbStore.activeBaseStats.createdAt, "yyyy-MM-dd HH:mm:ss")
                  : "-"
              }}</span>
            </div>
            <div class="time-item">
              <span class="label">最后更新：</span>
              <span class="value">{{
                kbStore.activeBaseStats?.updatedAt
                  ? format(kbStore.activeBaseStats.updatedAt, "yyyy-MM-dd HH:mm:ss")
                  : "-"
              }}</span>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- 库配置面板 -->
      <el-tab-pane name="config">
        <template #label>
          <div class="tab-label"><Zap :size="14" /> 检索配置</div>
        </template>

        <div class="tab-content">
          <InfoCard title="检索策略" class="info-section">
            <el-form label-width="120px" size="small">
              <el-form-item label="检索数量 (TopK)">
                <div class="config-row">
                  <el-slider
                    v-model="formData.config.searchTopK"
                    :min="1"
                    :max="50"
                    style="flex: 1"
                  />
                  <span class="slider-value">{{ formData.config.searchTopK }}</span>
                </div>
                <div class="form-tip">检索时返回的最相关条目数量。</div>
              </el-form-item>

              <el-form-item label="最小分数">
                <div class="config-row">
                  <el-slider
                    v-model="formData.config.minScore"
                    :min="0"
                    :max="1"
                    :step="0.01"
                    style="flex: 1"
                  />
                  <span class="slider-value">{{ formData.config.minScore.toFixed(2) }}</span>
                </div>
                <div class="form-tip">低于此分数的检索结果将被过滤（0 为不限制）。</div>
              </el-form-item>
            </el-form>
          </InfoCard>

          <InfoCard title="向量化引擎" class="info-section">
            <div class="engine-info">
              <div class="info-row model-info-row">
                <span class="label">当前模型：</span>
                <div v-if="embeddingModelInfo" class="model-display">
                  <div class="model-main">
                    <div class="model-icon-wrapper">
                      <DynamicIcon
                        v-if="embeddingModelInfo.modelIcon"
                        :src="embeddingModelInfo.modelIcon"
                        :alt="embeddingModelInfo.modelName"
                        class="model-icon"
                      />
                      <Bot v-else :size="14" class="fallback-icon" />
                    </div>
                    <span class="model-name">{{ embeddingModelInfo.modelName }}</span>
                  </div>

                  <div v-if="embeddingModelInfo.profileName" class="profile-tag">
                    <DynamicIcon
                      v-if="embeddingModelInfo.profileIcon"
                      :src="embeddingModelInfo.profileIcon"
                      :alt="embeddingModelInfo.profileName"
                      class="meta-icon"
                    />
                    <span class="meta-text">{{ embeddingModelInfo.profileName }}</span>
                  </div>
                </div>
                <el-tag v-else size="small" type="info">未设置</el-tag>
              </div>
              <div class="info-row">
                <span class="label">向量维度：</span>
                <span>{{ kbStore.config.vectorIndex.dimension }}</span>
              </div>
              <div class="info-actions">
                <el-button size="small" plain @click="indexAllPendingEntries">
                  <RefreshCw :size="12" /> 补齐待向量化项
                </el-button>
                <el-button size="small" plain type="danger" @click="kbStore.clearLegacyVectors">
                  清理冗余向量
                </el-button>
              </div>
            </div>
          </InfoCard>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.kb-settings {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: transparent;
  box-sizing: border-box;
  overflow: hidden;
}

.settings-header {
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-color);
  background-color: var(--sidebar-bg);
  box-sizing: border-box;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background-color: var(--input-bg);
  color: var(--el-text-color-primary);
  cursor: pointer;
  transition: all 0.2s;
}

.back-btn:hover {
  background-color: var(--el-fill-color);
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}

.settings-header .title {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.settings-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.settings-tabs :deep(.el-tabs__header) {
  margin: 0;
  padding: 0 16px;
}

.settings-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: hidden;
}

.tab-label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tab-content {
  height: 100%;
  overflow-y: auto;
  padding: 24px;
  max-width: 1000px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

/* 统计卡片 */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  background-color: var(--input-bg);
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  text-align: center;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--el-color-primary);
}

.stat-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.info-section {
  margin-bottom: 16px;
}

.form-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background-color: var(--input-bg);
  margin-top: 4px;
  padding-left: 8px;
  line-height: 1.4;
  width: 100%;
}

.config-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.slider-value {
  font-size: 12px;
  min-width: 30px;
  text-align: right;
}

.time-info {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px dashed var(--border-color);
}

.time-item {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  margin-bottom: 4px;
}

.engine-info {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
}

.info-row .label {
  color: var(--el-text-color-secondary);
}

/* 模型展示样式 */
.model-info-row {
  align-items: flex-start !important;
}

.model-display {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.model-main {
  display: flex;
  align-items: center;
  gap: 8px;
}

.model-icon-wrapper {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background-color: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 4px;
}

.model-icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
}

.fallback-icon {
  color: var(--el-text-color-placeholder);
  opacity: 0.7;
}

.model-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.profile-tag {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--el-color-primary);
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.1));
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1.2;
}

.meta-icon {
  width: 12px;
  height: 12px;
  object-fit: contain;
  flex-shrink: 0;
}

.info-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.scrollbar-hidden::-webkit-scrollbar {
  width: 0;
}

.indexing-progress {
  margin-bottom: 24px;
  padding: 16px;
  background-color: var(--input-bg);
  border-radius: 8px;
  border: 1px solid var(--el-color-primary-light-7);
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 12px;
}

.progress-text {
  color: var(--el-text-color-primary);
  font-weight: 500;
}

.progress-percent {
  color: var(--el-color-primary);
  font-weight: 600;
}
</style>
