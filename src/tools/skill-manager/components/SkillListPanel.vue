<template>
  <div class="skill-list-panel">
    <div class="panel-header">
      <span class="panel-title">技能列表</span>
      <span class="panel-count">{{ manifests.length }} 个技能</span>
    </div>

    <!-- 搜索框 -->
    <el-input
      v-model="searchQuery"
      placeholder="搜索技能..."
      size="small"
      clearable
      class="search-input"
    >
      <template #prefix>
        <Search :size="14" />
      </template>
    </el-input>

    <!-- 过滤标签 -->
    <div class="filter-tabs">
      <el-radio-group v-model="sourceFilter" size="small">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button value="user">用户安装</el-radio-button>
        <el-radio-button value="builtin">内置</el-radio-button>
      </el-radio-group>
    </div>

    <!-- 技能列表 -->
    <div class="skill-list" v-if="groupedSkills.length > 0">
      <div v-for="group in groupedSkills" :key="group.id" class="skill-group">
        <!-- Bundle 分组头部 -->
        <div v-if="group.type === 'bundle'" class="bundle-group-header">
          <div class="bundle-info-click" @click="toggleCollapse(group.id)">
            <component
              :is="ChevronDown"
              :size="16"
              class="collapse-arrow"
              :class="{ collapsed: isCollapsed(group.id) }"
            />
            <component :is="FolderArchive" :size="14" class="bundle-icon" />
            <div class="bundle-meta-info">
              <span class="bundle-name" :title="group.name">{{
                group.name
              }}</span>
              <span class="bundle-version" v-if="group.version"
                >v{{ group.version }}</span
              >
            </div>
          </div>

          <div class="bundle-actions">
            <el-switch
              :model-value="group.enabled"
              size="small"
              @change="toggleBundle(group.id)"
              @click.stop
            />
            <el-dropdown trigger="click" @click.stop>
              <component :is="MoreVertical" :size="14" class="more-btn" />
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="handleUninstallBundle(group.id)">
                    <span class="text-danger">卸载包</span>
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>

        <!-- Standalone 分组头部 -->
        <div
          v-else-if="groupedSkills.length > 1"
          class="standalone-group-header"
        >
          <component :is="FileCode" :size="14" />
          <span>独立技能</span>
        </div>

        <!-- 技能列表项 -->
        <el-collapse-transition>
          <div
            v-show="group.type === 'standalone' || !isCollapsed(group.id)"
            class="group-items"
          >
            <div
              v-for="manifest in group.skills"
              :key="manifest.name"
              class="skill-item"
              :class="{
                selected: selectedName === manifest.name,
                'is-disabled':
                  !isSkillEnabled(manifest.name) ||
                  (group.type === 'bundle' && !group.enabled),
              }"
              @click="$emit('select', manifest)"
            >
              <div class="skill-item-header">
                <span class="skill-name">{{ manifest.name }}</span>
                <span
                  class="skill-source-tag"
                  :class="getSourceClass(manifest)"
                >
                  {{ getSourceLabel(manifest) }}
                </span>
              </div>
              <div class="skill-desc">{{ manifest.description }}</div>
              <div class="skill-meta">
                <span v-if="manifest.scripts.length > 0" class="meta-item">
                  {{ manifest.scripts.length }} 个脚本
                </span>
                <span v-if="isActive(manifest.name)" class="meta-item active"
                  >已激活</span
                >
                <span
                  v-if="!isSkillEnabled(manifest.name)"
                  class="meta-item disabled-tag"
                  >已禁用</span
                >
                <span
                  v-if="group.type === 'bundle' && !group.enabled"
                  class="meta-item disabled-tag"
                  >包已禁用</span
                >
              </div>
            </div>
          </div>
        </el-collapse-transition>
      </div>
    </div>

    <el-empty v-else description="暂无匹配的技能" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import {
  Search,
  ChevronDown,
  FolderArchive,
  FileCode,
  MoreVertical,
} from "lucide-vue-next";
import { useSkillManagerStore } from "../stores/skillManagerStore";
import { useSkillManager } from "../composables/useSkillManager";
import { ElMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import type { SkillManifest } from "../types";

const store = useSkillManagerStore();
const { uninstallBundle } = useSkillManager();

const props = defineProps<{
  manifests: SkillManifest[];
  activeSkillNames: Set<string>;
  disabledIds: string[];
  selectedName?: string;
}>();

defineEmits<{
  select: [manifest: SkillManifest];
  toggle: [name: string];
}>();

const searchQuery = ref("");
const sourceFilter = ref("");
const collapsedBundles = ref<Record<string, boolean>>({});

function toggleCollapse(bundleId: string) {
  collapsedBundles.value[bundleId] = !collapsedBundles.value[bundleId];
}

function isCollapsed(bundleId: string): boolean {
  return !!collapsedBundles.value[bundleId];
}

function toggleBundle(bundleId: string) {
  store.toggleBundle(bundleId);
}

async function handleUninstallBundle(bundleId: string) {
  try {
    await ElMessageBox.confirm(
      `确定要卸载技能包 "${bundleId}" 吗？这将删除该包下的所有技能。`,
      "提示",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
        lockScroll: false,
      }
    );
    await uninstallBundle(bundleId);
    customMessage.success("技能包卸载成功");
  } catch (err: any) {
    if (err !== "cancel") {
      customMessage.error(`卸载失败: ${err}`);
    }
  }
}

