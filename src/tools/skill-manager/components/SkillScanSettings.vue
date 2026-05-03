<template>
  <div class="skill-scan-settings">
    <!-- 外部扫描总开关 -->
    <div class="section">
      <div class="section-header">
        <div class="section-title-row">
          <h3>外部兼容扫描</h3>
          <el-switch v-model="externalScanEnabled" @change="handleExternalScanToggle" />
        </div>
        <p class="section-desc">扫描其他 AI 工具（Claude Code、Cursor 等）安装的 Skill，实现跨工具兼容</p>
      </div>
    </div>

    <!-- 已知工具路径 -->
    <div class="section" v-if="externalScanEnabled">
      <h3 class="subsection-title">已知工具路径</h3>
      <div class="path-list">
        <div v-for="pathItem in knownPaths" :key="pathItem.id" class="path-item">
          <div class="path-info">
            <span class="path-label">{{ pathItem.label }}</span>
            <code class="path-value">{{ pathItem.defaultPath }}</code>
          </div>
          <el-switch
            :model-value="getPathEnabled(pathItem.id)"
            @change="(val: boolean) => handleKnownPathToggle(pathItem.id, val)"
            size="small"
          />
        </div>
      </div>
    </div>

    <!-- 自定义路径 -->
    <div class="section" v-if="externalScanEnabled">
      <div class="section-title-row">
        <h3 class="subsection-title">自定义路径</h3>
        <el-button size="small" @click="handleAddCustomPath">
          <Plus :size="14" style="margin-right: 4px" />
          添加自定义路径
        </el-button>
      </div>

      <div v-if="customPaths.length === 0" class="empty-hint">
        <p>暂无自定义路径，点击上方按钮添加</p>
      </div>

      <div class="path-list" v-else>
        <div v-for="(pathItem, index) in customPaths" :key="pathItem.id" class="path-item">
          <div class="path-info">
            <el-input
              v-model="pathItem.path"
              placeholder="输入 Skill 目录的完整路径"
              size="small"
              @change="handleCustomPathChange"
            />
          </div>
          <div class="path-actions">
            <el-switch v-model="pathItem.enabled" @change="handleCustomPathChange" size="small" />
            <el-button size="small" type="danger" :icon="Trash2" circle @click="handleRemoveCustomPath(index)" />
          </div>
        </div>
      </div>
    </div>

    <!-- 首次加载时同步已知路径 -->
    <div v-if="loading" class="loading-overlay">
      <LoaderCircle class="spinner-icon" :size="16" />
      <span>正在加载预设路径...</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { Plus, Trash2, LoaderCircle } from "lucide-vue-next";
import { useSkillManagerStore } from "../stores/skillManagerStore";
import { skillLoader } from "../services/SkillLoader";
import type { ExternalScanPath, WellKnownPath } from "../types";

const store = useSkillManagerStore();
const loading = ref(false);
const knownPaths = ref<WellKnownPath[]>([]);

const externalScanEnabled = computed({
  get: () => store.config.externalScanEnabled,
  set: (val: boolean) => {
    store.updateConfig({ externalScanEnabled: val });
  },
});

const customPaths = computed(() => {
  // 过滤出不在已知预设列表中的路径（即用户自定义的）
  const knownIds = new Set(knownPaths.value.map((p) => p.id));
  return store.config.externalScanPaths.filter((p) => !knownIds.has(p.id));
});

function getPathEnabled(id: string): boolean {
  const found = store.config.externalScanPaths.find((p) => p.id === id);
  return found?.enabled ?? false;
}

async function handleKnownPathToggle(id: string, enabled: boolean) {
  const existing = store.config.externalScanPaths.find((p) => p.id === id);
  if (existing) {
    existing.enabled = enabled;
  } else {
    const known = knownPaths.value.find((p) => p.id === id);
    if (known) {
      store.config.externalScanPaths.push({
        id: known.id,
        path: known.defaultPath,
        enabled,
      });
    }
  }
  await store.saveConfig();
}

async function handleExternalScanToggle(val: boolean) {
  if (val && store.config.externalScanPaths.length === 0) {
    // 首次开启：同步已知路径到配置（默认关闭）
    const paths: ExternalScanPath[] = knownPaths.value.map((kp) => ({
      id: kp.id,
      path: kp.defaultPath,
      enabled: false,
    }));
    store.config.externalScanPaths = paths;
  }
  store.config.externalScanEnabled = val;
  await store.saveConfig();
}

async function handleAddCustomPath() {
  // 生成唯一 ID
  const id = `custom_${Date.now()}`;
  store.config.externalScanPaths.push({
    id,
    path: "",
    enabled: true,
    label: "自定义路径",
  });
  await store.saveConfig();
}

async function handleRemoveCustomPath(index: number) {
  const customList = customPaths.value;
  if (index >= 0 && index < customList.length) {
    const realIndex = store.config.externalScanPaths.indexOf(customList[index]);
    if (realIndex >= 0) {
      store.config.externalScanPaths.splice(realIndex, 1);
    }
  }
  await store.saveConfig();
}

async function handleCustomPathChange() {
  await store.saveConfig();
}

onMounted(async () => {
  loading.value = true;
  try {
    knownPaths.value = await skillLoader.getWellKnownPaths();
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.skill-scan-settings {
  padding: 16px 0;
  position: relative;
}

.section {
  margin-bottom: 24px;
}

.section-header {
  margin-bottom: 16px;
}

.section-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.section-title-row h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-color);
}

.subsection-title {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.section-desc {
  margin: 0;
  font-size: 12px;
  color: var(--text-color-secondary);
  line-height: 1.5;
}

.path-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.path-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  background-color: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
}

.path-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.path-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
}

.path-value {
  font-size: 12px;
  color: var(--text-color-secondary);
  background-color: var(--sidebar-bg);
  padding: 2px 6px;
  border-radius: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.path-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.empty-hint {
  padding: 20px;
  text-align: center;
  color: var(--text-color-secondary);
  font-size: 13px;
}

.empty-hint p {
  margin: 0;
}

.loading-overlay {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  color: var(--text-color-secondary);
  font-size: 13px;
}

.spinner-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
