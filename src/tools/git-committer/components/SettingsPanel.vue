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
  <div class="git-committer-settings">
    <!-- 顶部标题栏 -->
    <div class="settings-header">
      <h2 class="settings-title">
        <Settings :size="18" class="settings-icon" />
        AI 提交助手设置
      </h2>
      <el-button type="primary" size="small" @click="$emit('close')">
        返回工作流
      </el-button>
    </div>

    <div class="settings-content">
      <!-- AI 偏好设置 -->
      <div class="settings-section">
        <h3 class="section-title">AI 偏好设置</h3>
        <el-form label-position="top" size="small">
          <el-form-item label="默认 AI 模型">
            <LlmModelSelector v-model="defaultModel" class="model-selector" />
          </el-form-item>
          <el-form-item>
            <template #label>
              <div class="prompt-label-row">
                <span>System Prompt (系统提示词)</span>
                <el-button
                  link
                  type="primary"
                  size="small"
                  @click="restoreDefaultSystemPrompt"
                >
                  恢复默认
                </el-button>
              </div>
            </template>
            <el-input
              v-model="systemPrompt"
              type="textarea"
              :rows="4"
              placeholder="教 AI 怎么写 commit message..."
            />
          </el-form-item>
        </el-form>
      </div>

      <!-- 工作流自动化 -->
      <div class="settings-section">
        <h3 class="section-title">工作流自动化</h3>
        <div class="switch-list">
          <div class="switch-item">
            <div class="switch-label-group">
              <span class="switch-label">Commit 后自动 Push</span>
              <span class="switch-desc"
                >本地提交成功后，自动触发 git push 推送到远程仓库</span
              >
            </div>
            <el-switch v-model="autoPushAfterCommit" />
          </div>

          <div class="switch-item">
            <div class="switch-label-group">
              <span class="switch-label">切换仓库时自动 Pull</span>
              <span class="switch-desc"
                >在左侧切换当前激活仓库时，自动触发 git pull 拉取最新更改</span
              >
            </div>
            <el-switch v-model="autoPullOnSwitch" />
          </div>

          <div class="switch-item">
            <div class="switch-label-group">
              <span class="switch-label"
                >无暂存文件时，AI 生成自动包含所有未暂存修改</span
              >
              <span class="switch-desc"
                >当暂存区为空时，AI
                闪亮按钮会自动提取工作区所有未暂存的修改生成提交信息</span
              >
            </div>
            <el-switch v-model="aiIncludeUnstaged" />
          </div>

          <div class="switch-item">
            <div class="switch-label-group">
              <span class="switch-label">自动刷新仓库状态</span>
              <span class="switch-desc"
                >当窗口聚焦或在前台静默轮询时，自动刷新所有关联仓库的 Git
                状态</span
              >
            </div>
            <div class="refresh-control-group">
              <el-select
                v-if="enableAutoRefresh"
                v-model="autoRefreshInterval"
                size="small"
                style="width: 100px; margin-right: 12px"
              >
                <el-option :value="5" label="5 秒" />
                <el-option :value="10" label="10 秒" />
                <el-option :value="30" label="30 秒" />
                <el-option :value="60" label="1 分钟" />
              </el-select>
              <el-switch v-model="enableAutoRefresh" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Settings } from "lucide-vue-next";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import {
  autoPushAfterCommit,
  autoPullOnSwitch,
  aiIncludeUnstaged,
  defaultModel,
  systemPrompt,
  restoreDefaultSystemPrompt,
  enableAutoRefresh,
  autoRefreshInterval,
} from "../composables/useGitCommitterState";

defineEmits<{
  (e: "close"): void;
}>();
</script>

<style scoped>
.git-committer-settings {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background-color: var(--card-bg);
  overflow: hidden;
}

.settings-header {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: var(--border-width) solid var(--border-color);
  flex-shrink: 0;
}

.settings-title {
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  margin: 0;
}

.settings-icon {
  color: var(--el-color-primary);
  margin-right: 8px;
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin: 0;
}

.model-selector {
  width: 100%;
}

.prompt-label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

/* 开关列表 */
.switch-list {
  display: flex;
  flex-direction: column;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background-color: rgba(var(--el-color-info-rgb), 0.02);
}

.switch-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: var(--border-width) solid var(--border-color);
}

.refresh-control-group {
  display: flex;
  align-items: center;
}

.switch-item:last-child {
  border-bottom: none;
}

.switch-label-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-right: 16px;
}

.switch-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.switch-desc {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
</style>