/** 判断技能是否来自内置源 */
function isFromBuiltin(manifest: SkillManifest): boolean {
  return (
    manifest.source === "builtin" ||
    manifest.metadata?.installedFrom === "builtin" ||
    store.isBuiltinInstalled(manifest.name)
  );
}

/** 获取技能的来源标签文字 */
function getSourceLabel(manifest: SkillManifest): string {
  if (isFromBuiltin(manifest)) return "内置";
  if (manifest.source === "user") return "用户";
  if (manifest.source.startsWith("external:")) return "外部";
  return manifest.source;
}

/** 获取技能的来源样式类名 */
function getSourceClass(manifest: SkillManifest): string {
  if (isFromBuiltin(manifest)) return "builtin";
  if (manifest.source === "user") return "user";
  if (manifest.source.startsWith("external:")) return "external";
  return "";
}

const filteredManifests = computed(() => {
  let list = props.manifests;

  // 来源过滤（内置过滤需要同时匹配 source=builtin、metadata 标记和安装记录）
  if (sourceFilter.value === "builtin") {
    list = list.filter((m) => isFromBuiltin(m));
  } else if (sourceFilter.value === "user") {
    list = list.filter((m) => m.source === "user" && !isFromBuiltin(m));
  } else if (sourceFilter.value) {
    list = list.filter((m) => m.source === sourceFilter.value);
  }

  // 搜索过滤
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q)
    );
  }

  return list;
});

interface GroupedItem {
  type: "bundle" | "standalone";
  id: string;
  name: string;
  version?: string;
  skills: SkillManifest[];
  enabled?: boolean;
}

const groupedSkills = computed(() => {
  const bundlesMap = new Map<string, SkillManifest[]>();
  const standalone: SkillManifest[] = [];

  for (const manifest of filteredManifests.value) {
    const bundle = store.getBundleForSkill(manifest.name);
    if (bundle) {
      if (!bundlesMap.has(bundle.name)) {
        bundlesMap.set(bundle.name, []);
      }
      bundlesMap.get(bundle.name)!.push(manifest);
    } else {
      standalone.push(manifest);
    }
  }

  const groups: GroupedItem[] = [];

  // 添加 Bundle 分组
  for (const [bundleName, skills] of bundlesMap.entries()) {
    const bundleMeta = store.bundles.find((b) => b.name === bundleName);
    groups.push({
      type: "bundle",
      id: bundleName,
      name: bundleName,
      version: bundleMeta?.version,
      skills,
      enabled: store.isBundleEnabled(bundleName),
    });
  }

  // 添加独立技能分组
  if (standalone.length > 0) {
    groups.push({
      type: "standalone",
      id: "standalone",
      name: "独立技能",
      skills: standalone,
    });
  }

  return groups;
});

function isActive(name: string): boolean {
  return props.activeSkillNames.has(name);
}

function isSkillEnabled(name: string): boolean {
  return !props.disabledIds.includes(name);
}
</script>

<style scoped>
.skill-list-panel {
  width: 320px;
  min-width: 280px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  padding: 14px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-color);
}

.panel-count {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.search-input {
  flex-shrink: 0;
}

.search-input :deep(.el-input__wrapper) {
  background-color: var(--input-bg);
  box-shadow: none;
  border: var(--border-width) solid var(--border-color);
  transition: all 0.2s;
}

.search-input :deep(.el-input__wrapper.is-focus) {
  border-color: var(--el-color-primary);
}

.filter-tabs {
  flex-shrink: 0;
}

.skill-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 -4px;
  padding: 0 4px;
}

/* 自定义滚动条 */
.skill-list::-webkit-scrollbar {
  width: 5px;
}

.skill-list::-webkit-scrollbar-thumb {
  background: rgba(var(--el-color-info-rgb), 0.2);
  border-radius: 10px;
}

.skill-item {
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  background-color: var(--input-bg);
  transition: all 0.2s ease;
  border: var(--border-width) solid transparent;
}

.skill-item:hover {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.05)
  );
  border-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.15)
  );
}

.skill-item.selected {
  border-color: var(--el-color-primary);
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.08)
  );
}

.skill-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.skill-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-color);
}

.skill-source-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
  background-color: rgba(
    var(--el-color-info-rgb),
    calc(var(--card-opacity) * 0.12)
  );
  color: var(--el-color-info);
}

.skill-source-tag.user {
  background-color: rgba(
    var(--el-color-success-rgb),
    calc(var(--card-opacity) * 0.12)
  );
  color: var(--el-color-success);
}

.skill-source-tag.builtin {
  background-color: rgba(
    var(--el-color-info-rgb),
    calc(var(--card-opacity) * 0.12)
  );
  color: var(--el-color-info);
}

.skill-desc {
  font-size: 12px;
  color: var(--text-color-secondary);
  display: -webkit-box;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
}

.skill-meta {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.meta-item {
  font-size: 11px;
  color: var(--text-color-secondary);
}

.meta-item.active {
  color: var(--el-color-success);
}

.meta-item.disabled-tag {
  color: var(--el-color-danger);
  font-weight: 500;
}
</style>
