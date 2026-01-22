<template>
  <BaseDialog v-model="visible" :title="title" width="800px" height="70vh" :loading="loading">
    <MediaInfoPanel v-if="info" :info="info" />
    <div v-else-if="!loading" class="no-data">
      <el-empty description="无法获取媒体信息" />
    </div>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref } from "vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import MediaInfoPanel from "./MediaInfoPanel.vue";
import { useFFmpegCore } from "../composables/useFFmpegCore";
import type { FFProbeOutput } from "../types";
import { exists } from "@tauri-apps/plugin-fs";

const visible = ref(false);
const loading = ref(false);
const info = ref<FFProbeOutput | null>(null);
const title = ref("媒体详情");

const { getFullMediaInfo } = useFFmpegCore();

const show = async (path: string, fileName?: string) => {
  title.value = fileName ? `媒体详情 - ${fileName}` : "媒体详情";
  visible.value = true;
  loading.value = true;
  info.value = null;

  try {
    const fileExists = await exists(path);
    if (!fileExists) {
      throw new Error("文件不存在或已被移除");
    }
    const result = await getFullMediaInfo(path);
    if (result) {
      info.value = result;
    }
  } catch (error: any) {
    console.error("Failed to get media info:", error);
    // 错误由 errorHandler 处理，这里只需停止 loading
  } finally {
    loading.value = false;
  }
};

defineExpose({
  show,
});
</script>

<style scoped>
.no-data {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
</style>
