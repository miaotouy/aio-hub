<template>
  <div class="skill-discovery-panel">
    <!-- 搜索与筛选 -->
    <div class="discovery-header">
      <el-input
        v-model="searchQuery"
        placeholder="搜索可用技能..."
        clearable
        class="search-input"
      >
        <template #prefix>
          <Search :size="14" />
        </template>
      </el-input>
      <el-button
        @click="loadAvailableSkills"
        :loading="loading"
        :icon="RefreshCw"
        circle
        size="small"
      />
    </div>

    <div class="discovery-content" v-loading="loading">
      <!-- 空状态引导 -->
      <div
        v-if="!loading && filteredSkills.length === 0"
        class="empty-discovery"
      >
        <el-empty
          :description="searchQuery ? '没有找到匹配的技能' : '暂无可用的技能'"
        >
          <template #image>
            <Box :size="48" class="empty-icon" />
          </template>
        </el-empty>
      </div>

      <!-- 技能源分组 -->
      <div v-else class="source-groups">
        <div
          v-for="source in enabledSources"
          :key="source.id"
          class="source-group"
        >
          <div class="source-group-header">
            <component
              :is="getSourceIcon(source.type)"
              :size="16"
              class="source-icon"
            />
            <span class="source-name">{{ source.name }}</span>
          </div>

          <div class="skill-grid">
            <div
              v-for="skill in getSkillsBySource(source.id)"
              :key="skill.id"
              class="available-skill-card"
              :class="{ 'is-installed': isInstalled(skill.id) }"
            >
              <div class="skill-card-main">
                <div class="skill-info">
                  <div class="skill-title">
                    <span class="skill-name">{{ skill.name }}</span>
                    <el-tag size="small" effect="plain" class="version-tag"
                      >v{{ skill.version }}</el-tag
                    >
                  </div>
                  <p class="skill-desc">{{ skill.description }}</p>

                  <div v-if="skill.metadata" class="skill-tags">
                    <el-tag
                      v-for="(val, key) in skill.metadata"
                      :key="key"
                      size="small"
                      type="info"
                      class="meta-tag"
                    >
                      {{ key }}: {{ val }}
                    </el-tag>
                  </div>
                </div>

                <div class="skill-actions">
                  <el-button
                    v-if="!isInstalled(skill.id)"
                    type="primary"
                    size="small"
                    :loading="installingId === skill.id"
                    @click="handleInstall(skill)"
                  >
                    安装
                  </el-button>
                  <el-button v-else disabled size="small"> 已安装 </el-button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 未来扩展：添加源 -->
        <div class="remote-sources-placeholder">
          <div class="placeholder-content">
            <Globe :size="24" class="placeholder-icon" />
            <div class="placeholder-text">
              <h4>远端源 (未来扩展)</h4>
              <p>可能支持从社区市场、Git 仓库或官方仓库获取更多技能。</p>
            </div>
            <el-button disabled size="small">添加源...</el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import {
  Search,
  RefreshCw,
  Box,
  Globe,
  Puzzle,
  Github,
  Cloud,
} from "lucide-vue-next";
import { SkillService } from "../services/SkillService";
import { useSkillManagerStore } from "../stores/skillManagerStore";
import type {
  AvailableSkillInfo,
  SkillSourceType,
  AvailableSkillInfo as AvailableSkill,
} from "../types";
import { customMessage } from "@/utils/customMessage";

const store = useSkillManagerStore();
const loading = ref(false);
const installingId = ref<string | null>(null);
const searchQuery = ref("");
const availableSkills = ref<AvailableSkillInfo[]>([]);

const enabledSources = computed(() =>
  store.config.sources.filter((s) => s.enabled)
);

const filteredSkills = computed(() => {
  if (!searchQuery.value) return availableSkills.value;
  const q = searchQuery.value.toLowerCase();
  return availableSkills.value.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q)
  );
});

