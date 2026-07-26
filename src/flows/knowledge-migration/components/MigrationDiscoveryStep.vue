<template>
  <div class="migration-step">
    <div class="source-card">
      <DatabaseBackup :size="28" />
      <div>
        <h3>检测到旧 Recall 文件目录</h3>
        <p :title="snapshot.preview.legacyDataPath">
          {{ snapshot.preview.legacyDataPath }}
        </p>
      </div>
    </div>
    <div class="metric-grid">
      <div>
        <strong>{{ snapshot.preview.sourceCollections }}</strong
        ><span>集合</span>
      </div>
      <div>
        <strong>{{ snapshot.preview.sourceEntries }}</strong
        ><span>条目</span>
      </div>
      <div>
        <strong>{{ snapshot.preview.sourceVectors }}</strong
        ><span>向量</span>
      </div>
      <div>
        <strong>{{ snapshot.preview.issueCount }}</strong
        ><span>已知问题</span>
      </div>
    </div>
    <el-alert
      :closable="false"
      type="info"
      show-icon
      title="启动阶段尚未迁移任何旧用户数据"
      description="只有在后续步骤明确确认后，应用才会写入新的 Recall SQLite 存储。"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { DatabaseBackup } from "lucide-vue-next";
import type { UpgradeFlowContext } from "@/flows/upgrade/types";
import { getKnowledgeMigrationSnapshot } from "../types";

const props = defineProps<{ context: UpgradeFlowContext }>();
const snapshot = computed(() => getKnowledgeMigrationSnapshot(props.context));
</script>

<style scoped>
.migration-step {
  display: grid;
  gap: 16px;
}
.source-card {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 18px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-color);
}
.source-card svg {
  color: var(--el-color-primary);
  flex: none;
}
h3 {
  margin: 0 0 6px;
  color: var(--text-color);
}
p {
  margin: 0;
  color: var(--text-color-secondary);
  overflow-wrap: anywhere;
}
.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.metric-grid div {
  display: grid;
  gap: 4px;
  padding: 14px;
  border-radius: 10px;
  background: var(--el-fill-color-light);
  text-align: center;
}
.metric-grid strong {
  color: var(--text-color);
  font-size: 22px;
}
.metric-grid span {
  color: var(--text-color-secondary);
  font-size: 12px;
}
@media (max-width: 600px) {
  .metric-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
