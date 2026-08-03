<template>
  <div class="migration-preview">
    <div class="preview-grid">
      <section>
        <header class="success">
          <CircleCheck :size="16" />
          <h3>完整保留</h3>
          <span>{{ snapshot.preview.preservedFields.length }}</span>
        </header>
        <ul>
          <li v-for="item in snapshot.preview.preservedFields" :key="item">
            {{ item }}
          </li>
          <li v-if="!snapshot.preview.preservedFields.length">无</li>
        </ul>
      </section>
      <section>
        <header class="warning">
          <RefreshCw :size="16" />
          <h3>迁移时重建</h3>
          <span>{{ snapshot.preview.rebuiltFields.length }}</span>
        </header>
        <ul>
          <li v-for="item in snapshot.preview.rebuiltFields" :key="item">
            {{ item }}
          </li>
          <li v-if="!snapshot.preview.rebuiltFields.length">无</li>
        </ul>
      </section>
      <section>
        <header class="danger">
          <TriangleAlert :size="16" />
          <h3>无法自动处理</h3>
          <span>{{ snapshot.preview.unsupportedFields.length }}</span>
        </header>
        <ul>
          <li v-for="item in snapshot.preview.unsupportedFields" :key="item">
            {{ item }}
          </li>
          <li v-if="!snapshot.preview.unsupportedFields.length">无</li>
        </ul>
      </section>
    </div>

    <dl class="target-row">
      <dt>迁移目标</dt>
      <dd>{{ snapshot.preview.targetDescription }}</dd>
    </dl>

    <ul v-if="snapshot.preview.warnings.length" class="warning-list">
      <li v-for="warning in snapshot.preview.warnings" :key="warning">
        <TriangleAlert :size="14" />
        <span>{{ warning }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { CircleCheck, RefreshCw, TriangleAlert } from "lucide-vue-next";
import type { UpgradeFlowContext } from "@/flows/upgrade/types";
import { getKnowledgeMigrationSnapshot } from "../types";

const props = defineProps<{ context: UpgradeFlowContext }>();
const snapshot = computed(() => getKnowledgeMigrationSnapshot(props.context));
</script>

<style scoped>
.migration-preview {
  display: grid;
  gap: 10px;
}

.preview-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

section {
  min-width: 0;
  padding: 11px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: var(--card-bg);
}

header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
}

header.success {
  color: var(--el-color-success);
}

header.warning {
  color: var(--el-color-warning);
}

header.danger {
  color: var(--el-color-danger);
}

h3 {
  margin: 0;
  color: var(--text-color);
  font-size: 12px;
}

header span {
  font-size: 11px;
  font-weight: 700;
}

ul {
  margin: 8px 0 0;
  padding-left: 16px;
  color: var(--text-color-secondary);
  font-size: 11px;
  line-height: 1.65;
}

.target-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  font-size: 11px;
}

.target-row dt {
  color: var(--text-color-secondary);
}

.target-row dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--text-color);
}

.warning-list {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.warning-list li {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--el-color-warning) 9%, transparent);
  color: var(--el-color-warning);
  line-height: 1.45;
}

.warning-list svg {
  flex: none;
  margin-top: 1px;
}

.warning-list span {
  color: var(--text-color-secondary);
}

@media (max-width: 600px) {
  .preview-grid {
    grid-template-columns: 1fr;
  }
}
</style>
