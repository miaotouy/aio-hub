<template>
  <div class="content-deduplicator">
    <div class="panel-left">
      <ConfigPanel @scan="handleScan" @stop="runner.stopScan" />
    </div>
    <div class="panel-right">
      <ResultPanel @delete="handleDelete" @diff="handleDiff" />
    </div>

    <DiffPreview v-model="showDiff" :path-a="diffPathA" :path-b="diffPathB" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { ElMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import ConfigPanel from "./components/ConfigPanel.vue";
import ResultPanel from "./components/ResultPanel.vue";
import DiffPreview from "./components/DiffPreview.vue";
import { useDeduplicatorRunner } from "./composables/useDeduplicatorRunner";
import { useContentDeduplicatorStore } from "./stores/store";

const store = useContentDeduplicatorStore();
const runner = useDeduplicatorRunner();

const showDiff = ref(false);
const diffPathA = ref("");
const diffPathB = ref("");

onMounted(() => {
  runner.initialize();
});

async function handleScan() {
  await runner.scanDirectory();
}

onUnmounted(() => {
  runner.dispose();
});

function handleDiff(pathA: string, pathB: string) {
  diffPathA.value = pathA;
  diffPathB.value = pathB;
  showDiff.value = true;
}

async function handleDelete() {
  const count = store.selectedPaths.size;
  if (count === 0) return;

  try {
    await ElMessageBox.confirm(`确定要将 ${count} 个文件移入回收站吗？`, "确认删除", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消",
    });
  } catch {
    return; // 用户取消
  }

  const result = await runner.deleteSelected();
  if (!result) return;

  if (result.errorCount > 0) {
    customMessage.warning(`删除完成：成功 ${result.successCount}，失败 ${result.errorCount}`);
  } else {
    customMessage.success(`已删除 ${result.successCount} 个文件`);
  }
}
</script>

<style scoped>
.content-deduplicator {
  height: 100%;
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: 16px;
  box-sizing: border-box;
  overflow: hidden;
}

.panel-left {
  overflow-y: auto;
}

.panel-right {
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