async function loadAvailableSkills() {
  loading.value = true;
  try {
    // 目前只实现了内置源
    availableSkills.value = await SkillService.listBuiltinSkills();
    // 同步安装记录：清理已被卸载的内置 skill 的记录，确保状态正确
    store.syncInstallRecords();
  } finally {
    loading.value = false;
  }
}

function getSkillsBySource(sourceId: string) {
  // 目前所有获取到的技能都归类到 builtin 源，未来会根据 sourceId 过滤
  if (sourceId === "builtin") {
    return filteredSkills.value;
  }
  return [];
}

function isInstalled(skillId: string) {
  // 通过多种方式判断安装状态：
  // 1. basePath 以 skillId 结尾（目录名匹配）
  // 2. metadata 中有 installedFrom: builtin 标记
  // 3. 安装记录中有该 id
  return (
    store.manifests.some(
      (m) =>
        m.basePath.replace(/\\/g, "/").endsWith(`/${skillId}`) ||
        (m.metadata?.installedFrom === "builtin" && m.name === skillId)
    ) || store.isBuiltinInstalled(skillId)
  );
}

function getSourceIcon(type: SkillSourceType) {
  switch (type) {
    case "builtin":
      return Puzzle;
    case "git-repo":
      return Github;
    case "remote-registry":
      return Cloud;
    default:
      return Globe;
  }
}

async function handleInstall(skill: AvailableSkill) {
  installingId.value = skill.id;
  try {
    const success = await SkillService.installBuiltinSkill(skill.id);
    if (success) {
      customMessage.success(`技能 "${skill.name}" 安装成功`);
      // 更新安装记录
      await store.updateInstallRecord(skill.id, {
        version: skill.version,
        installedAt: new Date().toISOString(),
      });
      // 触发应用刷新以加载新技能
      // 这里通过 store 的 manifests 更新来同步状态
      // 实际上应该触发 SkillManagerPage 的 handleRefresh
      emit("installed");
    }
  } finally {
    installingId.value = null;
  }
}

const emit = defineEmits(["installed"]);

onMounted(() => {
  loadAvailableSkills();
});
</script>

<style scoped>
.skill-discovery-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px;
}

.discovery-header {
  display: flex;
  gap: 12px;
  align-items: center;
}

.search-input {
  max-width: 320px;
}

.discovery-content {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.empty-discovery {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-icon {
  color: var(--text-color-secondary);
  opacity: 0.5;
}

.source-groups {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.source-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.source-group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 8px;
  border-bottom: var(--border-width) solid var(--border-color);
}

.source-icon {
  color: var(--el-color-primary);
}

.source-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.skill-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 12px;
}

.available-skill-card {
  background-color: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
}

.available-skill-card:hover {
  border-color: var(--el-color-primary-light-5);
}

.available-skill-card.is-installed {
  opacity: 0.8;
  background-color: rgba(var(--el-color-info-rgb), 0.05);
}

.skill-card-main {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.skill-info {
  flex: 1;
  min-width: 0;
}

.skill-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.skill-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.version-tag {
  font-family: monospace;
}

.skill-desc {
  font-size: 13px;
  color: var(--text-color-secondary);
  margin: 0 0 10px 0;
  display: -webkit-box;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.5;
}

.skill-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.meta-tag {
  font-size: 10px;
  height: 18px;
  padding: 0 4px;
}

.skill-actions {
  flex-shrink: 0;
}

.remote-sources-placeholder {
  margin-top: 12px;
  padding: 24px;
  border: 1px dashed var(--border-color);
  border-radius: 12px;
  background-color: rgba(var(--text-color-secondary-rgb), 0.02);
}

.placeholder-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
}

.placeholder-icon {
  color: var(--text-color-secondary);
  opacity: 0.3;
}

.placeholder-text h4 {
  margin: 0 0 4px 0;
  font-size: 14px;
  color: var(--text-color-secondary);
}

.placeholder-text p {
  margin: 0;
  font-size: 12px;
  color: var(--text-color-placeholder);
}
</style>
