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

<template>
  <BaseDialog
    :model-value="modelValue"
    title="模型元数据源"
    width="min(820px, 92vw)"
    max-height="82vh"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #content>
      <div class="sources-dialog">
        <p class="dialog-intro">
          外部源用于补全上下文长度、价格与能力等客观字段。拉取后只更新目录，已有模型需通过“刷新模型配置”显式应用；目标字段已有值时不会被覆盖。
        </p>

        <article
          v-for="row in sourceRows"
          :key="row.definition.id"
          class="source-item"
        >
          <div class="source-header">
            <div class="source-title">
              <strong>{{ row.definition.name }}</strong>
              <el-tag size="small" effect="plain">{{ row.definition.license }}</el-tag>
              <el-tag
                v-if="row.catalog"
                size="small"
                type="success"
                effect="plain"
              >
                {{ row.catalog.rules.length }} 条
              </el-tag>
              <el-tag v-else size="small" type="info" effect="plain">
                未拉取
              </el-tag>
            </div>
            <div class="source-switches">
              <label>
                <span>启用</span>
                <el-switch
                  :model-value="row.state?.enabled === true"
                  :loading="toggling[row.definition.id]"
                  @update:model-value="
                    (value: boolean | string | number) =>
                      handleToggle(row.definition.id, Boolean(value))
                  "
                />
              </label>
              <label>
                <span>自动更新</span>
                <el-switch
                  :model-value="row.state?.autoUpdate === true"
                  :disabled="row.state?.enabled !== true"
                  @update:model-value="
                    (value: boolean | string | number) =>
                      handleAutoUpdate(row.definition.id, Boolean(value))
                  "
                />
              </label>
            </div>
          </div>

          <p class="source-description">{{ row.definition.description }}</p>

          <div class="source-meta">
            <span>
              上次更新：
              {{ row.state?.lastFetchedAt
                ? formatDateTime(row.state.lastFetchedAt)
                : "从未" }}
            </span>
            <a :href="row.definition.homepage" target="_blank" rel="noreferrer">
              {{ row.definition.homepage }}
            </a>
          </div>

          <el-alert
            v-if="row.state?.lastError"
            :title="row.state.lastError"
            type="error"
            :closable="false"
            show-icon
          />

          <div class="source-actions">
            <el-button
              size="small"
              :loading="updating[row.definition.id]"
              @click="handleUpdate(row.definition.id)"
            >
              {{ row.catalog ? "检查更新" : "拉取" }}
            </el-button>
            <el-button
              v-if="row.catalog"
              size="small"
              type="danger"
              plain
              @click="handleRemove(row.definition.id, row.definition.name)"
            >
              清除本地数据
            </el-button>
          </div>
        </article>
      </div>
    </template>

    <template #footer>
      <div class="dialog-actions">
        <el-button @click="emit('update:modelValue', false)">关闭</el-button>
      </div>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { ElMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import { formatDateTime } from "@/utils/time";
import { useModelMetadata } from "@composables/useModelMetadata";
import {
  getMetadataSourceAdapters,
  updateMetadataSource,
} from "@/services/modelMetadataSourceService";

defineProps<{ modelValue: boolean }>();

const emit = defineEmits<{
  (event: "update:modelValue", value: boolean): void;
}>();

const metadata = useModelMetadata();
const adapters = getMetadataSourceAdapters();
const updating = ref<Record<string, boolean>>({});
const toggling = ref<Record<string, boolean>>({});

const sourceRows = computed(() =>
  adapters.map((adapter) => ({
    definition: adapter.definition,
    state: metadata.getExternalSourceState(adapter.definition.id),
    catalog: metadata.getExternalCatalog(adapter.definition.id),
  }))
);

async function handleToggle(sourceId: string, enabled: boolean) {
  toggling.value[sourceId] = true;
  try {
    const hasCatalog = Boolean(metadata.getExternalCatalog(sourceId));
    const saved = await metadata.setExternalSourceEnabled(sourceId, enabled);
    if (!saved) {
      customMessage.error("保存元数据源状态失败");
      return;
    }
    if (enabled && !hasCatalog) {
      await handleUpdate(sourceId);
    }
  } finally {
    toggling.value[sourceId] = false;
  }
}

async function handleAutoUpdate(sourceId: string, autoUpdate: boolean) {
  const saved = await metadata.setExternalSourceAutoUpdate(sourceId, autoUpdate);
  if (!saved) customMessage.error("保存自动更新设置失败");
}

async function handleUpdate(sourceId: string) {
  updating.value[sourceId] = true;
  try {
    const result = await updateMetadataSource(sourceId, { force: true });
    customMessage.success(
      result.updated
        ? `已更新 ${result.ruleCount} 条规则`
        : "已是最新版本"
    );
    if (result.warnings.length) {
      customMessage.info(result.warnings.join("；"));
    }
  } catch (error) {
    customMessage.error(
      `更新失败：${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    updating.value[sourceId] = false;
  }
}

async function handleRemove(sourceId: string, name: string) {
  try {
    await ElMessageBox.confirm(
      `清除“${name}”的本地目录后，来自该源的规则将不再参与匹配。`,
      "清除元数据源",
      {
        type: "warning",
        lockScroll: false,
        confirmButtonText: "清除",
        cancelButtonText: "取消",
      }
    );
  } catch {
    return;
  }
  const saved = await metadata.removeExternalCatalog(sourceId);
  if (saved) customMessage.success("已清除本地数据");
  else customMessage.error("清除失败");
}
</script>

<style scoped>
.sources-dialog {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.dialog-intro {
  margin: 0;
  line-height: 1.6;
  color: var(--text-color-light);
}

.source-item {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  padding: 1rem;
  border: var(--border-width) solid var(--border-color);
  border-radius: var(--border-radius-base);
  background: var(--container-bg);
}

.source-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.source-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.source-switches {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.source-switches label {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.85rem;
  color: var(--text-color-light);
}

.source-description {
  margin: 0;
  color: var(--text-color-light);
}

.source-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  font-size: 0.8rem;
  color: var(--text-color-light);
}

.source-meta a {
  color: var(--primary-color);
  text-decoration: none;
}

.source-actions {
  display: flex;
  gap: 0.5rem;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
