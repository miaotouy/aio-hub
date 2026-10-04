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

<!--
  子智能体配置管理视图

  对应设计文档 §5.3：罗列当前所有可作为子智能体的物理实体（已开启 + 已禁用），
  提供直观开关一键切换 subAgentConfig.enabled 与 onlySubVisible；
  提供「补全缺失的内置子智能体」快捷操作（仅补全缺失项，绝不覆盖已存在实体）。
-->

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import { resolveAgentAvatarPath } from "@/tools/agent-manager/utils/agentAssetUtils";
import {
  BUILTIN_BASELINE_IDS,
  subAgentBaselineService,
} from "../services/subAgentBaselineService";
import { MAX_DELEGATION_DEPTH_LIMIT } from "@/tools/agent-manager/types/agent";
import Avatar from "@/components/common/Avatar.vue";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@/utils/logger";
import {
  Search,
  Sparkles,
  Info,
  Layers,
  EyeOff,
} from "lucide-vue-next";

const logger = createModuleLogger("sub-agent/control-panel");
const agentStore = useAgentStore();
const restoring = ref(false);
const searchQuery = ref("");

onMounted(async () => {
  if (agentStore.agents.length === 0) {
    await agentStore.loadAgents();
  }
});

/** 全部可作为子智能体的物理实体（含禁用态），按内置优先排序 */
const allSubAgentRows = computed(() => {
  const rows = agentStore.agents.filter(
    (agent) => agent.subAgentConfig != null
  );
  const builtinSet = new Set<string>(BUILTIN_BASELINE_IDS);
  return [...rows].sort((a, b) => {
    const aBuiltin = builtinSet.has(a.id) ? 0 : 1;
    const bBuiltin = builtinSet.has(b.id) ? 0 : 1;
    if (aBuiltin !== bBuiltin) return aBuiltin - bBuiltin;
    return (a.displayName || a.name).localeCompare(
      b.displayName || b.name,
      undefined,
      { sensitivity: "base", numeric: true }
    );
  });
});

/** 过滤后的列表 */
const filteredSubAgentRows = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return allSubAgentRows.value;
  return allSubAgentRows.value.filter((agent) => {
    const name = (agent.displayName || agent.name).toLowerCase();
    const desc = (agent.description || "").toLowerCase();
    return name.includes(query) || desc.includes(query);
  });
});

const enabledCount = computed(
  () =>
    allSubAgentRows.value.filter(
      (a) => a.subAgentConfig?.enabled === true
    ).length
);

const missingBaselineIds = computed(() => {
  const existing = new Set(agentStore.agents.map((a) => a.id));
  return BUILTIN_BASELINE_IDS.filter((id) => !existing.has(id));
});

async function toggleEnabled(agentId: string, enabled: boolean): Promise<void> {
  const agent = agentStore.getAgentById(agentId);
  if (!agent?.subAgentConfig) return;
  agentStore.updateAgent(agentId, {
    subAgentConfig: { ...agent.subAgentConfig, enabled },
  });
}

async function toggleOnlySubVisible(
  agentId: string,
  onlySubVisible: boolean
): Promise<void> {
  const agent = agentStore.getAgentById(agentId);
  if (!agent?.subAgentConfig) return;
  agentStore.updateAgent(agentId, {
    subAgentConfig: { ...agent.subAgentConfig, onlySubVisible },
  });
}

/** 仅对缺失的内置子智能体执行释出；已存在实体（含被修改/禁用的）绝不回滚 */
async function restoreMissingBaselines(): Promise<void> {
  if (missingBaselineIds.value.length === 0) return;
  restoring.value = true;
  try {
    await subAgentBaselineService.ensureBaselineMaterialized();
    customMessage.success("缺失的内置子智能体已补全");
    logger.info("已补全缺失的内置子智能体");
  } catch (error) {
    logger.error("补全内置子智能体失败", error as Error);
    customMessage.error("补全失败，请查看日志");
  } finally {
    restoring.value = false;
  }
}
</script>

