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
import {
  FolderOpened,
  Rank,
  FolderAdd,
  InfoFilled,
  Close,
} from "@element-plus/icons-vue";
import InfoCard from "@components/common/InfoCard.vue";
import DropZone from "@components/common/DropZone.vue";
import ProgressDisplay from "./ProgressDisplay.vue";
import LogTicker from "./LogTicker.vue";
import type { LinkType, OperationMode, OperationLog } from "../types";

interface Props {
  operationMode: OperationMode;
  mirrorMode: boolean;
  baseSourceDir: string;
  targetDirectory: string;
  linkType: LinkType;
  isProcessing: boolean;
  showProgress: boolean;
  currentProgress: number;
  currentFile: string;
  copiedBytes: number;
  totalBytes: number;
  latestLog: OperationLog | null;
  tickerKey: number;
  canExecute: boolean;
}

defineProps<Props>();

const emit = defineEmits<{
  "update:operationMode": [value: OperationMode];
  "update:mirrorMode": [value: boolean];
  "update:baseSourceDir": [value: string];
  "update:targetDirectory": [value: string];
  "update:linkType": [value: LinkType];
  "select-base-dir": [];
  "select-target-dir": [];
  execute: [];
  cancel: [];
  "open-log": [];
}>();
</script>

<template>
  <InfoCard title="操作设置" class="settings-card full-height-card">
    <!-- 可滚动的设置区域 -->
    <div class="settings-content">
      <div class="setting-group">
        <label>操作模式</label>
        <el-radio-group
          :model-value="operationMode"
          @update:model-value="emit('update:operationMode', $event)"
        >
          <el-radio-button value="move">
            <el-icon>
              <Rank />
            </el-icon>
            搬家模式
          </el-radio-button>
          <el-radio-button value="link-only">
            <el-icon>
              <FolderAdd />
            </el-icon>
            仅创建链接
          </el-radio-button>
        </el-radio-group>
        <div class="mode-description">
          {{
            operationMode === "move"
              ? "将文件移动到目标目录，并在原位置创建链接"
              : "在目标目录创建链接，保持原文件不动"
          }}
        </div>
        <div class="setting-help">
          <el-icon><InfoFilled /></el-icon>
          <span v-if="operationMode === 'move'">
            搬家模式会把源文件的实际内容放到目标目录，原来的路径会留下一个链接。
            依赖原路径的程序通常无需修改配置。
          </span>
          <span v-else>
            仅创建链接不会搬动或删除源文件，只在目标目录生成一个新的链接入口。
          </span>
        </div>
      </div>

      <div class="setting-group">
        <div class="setting-header">
          <label>镜像搬家模式</label>
          <el-switch
            :model-value="mirrorMode"
            @update:model-value="emit('update:mirrorMode', $event)"
          />
        </div>
        <div class="mode-description">
          开启后，搬家的内容会同时复刻其在基准目录下的层级结构
        </div>
        <div class="setting-help">
          <el-icon><InfoFilled /></el-icon>
          <span>
            关闭时，目标目录直接接收每个源文件或文件夹；开启后，目标目录会接收“源路径相对基准源目录”的路径。
          </span>
        </div>
      </div>

      <div v-if="mirrorMode" class="setting-group animate-fade-in">
        <label>基准源目录</label>
        <div class="field-help">
          <strong>它不是搬家目标。</strong>
          基准源目录用于计算相对路径，必须包含上面添加的所有源文件或文件夹。
          例如源路径为 <code>D:/Projects/App/src</code>，基准源目录为
          <code>D:/Projects/App</code>，目标目录为
          <code>E:/Archive</code>，搬家后会放到 <code>E:/Archive/src</code>。
        </div>
        <DropZone
          clickable
          variant="input"
          :directory-only="true"
          :multiple="false"
          hide-content
          @drop="(paths) => emit('update:baseSourceDir', paths[0])"
        >
          <div class="target-control">
            <el-input
              :model-value="baseSourceDir"
              @update:model-value="emit('update:baseSourceDir', $event)"
              placeholder="待搬家内容的上层基准目录"
            />
            <el-button @click="emit('select-base-dir')" :icon="FolderOpened"
              >选择</el-button
            >
          </div>
        </DropZone>
      </div>

      <div class="setting-group">
        <label>目标目录</label>
        <div class="field-help">
          <strong>{{
            operationMode === "move" ? "搬家模式：" : "仅创建链接："
          }}</strong>
          {{
            operationMode === "move"
              ? "这里是实际内容的新存放位置。工具会在此目录下按源文件名（或镜像后的相对路径）创建目标。"
              : "这里是链接入口的存放位置。源文件保持原位，工具会在此目录下创建指向源文件的链接。"
          }}
          <br />
          <span class="field-help-note"
            >不用填写最终文件名，工具会自动拼接；目标路径已存在时会在预检阶段阻止执行。</span
          >
        </div>
        <DropZone
          clickable
          variant="input"
          :directory-only="true"
          :multiple="false"
          hide-content
          @drop="(paths) => emit('update:targetDirectory', paths[0])"
        >
          <div class="target-control">
            <el-input
              :model-value="targetDirectory"
              @update:model-value="emit('update:targetDirectory', $event)"
              :placeholder="
                operationMode === 'move'
                  ? '输入、拖拽或点击选择目标目录'
                  : '输入、拖拽或点击选择链接目录'
              "
            />
            <el-button @click="emit('select-target-dir')" :icon="FolderOpened"
              >选择</el-button
            >
          </div>
        </DropZone>
      </div>

      <div class="setting-group">
        <label>
          链接类型
          <el-tooltip placement="top" :show-after="300">
            <template #content>
              <div class="link-type-tooltip">
                <div class="tooltip-section">
                  <div class="tooltip-title">符号链接（Symlink）</div>
                  <div class="tooltip-text">
                    • 类似快捷方式,存储目标路径<br />
                    • 可以跨分区/跨盘使用<br />
                    • 可以链接目录<br />
                    • 原文件删除后会失效
                  </div>
                </div>
                <div class="tooltip-section">
                  <div class="tooltip-title">硬链接（Hard Link）</div>
                  <div class="tooltip-text">
                    • 直接指向文件数据，与原文件平等<br />
                    • <strong>不能跨分区/跨盘</strong><br />
                    • <strong>不能链接目录</strong><br />
                    • 删除任一个不影响另一个<br />
                    • 全部删完就都没了
                  </div>
                </div>
              </div>
            </template>
            <el-icon class="info-icon">
              <InfoFilled />
            </el-icon>
          </el-tooltip>
        </label>
        <el-radio-group
          :model-value="linkType"
          @update:model-value="emit('update:linkType', $event)"
        >
          <el-radio-button value="symlink">符号链接</el-radio-button>
          <el-radio-button
            value="link"
            :disabled="operationMode === 'link-only'"
            >硬链接</el-radio-button
          >
        </el-radio-group>
        <div class="setting-help">
          <el-icon><InfoFilled /></el-icon>
          <span v-if="linkType === 'symlink'">
            符号链接可以跨磁盘并支持文件夹，原路径与目标路径之间保存的是路径引用。
          </span>
          <span v-else>
            硬链接只适用于同一磁盘上的文件，两个路径共享同一份文件数据。
          </span>
        </div>
        <div
          v-if="operationMode === 'link-only' && linkType === 'link'"
          class="warning-text"
        >
          <el-icon>
            <InfoFilled />
          </el-icon>
          仅创建链接模式下不支持硬链接
        </div>
      </div>
    </div>

    <!-- 固定在底部的操作区域 -->
    <div class="action-area">
      <div class="execution-note">
        <el-icon><InfoFilled /></el-icon>
        <span
          >点击操作后会先进行完整预检；发现目标冲突、权限不足、路径不安全或空间不足时，不会开始搬家。</span
        >
      </div>
      <ProgressDisplay
        v-if="isProcessing || showProgress"
        :show-progress="showProgress"
        :current-progress="currentProgress"
        :current-file="currentFile"
        :copied-bytes="copiedBytes"
        :total-bytes="totalBytes"
        :is-processing="isProcessing"
      />

      <LogTicker
        v-if="latestLog"
        :log="latestLog"
        :ticker-key="tickerKey"
        @open-log="emit('open-log')"
      />

      <el-button
        v-if="!isProcessing"
        type="primary"
        @click="emit('execute')"
        :disabled="!canExecute"
        class="execute-btn"
        size="large"
      >
        <el-icon>
          <Rank />
        </el-icon>
        {{ operationMode === "move" ? "开始搬家" : "创建链接" }}
      </el-button>
      <el-button
        v-else
        type="danger"
        @click="emit('cancel')"
        class="execute-btn"
        size="large"
      >
        <el-icon>
          <Close />
        </el-icon>
        取消操作
      </el-button>
    </div>
  </InfoCard>
