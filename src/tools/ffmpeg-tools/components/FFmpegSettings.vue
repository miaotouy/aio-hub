<template>
  <div class="settings-container">
    <el-form :model="store.config" label-position="top" class="settings-form">
      <el-form-item label="FFmpeg 可执行文件路径">
        <el-input
          v-model="store.config.ffmpegPath"
          placeholder="例如: ffmpeg 或 C:\ffmpeg\bin\ffmpeg.exe"
        >
          <template #append>
            <el-button @click="testFFmpeg">测试</el-button>
          </template>
        </el-input>
        <div class="help-text">如果 FFmpeg 已加入系统环境变量，直接填写 "ffmpeg" 即可。</div>
      </el-form-item>

      <el-form-item label="默认工作目录">
        <el-input v-model="store.config.defaultWorkDir" placeholder="留空则使用输入文件所在目录" />
      </el-form-item>

      <el-form-item label="最大并发任务数">
        <el-input-number v-model="store.config.maxConcurrentTasks" :min="1" :max="8" />
      </el-form-item>

      <el-form-item label="硬件加速 (NVENC/QSV/VideoToolbox)">
        <el-switch v-model="store.config.hardwareAcceleration" />
      </el-form-item>

      <el-form-item label="自动清理已完成任务">
        <el-switch v-model="store.config.autoCleanup" />
      </el-form-item>

      <div class="actions">
        <el-button type="warning" @click="store.resetConfig">重置默认</el-button>
      </div>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { useFFmpegStore } from "../ffmpegStore";
import { useFFmpegCore } from "../composables/useFFmpegCore";
import { customMessage } from "@/utils/customMessage";

const store = useFFmpegStore();
const { checkAvailability } = useFFmpegCore();

const testFFmpeg = async () => {
  const ok = await checkAvailability(store.config.ffmpegPath);
  if (ok) {
    customMessage.success("FFmpeg 路径有效");
  } else {
    customMessage.error("FFmpeg 路径无效或不可用");
  }
};
</script>

<style scoped>
.settings-container {
  height: 100%;
  padding: 24px;
  overflow-y: auto;
  box-sizing: border-box;
}

.settings-form {
  max-width: 800px;
  background: var(--card-bg);
  padding: 24px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.help-text {
  font-size: 12px;
  color: var(--text-color-light);
  margin-top: 4px;
  line-height: 1.5;
}

.actions {
  margin-top: 32px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}
/* 自定义滚动条 */
.settings-container::-webkit-scrollbar {
  width: 6px;
}

.settings-container::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb-color);
  border-radius: 3px;
}

.settings-container::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover-color);
}
</style>