<template>
  <div class="subagent-panel-container">
    <!-- 顶部操作栏与统计指标 -->
    <div class="panel-toolbar">
      <div class="toolbar-left">
        <div class="status-summary-pill">
          <span class="pill-dot" :class="{ 'is-active': enabledCount > 0 }" />
          <span class="pill-text">
            可用调度：<strong>{{ enabledCount }}</strong> / {{ allSubAgentRows.length }}
          </span>
        </div>
        <div class="search-input-wrapper">
          <el-input
            v-model="searchQuery"
            size="small"
            placeholder="搜索子智能体..."
            clearable
            class="filter-input"
          >
            <template #prefix>
              <Search :size="14" class="search-icon" />
            </template>
          </el-input>
        </div>
      </div>

      <div class="toolbar-right">
        <el-button
          size="small"
          type="primary"
          plain
          :loading="restoring"
          :disabled="missingBaselineIds.length === 0"
          @click="restoreMissingBaselines"
        >
          <template #icon>
            <Sparkles :size="14" />
          </template>
          补全内置预置{{
            missingBaselineIds.length > 0
              ? ` (${missingBaselineIds.length})`
              : ""
          }}
        </el-button>
      </div>
    </div>

    <!-- 列表主体 -->
    <div class="panel-content">
      <div v-if="allSubAgentRows.length === 0" class="panel-empty">
        <div class="empty-icon-wrap">
          <Layers :size="32" />
        </div>
        <div class="empty-title">当前无可用子智能体</div>
        <div class="empty-desc">
          调度器将由主智能体单体执行。可在智能体大厅中开启对应智能体的「允许被调用」，或点击右上角补全内置预置。
        </div>
      </div>

      <div
        v-else-if="filteredSubAgentRows.length === 0"
        class="panel-empty is-filtered"
      >
        <div class="empty-title">未找到匹配的子智能体</div>
        <div class="empty-desc">请尝试调整搜索关键词</div>
      </div>

      <div v-else class="agent-cards-grid">
        <div
          v-for="agent in filteredSubAgentRows"
          :key="agent.id"
          class="agent-config-card"
          :class="{ 'is-disabled': !agent.subAgentConfig?.enabled }"
        >
          <!-- 头像区域 -->
          <div class="card-avatar-col">
            <Avatar
              :src="resolveAgentAvatarPath(agent) || ''"
              :name="agent.displayName || agent.name"
              :size="42"
              shape="square"
              :radius="8"
            />
          </div>

          <!-- 详细信息区域 -->
          <div class="card-main-col">
            <div class="card-header-row">
              <span class="agent-name" :title="agent.displayName || agent.name">
                {{ agent.displayName || agent.name }}
              </span>

              <div class="agent-badges">
                <span
                  v-if="agent.subAgentConfig?.isBuiltinBaseline"
                  class="badge-tag is-system"
                  title="内置系统基线"
                >
                  系统预置
                </span>

                <span
                  v-if="agent.subAgentConfig?.onlySubVisible"
                  class="badge-tag is-subonly"
                  title="仅作为子智能体可见，不在主聊天侧边栏显示"
                >
                  <EyeOff :size="11" />
                  仅子可见
                </span>

                <span
                  class="badge-tag is-depth"
                  :title="`最大委托深度：${Math.min(
                    Math.max(agent.subAgentConfig?.maxDelegationDepth ?? 1, 1),
                    MAX_DELEGATION_DEPTH_LIMIT
                  )}`"
                >
                  深度 {{ Math.min(
                    Math.max(agent.subAgentConfig?.maxDelegationDepth ?? 1, 1),
                    MAX_DELEGATION_DEPTH_LIMIT
                  ) }}
                </span>
              </div>
            </div>

            <div
              class="agent-description"
              :title="agent.description || '暂无描述信息'"
            >
              {{ agent.description || "暂无描述信息" }}
            </div>
          </div>

          <!-- 右侧控制项 -->
          <div class="card-controls-col">
            <div class="control-toggle-item">
              <span class="control-label">允许调度</span>
              <el-switch
                :model-value="agent.subAgentConfig?.enabled === true"
                size="small"
                @change="(value: string | number | boolean) => toggleEnabled(agent.id, Boolean(value))"
              />
            </div>

            <div class="control-toggle-item">
              <span class="control-label" title="开启后在主会话侧边栏隐藏该角色">
                主聊天隐藏
              </span>
              <el-switch
                :model-value="agent.subAgentConfig?.onlySubVisible === true"
                size="small"
                @change="(value: string | number | boolean) => toggleOnlySubVisible(agent.id, Boolean(value))"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部说明条 -->
    <div class="panel-footer-tip">
      <Info :size="14" class="tip-icon" />
      <span class="tip-text">
        内置重置机制：在智能体大厅删除系统实体后，调度器调用时将自动重新释出干净的默认配置；已修改或已禁用的实体绝不被自动覆盖。
      </span>
    </div>
  </div>
</template>

<style scoped>
.subagent-panel-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  /* padding: 16px 20px;  外层有距离了*/
  gap: 12px;
}

/* 工具栏 */
.panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-shrink: 0;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.status-summary-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background-color: var(--el-fill-color-light);
  font-size: 12px;
  color: var(--text-color);
}

.pill-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--el-color-info);
}

.pill-dot.is-active {
  background-color: var(--el-color-success);
}

.search-input-wrapper {
  width: 220px;
}

.search-icon {
  color: var(--el-text-color-secondary);
}

/* 列表展示容器 */
.panel-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.agent-cards-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 每一个智能体配置卡片 */
.agent-config-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  border-radius: 8px;
  background-color: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  transition:
    border-color 0.2s,
    background-color 0.2s,
    box-shadow 0.2s;
}

.agent-config-card:hover {
  border-color: var(--el-color-primary-light-5, var(--primary-color));
}

.agent-config-card.is-disabled {
  opacity: 0.68;
}

.card-avatar-col {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-main-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.card-header-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.agent-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}

.agent-badges {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.badge-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  line-height: 16px;
}

.badge-tag.is-system {
  background-color: color-mix(in srgb, var(--primary-color) 10%, transparent);
  color: var(--primary-color);
  border: 1px solid color-mix(in srgb, var(--primary-color) 25%, transparent);
}

.badge-tag.is-subonly {
  background-color: color-mix(in srgb, var(--warning-color) 12%, transparent);
  color: var(--warning-color);
  border: 1px solid color-mix(in srgb, var(--warning-color) 25%, transparent);
}

.badge-tag.is-depth {
  background-color: var(--el-fill-color);
  color: var(--text-color-light);
  border: 1px solid var(--border-color);
}

.agent-description {
  font-size: 12px;
  color: var(--text-color-light);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
}

/* 右侧控制项 */
.card-controls-col {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
}

.control-toggle-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 56px;
}

.control-label {
  font-size: 11px;
  color: var(--text-color-light);
  white-space: nowrap;
  user-select: none;
}

/* 空状态 */
.panel-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 20px;
  text-align: center;
  background-color: var(--el-fill-color-light);
  border-radius: 8px;
  color: var(--text-color-light);
  gap: 10px;
}

.empty-icon-wrap {
  opacity: 0.5;
  color: var(--text-color-secondary);
}

.empty-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.empty-desc {
  font-size: 12px;
  max-width: 420px;
  line-height: 1.5;
}

/* 底部说明 */
.panel-footer-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  background-color: var(--el-fill-color-light);
  font-size: 12px;
  color: var(--text-color-light);
  line-height: 1.4;
  flex-shrink: 0;
}

.tip-icon {
  flex-shrink: 0;
  color: var(--primary-color);
}

.tip-text {
  flex: 1;
}
</style>