</template>

<style scoped>
.full-height-card {
  flex: 1;
  min-height: 0;
}

.settings-card :deep(.el-card__body) {
  padding: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* 可滚动的设置内容区域 */
.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 25px;
}

/* 固定在底部的操作区域 */
.action-area {
  flex-shrink: 0;
  padding: 16px 20px 20px;
  border-top: var(--border-width) solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 统一设置组布局 */
.setting-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 标签基础样式 */
.setting-group label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

/* 设置头部（标签+开关并排） */
.setting-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* 单选按钮组样式 */
.setting-group :deep(.el-radio-group) {
  display: inline-flex;
  width: fit-content;
}

.setting-group :deep(.el-radio-button__inner) {
  padding: 10px 15px;
}

/* 描述文字 */
.mode-description {
  font-size: 12px;
  color: var(--text-color-light);
  line-height: 1.4;
}

.setting-help,
.field-help,
.execution-note {
  font-size: 12px;
  color: var(--text-color-light);
  line-height: 1.6;
}

.setting-help {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--el-color-info) 6%, transparent);
}

.setting-help .el-icon,
.execution-note .el-icon {
  flex: 0 0 auto;
  margin-top: 2px;
  color: var(--el-color-info);
}

.field-help {
  padding: 9px 10px;
  border-left: 2px solid
    color-mix(in srgb, var(--el-color-primary) 45%, transparent);
  background: color-mix(in srgb, var(--el-color-primary) 4%, transparent);
  border-radius: 0 6px 6px 0;
}

