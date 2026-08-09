<template>
  <div class="migration-discovery" data-testid="migration-discovery">
    <div class="source-row">
      <div class="source-icon" aria-hidden="true">
        <DatabaseBackup :size="19" />
      </div>
      <div class="source-copy">
        <strong>检测到旧版知识库数据</strong>
        <el-tooltip :content="snapshot.preview.legacyDataPath" placement="top">
          <span class="source-path">{{ snapshot.preview.legacyDataPath }}</span>
        </el-tooltip>
      </div>
      <el-tag size="small" type="warning">待迁移</el-tag>
    </div>

    <div class="metric-grid">
      <div data-testid="migration-source-collections">
        <strong>{{ snapshot.preview.sourceCollections }}</strong
        ><span>集合</span>
      </div>
      <div data-testid="migration-source-entries">
        <strong>{{ snapshot.preview.sourceEntries }}</strong
        ><span>条目</span>
      </div>
      <div data-testid="migration-source-vectors">
        <strong>{{ snapshot.preview.sourceVectors }}</strong
        ><span>向量</span>
      </div>
      <div data-testid="migration-source-issues">
        <strong>{{ snapshot.preview.issueCount }}</strong
        ><span>预检问题</span>
      </div>
    </div>

    <p class="discovery-hint">
      迁移将把旧目录数据写入新存储，旧目录默认保留不删除。
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { DatabaseBackup } from "lucide-vue-next";
import type { RecallMigrationFlowContext } from "../types";
import { getKnowledgeMigrationSnapshot } from "../types";

const props = defineProps<{ context: RecallMigrationFlowContext }>();
const snapshot = computed(() => getKnowledgeMigrationSnapshot(props.context));
</script>

<style scoped>
.migration-discovery {
  display: grid;
  gap: 10px;
}

.source-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  padding: 12px 13px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--card-bg);
}

.source-icon {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
  border-radius: 9px;
  background: color-mix(in srgb, var(--primary-color) 11%, transparent);
  color: var(--primary-color);
}

.source-copy {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 2px;
}

.source-copy strong {
  color: var(--text-color);
  font-size: 13px;
}

.source-path {
  display: block;
  overflow: hidden;
  color: var(--text-color-secondary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px;
}

.metric-grid div {
  display: flex;
  min-width: 0;
  align-items: baseline;
  justify-content: center;
  gap: 5px;
  padding: 9px 7px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
}

.metric-grid strong {
  color: var(--text-color);
  font-size: 16px;
  line-height: 1;
}

.metric-grid span {
  color: var(--text-color-secondary);
  font-size: 11px;
}

.discovery-hint {
  margin: 0;
  color: var(--text-color-secondary);
  font-size: 11px;
  line-height: 1.5;
}

@media (max-width: 520px) {
  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
