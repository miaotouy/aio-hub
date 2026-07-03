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
  <div class="settings-container">
    <el-form :model="store.config" label-position="top" class="settings-form">
      <el-form-item label="FFmpeg 可执行文件路径">
        <el-input
          v-model="store.config.ffmpegPath"
          :placeholder="`跟随全局配置 (当前: ${globalFfmpegPath})`"
        >
          <template #append>
            <el-button @click="testFFmpeg">测试</el-button>
          </template>
        </el-input>
        <div class="help-text">
          留空将跟随全局运行环境设置；填写后仅覆盖多媒体工作台。
          <span v-if="isUsingGlobal">当前使用：{{ activeFfmpegPath }}</span>
        </div>
      </el-form-item>

      <el-form-item label="默认工作目录">
        <el-input
          v-model="store.config.defaultWorkDir"
          placeholder="留空则使用输入文件所在目录"
        />
      </el-form-item>

      <el-form-item label="最大并发任务数">
        <el-input-number
          v-model="store.config.maxConcurrentTasks"
          :min="1"
          :max="8"
        />
      </el-form-item>

      <el-form-item label="硬件加速 (NVENC/QSV/VideoToolbox)">
        <el-switch v-model="store.config.hardwareAcceleration" />
      </el-form-item>

      <el-form-item label="自动清理已完成任务">
        <el-switch v-model="store.config.autoCleanup" />
      </el-form-item>

      <div class="actions">
        <el-button type="warning" @click="store.resetConfig"
          >重置默认</el-button
        >
      </div>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { useFFmpegStore } from "../ffmpegStore";
import { useFFmpegCore } from "../composables/useFFmpegCore";
import { customMessage } from "@/utils/customMessage";

const store = useFFmpegStore();
const { checkAvailability, activeFfmpegPath, globalFfmpegPath, isUsingGlobal } =
  useFFmpegCore();

const testFFmpeg = async () => {
  const ok = await checkAvailability(activeFfmpegPath.value);
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
  border: var(--border-width) solid var(--border-color);
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
  border-top: var(--border-width) solid var(--border-color);
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