.field-help strong {
  color: var(--text-color);
  font-weight: 600;
}

.field-help code {
  padding: 1px 4px;
  border-radius: 3px;
  background: var(
    --code-bg,
    color-mix(in srgb, var(--text-color) 8%, transparent)
  );
  color: var(--text-color);
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  word-break: break-all;
}

.field-help-note {
  color: var(--text-color-light);
}

.execution-note {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 0 2px;
}

/* 警告文字 */
.warning-text {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--el-color-warning);
}

.warning-text .el-icon {
  font-size: 14px;
}

/* 目标目录控制 */
.target-control {
  display: flex;
  gap: 10px;
}

/* 执行按钮 */
.execute-btn {
  width: 100%;
  font-size: 16px;
}

/* 信息图标 */
.info-icon {
  font-size: 14px;
  color: var(--el-color-info);
  cursor: help;
}

/* 淡入动画 */
.animate-fade-in {
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Tooltip 样式 */
.link-type-tooltip {
  max-width: 350px;
}

.tooltip-section {
  margin-bottom: 12px;
}

.tooltip-section:last-child {
  margin-bottom: 0;
}

.tooltip-title {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 6px;
  color: var(--el-color-primary);
}

.tooltip-text {
  font-size: 12px;
  line-height: 1.6;
}

.tooltip-text strong {
  color: var(--el-color-warning);
  font-weight: 600;
}
</style>
