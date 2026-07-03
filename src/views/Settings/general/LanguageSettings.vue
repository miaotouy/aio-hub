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

<script setup lang="ts">
import { InfoFilled } from "@element-plus/icons-vue";
</script>

<template>
  <div class="language-settings">
    <div class="language-card">
      <div class="language-header">
        <div class="language-title">
          <span>界面语言</span>
          <el-tag type="warning" size="small" effect="plain">开发中</el-tag>
        </div>
        <el-tooltip
          content="语言设置入口已预留，后续会接入语言包管理和完整 i18n 能力"
          placement="top"
        >
          <el-icon class="info-icon">
            <InfoFilled />
          </el-icon>
        </el-tooltip>
      </div>

      <div class="language-body">
        <div class="language-copy">
          <div class="language-label">当前占位</div>
          <div class="language-desc">
            后续将在这里追加语言包管理、界面语言切换和翻译资源状态。
          </div>
        </div>

        <el-select
          model-value="zh-CN"
          disabled
          placeholder="选择语言"
          class="language-select"
        >
          <el-option label="简体中文" value="zh-CN" />
        </el-select>
      </div>
    </div>
  </div>
</template>

<style scoped>
.language-settings {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.language-card {
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
  border-radius: 8px;
  padding: 16px;
}

.language-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.language-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.info-icon {
  color: var(--text-color-secondary);
  cursor: help;
}

.language-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.language-copy {
  min-width: 0;
}

.language-label {
  font-size: 13px;
  color: var(--text-color);
  margin-bottom: 4px;
}

.language-desc {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-color-secondary);
}

.language-select {
  width: 220px;
  flex: 0 0 auto;
}

@media (max-width: 720px) {
  .language-body {
    align-items: stretch;
    flex-direction: column;
  }

  .language-select {
    width: 100%;
  }
}
</style>
