<template>
  <div class="tokenizer-library">
    <!-- 顶部工具栏 -->
    <div class="library-toolbar">
      <div class="library-toolbar-left">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索分词器名称 / ID / 标签"
          clearable
          :prefix-icon="Search"
          style="width: 280px"
        />
        <el-select
          v-model="sourceFilter"
          placeholder="来源筛选"
          clearable
          style="width: 140px"
        >
          <el-option label="内置" value="bundled" />
          <el-option label="本地导入" value="local" />
          <el-option label="远端下载" value="remote" />
        </el-select>
        <el-select
          v-model="confidenceFilter"
          placeholder="置信度筛选"
          clearable
          style="width: 160px"
        >
          <el-option label="精确" value="exact" />
          <el-option label="近似" value="close" />
          <el-option label="估算" value="estimated" />
        </el-select>
      </div>
      <div class="library-toolbar-right">
        <span class="library-stats">
          共 {{ filteredProfiles.length }} / {{ allProfiles.length }} 个
        </span>
        <el-button
          :icon="Upload"
          type="primary"
          @click="importDialogVisible = true"
        >
          导入
        </el-button>
        <el-tooltip content="下载功能将在后续阶段开放" placement="top">
          <div class="placeholder-actions">
            <el-button :icon="Download" disabled>下载</el-button>
          </div>
        </el-tooltip>
      </div>
    </div>

    <!-- 列表 -->
    <div class="library-list">
      <div
        v-for="profile in filteredProfiles"
        :key="profile.id"
        class="profile-card"
        :class="{ disabled: profile.enabled === false }"
      >
        <div class="profile-card-header">
          <div class="profile-title-row">
            <span class="profile-name">{{ profile.name }}</span>
            <el-tag
              :type="getConfidenceTagType(profile.confidence)"
              size="small"
              effect="light"
            >
              {{ getConfidenceLabel(profile.confidence) }}
            </el-tag>
            <el-tag
              :type="getSourceTagType(profile.source.type)"
              size="small"
              effect="plain"
            >
              {{ getSourceLabel(profile.source.type) }}
            </el-tag>
          </div>
          <div class="profile-actions">
            <el-tooltip
              :content="profile.enabled === false ? '点击启用' : '点击禁用'"
              placement="top"
            >
              <el-switch
                :model-value="profile.enabled !== false"
                @change="(v: boolean) => onToggleEnabled(profile.id, v)"
                size="small"
              />
            </el-tooltip>
            <el-tooltip
              v-if="
                profile.source.type === 'bundled' &&
                registryStore.hasBuiltinOverride(profile.id)
              "
              content="重置为内置默认（清除启用状态与校准的覆盖）"
              placement="top"
            >
              <el-button
                :icon="RefreshLeft"
                size="small"
                circle
                plain
                type="warning"
                @click="onResetBuiltin(profile)"
              />
            </el-tooltip>
            <el-tooltip
              v-if="profile.source.type !== 'bundled'"
              content="卸载分词器"
              placement="top"
            >
              <el-button
                :icon="Delete"
                size="small"
                circle
                plain
                type="danger"
                @click="onUninstall(profile)"
              />
            </el-tooltip>
          </div>
        </div>

        <div class="profile-meta">
          <span class="profile-id" :title="profile.id">{{ profile.id }}</span>
          <span class="profile-version">v{{ profile.version }}</span>
          <span v-if="profile.license" class="profile-license">
            {{ profile.license }}
          </span>
        </div>

        <p v-if="profile.description" class="profile-description">
          {{ profile.description }}
        </p>

        <!-- 模型匹配模式 -->
        <div v-if="profile.modelPatterns.length > 0" class="profile-patterns">
          <span class="pattern-label">匹配模式：</span>
          <code
            v-for="(p, i) in profile.modelPatterns"
            :key="i"
            class="pattern-chip"
          >
            {{ p }}
          </code>
        </div>

        <!-- 校准信息（如果有） -->
        <div v-if="profile.calibration" class="profile-calibration">
          <span class="calibration-label">校准：</span>
          <span v-if="profile.calibration.multiplier !== undefined">
            ×{{ profile.calibration.multiplier.toFixed(2) }}
          </span>
          <span v-if="profile.calibration.fixedOverhead !== undefined">
            +{{ profile.calibration.fixedOverhead }}
          </span>
        </div>

        <!-- 标签 -->
        <div
          v-if="profile.tags && profile.tags.length > 0"
          class="profile-tags"
        >
          <span v-for="t in profile.tags" :key="t" class="profile-tag">
            #{{ t }}
          </span>
        </div>
      </div>

      <div v-if="filteredProfiles.length === 0" class="library-empty">
        <el-icon :size="32" color="var(--text-color-light)">
          <Search />
        </el-icon>
        <p>没有匹配的分词器</p>
      </div>
    </div>

    <TokenizerImportDialog v-model="importDialogVisible" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import {
  Search,
  Upload,
  Download,
  Delete,
  RefreshLeft,
} from "@element-plus/icons-vue";
import { storeToRefs } from "pinia";
import { ElMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useTokenizerRegistryStore } from "../../stores/tokenizerRegistryStore";
import TokenizerImportDialog from "./TokenizerImportDialog.vue";
import type {
  TokenizerProfile,
  TokenizerConfidence,
  TokenizerSource,
} from "../../types/tokenizer-profile";

