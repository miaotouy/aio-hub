<template>
  <BaseDialog
    v-model="visible"
    title="文件内容对比"
    width="90%"
    height="80vh"
    show-close-button
    close-on-backdrop-click
  >
    <div class="diff-container">
      <!-- 加载中 -->
      <div v-if="loading" class="diff-loading">
        <el-icon class="is-loading" :size="24">
          <Loading />
        </el-icon>
        <span>正在加载文件内容...</span>
      </div>

      <!-- 错误 -->
      <div v-else-if="error" class="diff-error">
        <CircleAlert :size="24" />
        <span>{{ error }}</span>
      </div>

      <!-- 对比视图 -->
      <div v-else class="diff-panels">
        <div class="diff-panel">
          <div class="diff-panel-header">
            <Crown :size="14" class="crown-icon" />
            <span class="diff-path" :title="pathA">{{ truncatePath(pathA) }}</span>
          </div>
          <div class="diff-panel-body">
            <pre class="diff-content"><code>{{ contentA }}</code></pre>
          </div>
        </div>
        <div class="diff-panel">
          <div class="diff-panel-header">
            <Copy :size="14" class="dup-icon" />
            <span class="diff-path" :title="pathB">{{ truncatePath(pathB) }}</span>
          </div>
          <div class="diff-panel-body">
            <pre class="diff-content"><code>{{ contentB }}</code></pre>
          </div>
        </div>
      </div>
    </div>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { Loading } from "@element-plus/icons-vue";
import { CircleAlert, Crown, Copy } from "lucide-vue-next";
import BaseDialog from "@components/common/BaseDialog.vue";
import { useDeduplicatorRunner } from "../composables/useDeduplicatorRunner";

const props = defineProps<{
  pathA: string;
  pathB: string;
}>();

const visible = defineModel<boolean>({ default: false });

const { readFileForDiff } = useDeduplicatorRunner();

const loading = ref(false);
const error = ref<string | null>(null);
const contentA = ref("");
const contentB = ref("");

watch(visible, async (val) => {
  if (!val || !props.pathA || !props.pathB) return;

  loading.value = true;
  error.value = null;
  contentA.value = "";
  contentB.value = "";

  try {
    const [a, b] = await Promise.all([readFileForDiff(props.pathA), readFileForDiff(props.pathB)]);
    contentA.value = a ?? "";
    contentB.value = b ?? "";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "加载文件失败";
  } finally {
    loading.value = false;
  }
});

function truncatePath(path: string, maxLen = 80): string {
  if (path.length <= maxLen) return path;
  return "..." + path.slice(path.length - maxLen + 3);
}
</script>

<style scoped>
.diff-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.diff-loading,
.diff-error {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-color-light);
}

.diff-error {
  color: var(--el-color-danger);
}

.diff-panels {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  overflow: hidden;
}

.diff-panel {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
}

.diff-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: var(--card-bg);
  border-bottom: 1px solid var(--el-border-color-lighter);
  font-size: 12px;
  flex-shrink: 0;
}

.crown-icon {
  color: var(--el-color-success);
}

.dup-icon {
  color: var(--el-color-warning);
}

.diff-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-color);
}

.diff-panel-body {
  flex: 1;
  overflow: auto;
  background-color: var(--vscode-editor-background, var(--card-bg));
}

.diff-content {
  margin: 0;
  padding: 12px;
  font-family: "Cascadia Code", "Fira Code", "JetBrains Mono", monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-color);
}
</style>
