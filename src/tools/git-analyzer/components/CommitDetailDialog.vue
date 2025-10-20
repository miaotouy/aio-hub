<template>
  <el-dialog
    v-model="visible"
    :title="`提交详情: ${selectedCommit?.hash?.substring(0, 7)}`"
    width="800px"
    top="8vh"
  >
    <el-descriptions v-if="selectedCommit" :column="1" border>
      <el-descriptions-item label="哈希">
        <el-text type="info">{{ selectedCommit.hash }}</el-text>
      </el-descriptions-item>
      <el-descriptions-item label="作者">
        {{ selectedCommit.author }} &lt;{{ selectedCommit.email }}&gt;
      </el-descriptions-item>
      <el-descriptions-item label="日期">
        {{ formatFullDate(selectedCommit.date) }}
      </el-descriptions-item>
      <el-descriptions-item label="提交信息">
        <el-text style="white-space: pre-wrap">{{
          selectedCommit.full_message || selectedCommit.message
        }}</el-text>
      </el-descriptions-item>
      <el-descriptions-item label="父提交" v-if="selectedCommit.parents">
        <el-space>
          <el-tag v-for="parent in selectedCommit.parents" :key="parent">
            {{ parent.substring(0, 7) }}
          </el-tag>
        </el-space>
      </el-descriptions-item>
    </el-descriptions>

    <div v-if="selectedCommit?.files && selectedCommit.files.length > 0" style="margin-top: 20px">
      <h4>文件更改 ({{ selectedCommit.files.length }})</h4>
      <el-table :data="selectedCommit.files" style="width: 100%">
        <el-table-column prop="path" label="文件路径" />
        <el-table-column label="更改" width="150">
          <template #default="scope">
            <span class="additions">+{{ scope.row.additions }}</span>
            <span class="deletions" style="margin-left: 10px">-{{ scope.row.deletions }}</span>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <template #footer>
      <el-space>
        <el-button @click="handleCopyHash">复制哈希</el-button>
        <el-button @click="visible = false">关闭</el-button>
      </el-space>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import type { GitCommit } from "../types";

interface Props {
  selectedCommit: GitCommit | null;
}

defineProps<Props>();

const visible = defineModel<boolean>("visible", { required: true });

const emit = defineEmits<{
  "copy-hash": [];
}>();

function formatFullDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function handleCopyHash() {
  emit("copy-hash");
}
</script>

<style scoped>
.additions {
  color: #67c23a;
}

.deletions {
  color: var(--error-color);
}
</style>