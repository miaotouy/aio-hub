<template>
  <BaseDialog v-model="visible" title="向量覆盖率检查" width="480px" :show-footer="!loading">
    <div v-loading="loading" class="coverage-content">
      <div class="batch-list">
        <div v-for="(item, index) in batchItems" :key="index" class="batch-item">
          <div class="item-header">
            <span class="model-name">{{ item.modelName }}</span>
            <span class="missing-count">缺失 {{ item.missingEntries }} 条</span>
          </div>
          <div class="kb-list">涉及知识库: {{ item.kbNames.join(", ") }}</div>
        </div>
      </div>

      <div v-if="totalMissing > 0" class="action-hint">
        <el-alert title="需要补全向量" type="warning" :closable="false" show-icon>
          <p>检测到共有 {{ totalMissing }} 个条目缺失向量。补全后可获得更精准的检索结果。</p>
          <p class="cost-hint">预计将调用 Embedding API 进行补全。</p>
        </el-alert>
      </div>
      <div v-else-if="batchItems.length > 0" class="action-hint">
        <el-alert title="向量已就绪" type="success" :closable="false" show-icon>
          所有条目均已完成向量化，可以开始检索。
        </el-alert>
      </div>
    </div>

    <template #footer>
      <template v-if="totalMissing > 0">
        <el-button @click="handleAction('cancel')">取消</el-button>
        <el-button @click="handleAction('ignore')">忽略并检索</el-button>
        <el-button type="primary" @click="handleAction('fill')"> 全部补全 </el-button>
      </template>
      <template v-else>
        <el-button @click="handleAction('cancel')">取消</el-button>
        <el-button type="primary" @click="handleAction('fill')"> 确定 </el-button>
      </template>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import BaseDialog from "@/components/common/BaseDialog.vue";

export interface BatchCoverageItem {
  modelName: string;
  kbNames: string[];
  missingEntries: number;
  missingMap: [string, string][]; // [kbId, caiuId][]
}

const visible = ref(false);
const loading = ref(false);
const batchItems = ref<BatchCoverageItem[]>([]);

let resolvePromise: (value: "fill" | "ignore" | "cancel") => void;

const totalMissing = computed(() => {
  return batchItems.value.reduce((sum, item) => sum + item.missingEntries, 0);
});

const show = (items: BatchCoverageItem[]) => {
  batchItems.value = items;
  visible.value = true;
  return new Promise<"fill" | "ignore" | "cancel">((res) => {
    resolvePromise = res;
  });
};

const handleAction = (action: "fill" | "ignore" | "cancel") => {
  visible.value = false;
  resolvePromise(action);
};

defineExpose({
  show,
});
</script>

<style scoped>
.coverage-content {
  padding: 10px 0;
}

.batch-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
  max-height: 400px;
  overflow-y: auto;
  padding-right: 4px;
}

.batch-item {
  padding: 12px;
  background-color: rgba(var(--el-text-color-placeholder-rgb), 0.05);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.model-name {
  font-weight: bold;
  font-size: 14px;
  color: var(--el-color-primary);
}

.missing-count {
  font-size: 12px;
  font-weight: bold;
  color: var(--el-color-warning);
}

.kb-list {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}

.action-hint {
  margin-top: 10px;
}

.cost-hint {
  font-size: 12px;
  margin-top: 8px;
  opacity: 0.8;
}
</style>