const registryStore = useTokenizerRegistryStore();
const { allProfiles } = storeToRefs(registryStore);
const errorHandler = createModuleErrorHandler("token-calculator/library-panel");

const searchKeyword = ref("");
const sourceFilter = ref<"" | "bundled" | "local" | "remote">("");
const confidenceFilter = ref<"" | TokenizerConfidence>("");
const importDialogVisible = ref(false);

const filteredProfiles = computed<TokenizerProfile[]>(() => {
  const kw = searchKeyword.value.trim().toLowerCase();
  return allProfiles.value.filter((p) => {
    if (sourceFilter.value && p.source.type !== sourceFilter.value)
      return false;
    if (confidenceFilter.value && p.confidence !== confidenceFilter.value)
      return false;
    if (kw) {
      const hay = [p.id, p.name, p.description ?? "", ...(p.tags ?? [])]
        .join("|")
        .toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });
});

function getConfidenceLabel(c: TokenizerConfidence): string {
  switch (c) {
    case "exact":
      return "精确";
    case "close":
      return "近似";
    case "estimated":
      return "估算";
  }
}

function getConfidenceTagType(
  c: TokenizerConfidence
): "success" | "warning" | "info" {
  switch (c) {
    case "exact":
      return "success";
    case "close":
      return "warning";
    case "estimated":
      return "info";
  }
}

function getSourceLabel(t: TokenizerSource["type"]): string {
  switch (t) {
    case "bundled":
      return "内置";
    case "local":
      return "本地";
    case "remote":
      return "远端";
  }
}

function getSourceTagType(
  t: TokenizerSource["type"]
): "primary" | "info" | "warning" {
  switch (t) {
    case "bundled":
      return "primary";
    case "local":
      return "info";
    case "remote":
      return "warning";
  }
}

async function onToggleEnabled(profileId: string, enabled: boolean) {
  await registryStore.setProfileEnabled(profileId, enabled);
}

async function onResetBuiltin(profile: TokenizerProfile) {
  try {
    await ElMessageBox.confirm(
      `确定要重置内置分词器 "${profile.name}" 的所有用户覆盖吗？\n（包括启用状态与校准）`,
      "重置覆盖",
      {
        confirmButtonText: "重置",
        cancelButtonText: "取消",
        type: "warning",
        lockScroll: false,
      }
    );
  } catch {
    return;
  }
  try {
    await registryStore.resetBuiltinOverride(profile.id);
    customMessage.success("已恢复默认状态");
  } catch (error) {
    errorHandler.handle(error as Error, {
      userMessage: "重置失败",
      context: { profileId: profile.id },
    });
  }
}

async function onUninstall(profile: TokenizerProfile) {
  try {
    await ElMessageBox.confirm(
      `确定要卸载分词器 “${profile.name}” 吗？相关匹配规则也会被一并删除。`,
      "卸载分词器",
      {
        confirmButtonText: "卸载",
        cancelButtonText: "取消",
        type: "warning",
        lockScroll: false,
      }
    );
  } catch {
    return;
  }
  try {
    await registryStore.uninstallProfile(profile.id);
    customMessage.success("分词器已卸载");
  } catch (error) {
    errorHandler.handle(error as Error, {
      userMessage: "卸载分词器失败",
      context: { profileId: profile.id },
    });
  }
}
</script>

<style scoped>
.tokenizer-library {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  min-height: 0;
  padding: 16px;
  gap: 12px;
  box-sizing: border-box;
}

.library-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 16px;
  background-color: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 12px;
  backdrop-filter: blur(var(--ui-blur));
  flex-shrink: 0;
}

.library-toolbar-left,
.library-toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.library-stats {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.placeholder-actions {
  display: inline-flex;
  gap: 6px;
}

.library-list {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 12px;
  align-content: start;
  padding: 4px;
}

.profile-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  background-color: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 12px;
  backdrop-filter: blur(var(--ui-blur));
  transition:
    box-shadow 0.2s,
    transform 0.15s,
    opacity 0.2s;
}

.profile-card:hover {
  box-shadow: var(--el-box-shadow-light);
  transform: translateY(-1px);
}

.profile-card.disabled {
  opacity: 0.55;
}

.profile-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.profile-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.profile-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-color);
}

.profile-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--text-color-secondary);
}

.profile-id {
  font-family: "Consolas", monospace;
  padding: 2px 6px;
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.08)
  );
  border-radius: 4px;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-description {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-color-secondary);
}

.profile-patterns {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 12px;
}

.pattern-label,
.calibration-label {
  color: var(--text-color-secondary);
}

.pattern-chip {
  font-family: "Consolas", monospace;
  font-size: 11px;
  padding: 2px 6px;
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.1)
  );
  color: var(--primary-color);
  border-radius: 4px;
}

.profile-calibration {
  font-size: 12px;
  color: var(--text-color-secondary);
  display: flex;
  gap: 8px;
}

.profile-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.profile-tag {
  font-size: 11px;
  color: var(--text-color-light);
}

.library-empty {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
  color: var(--text-color-light);
  gap: 8px;
}
</style>
