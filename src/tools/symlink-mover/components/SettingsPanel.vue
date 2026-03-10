<script setup lang="ts">
import { FolderOpened, Rank, FolderAdd, InfoFilled, Close } from "@element-plus/icons-vue";
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
        <el-radio-group :model-value="operationMode" @update:model-value="emit('update:operationMode', $event)">
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
            operationMode === "move" ? "将文件移动到目标目录，并在原位置创建链接" : "在目标目录创建链接，保持原文件不动"
          }}
        </div>
      </div>

      <div class="setting-group">
        <div class="setting-header">
          <label>镜像搬家模式</label>
          <el-switch :model-value="mirrorMode" @update:model-value="emit('update:mirrorMode', $event)" />
        </div>
        <div class="mode-description">开启后，搬家的内容会同时复刻其在基准目录下的层级结构</div>
      </div>

      <div v-if="mirrorMode" class="setting-group animate-fade-in">
        <label>基准源目录</label>
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
            <el-button @click="emit('select-base-dir')" :icon="FolderOpened">选择</el-button>
          </div>
        </DropZone>
      </div>

      <div class="setting-group">
        <label>目标目录</label>
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
              :placeholder="operationMode === 'move' ? '输入、拖拽或点击选择目标目录' : '输入、拖拽或点击选择链接目录'"
            />
            <el-button @click="emit('select-target-dir')" :icon="FolderOpened">选择</el-button>
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
        <el-radio-group :model-value="linkType" @update:model-value="emit('update:linkType', $event)">
          <el-radio-button value="symlink">符号链接</el-radio-button>
          <el-radio-button value="link" :disabled="operationMode === 'link-only'">硬链接</el-radio-button>
        </el-radio-group>
        <div v-if="operationMode === 'link-only' && linkType === 'link'" class="warning-text">
          <el-icon>
            <InfoFilled />
          </el-icon>
          仅创建链接模式下不支持硬链接
        </div>
      </div>
    </div>

    <!-- 固定在底部的操作区域 -->
    <div class="action-area">
      <ProgressDisplay
        v-if="isProcessing || showProgress"
        :show-progress="showProgress"
        :current-progress="currentProgress"
        :current-file="currentFile"
        :copied-bytes="copiedBytes"
        :total-bytes="totalBytes"
        :is-processing="isProcessing"
      />

      <LogTicker v-if="latestLog" :log="latestLog" :ticker-key="tickerKey" @open-log="emit('open-log')" />

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
      <el-button v-else type="danger" @click="emit('cancel')" class="execute-btn" size="large">
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
  border-top: 1px solid var(--border-color);
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
