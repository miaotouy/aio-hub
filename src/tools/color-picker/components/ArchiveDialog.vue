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
  <BaseDialog
    :model-value="visible"
    title="批量图片归档"
    width="680px"
    height="auto"
    :close-on-backdrop-click="false"
    @update:model-value="$emit('update:visible', $event)"
  >
    <div class="archive-dialog-content">
      <!-- 归档配置阶段 -->
      <template v-if="!archiveResult">
        <div class="selection-summary">
          <el-icon :size="24" class="summary-icon"><Files /></el-icon>
          <div class="summary-text">
            已选择
            <span class="highlight">{{ selectedCount }}</span> 张图片待归档
          </div>
        </div>

        <div class="config-form">
          <div class="config-item">
            <label class="config-label">目标目录</label>
            <el-input
              :model-value="targetDirectory"
              placeholder="请选择或输入归档目标目录"
              size="default"
              clearable
              @update:model-value="$emit('update:targetDirectory', $event)"
            >
              <template #append>
                <el-button @click="$emit('choose-directory')">
                  <el-icon style="margin-right: 4px"><FolderOpened /></el-icon>
                  选择目录
                </el-button>
              </template>
            </el-input>
          </div>

          <div class="config-item">
            <label class="config-label">归档方式</label>
            <el-radio-group
              :model-value="archiveMode"
              size="default"
              class="archive-mode-group"
              @update:model-value="$emit('update:archiveMode', $event)"
            >
              <el-radio-button value="copy">
                <div class="radio-content">
                  <el-icon><DocumentCopy /></el-icon>
                  <span>复制文件</span>
                </div>
              </el-radio-button>
              <el-radio-button value="symlink">
                <div class="radio-content">
                  <el-icon><Link /></el-icon>
                  <span>创建符号链接</span>
                </div>
              </el-radio-button>
            </el-radio-group>
            <div class="config-tip">
              {{
                archiveMode === "copy"
                  ? "复制：在目标目录下按色系和亮度创建文件夹，并将原图复制过去（占用额外磁盘空间）。"
                  : "链接：在目标目录下创建指向原图的符号链接（不占用额外空间，但需要管理员权限）。"
              }}
            </div>
          </div>
        </div>

        <!-- 预检结果 -->
        <div
          v-if="preflight.loading || preflight.error || hasPreflightResult"
          class="preflight-section"
        >
          <div class="section-title">归档预检</div>
          <div
            class="preflight-box"
            :class="{ 'is-loading': preflight.loading }"
          >
            <div v-if="preflight.loading" class="preflight-loading">
              <el-icon class="is-loading"><Loading /></el-icon>
              <span>正在进行磁盘空间与权限预检...</span>
            </div>
            <div v-else-if="preflight.error" class="preflight-message error">
              <el-icon><WarnTriangleFilled /></el-icon>
              <span class="preflight-text">{{ preflight.error }}</span>
            </div>
            <div
              v-else-if="archiveMode === 'copy'"
              class="preflight-message"
              :class="preflightStatus"
            >
              <el-icon><Coin /></el-icon>
              <div class="preflight-text">
                需要空间：<strong>{{
                  formatBytes(preflight.required ?? 0)
                }}</strong>
                <span class="divider">|</span>
                可用空间：<strong>{{
                  formatBytes(preflight.available ?? 0)
                }}</strong>
                <span class="status-text"
                  >({{
                    preflight.diskSufficient ? "空间充足" : "空间不足"
                  }})</span
                >
              </div>
            </div>
            <div v-else class="preflight-message" :class="preflightStatus">
              <el-icon><Key /></el-icon>
              <span class="preflight-text">
                系统权限：<strong>{{
                  preflight.symlinkAllowed ? "正常" : "受限"
                }}</strong>
                <span class="status-text"
                  >({{
                    preflight.symlinkAllowed
                      ? "允许创建符号链接"
                      : "需要管理员权限运行应用"
                  }})</span
                >
              </span>
            </div>
          </div>
        </div>
      </template>

      <!-- 归档结果阶段 -->
      <template v-else>
        <div class="result-header">
          <el-icon :size="48" class="result-icon success"
            ><CircleCheckFilled
          /></el-icon>
          <h3 class="result-title">归档处理完成</h3>
          <p class="result-subtitle">图片已成功按色系与亮度整理至目标目录</p>
        </div>

        <div class="result-stats-grid">
          <div class="result-stat success">
            <div class="stat-number">{{ archiveResult.successCount }}</div>
            <div class="stat-label">成功归档</div>
          </div>
          <div class="result-stat renamed">
            <div class="stat-number">{{ archiveResult.renamedCount }}</div>
            <div class="stat-label">重命名冲突</div>
          </div>
          <div class="result-stat failed">
            <div class="stat-number">{{ archiveResult.failedCount }}</div>
            <div class="stat-label">归档失败</div>
          </div>
          <div class="result-stat missing">
            <div class="stat-number">
              {{ archiveResult.sourceNotFoundCount }}
            </div>
            <div class="stat-label">源文件丢失</div>
          </div>
        </div>

        <div class="result-actions">
          <el-button type="primary" @click="$emit('open-directory')">
            <el-icon style="margin-right: 4px"><FolderOpened /></el-icon>
            打开目标目录
          </el-button>
          <el-button @click="showDetails = !showDetails">
            <el-icon style="margin-right: 4px"><List /></el-icon>
            {{ showDetails ? "隐藏详情" : "查看详情列表" }}
          </el-button>
        </div>

        <!-- 详情折叠面板 -->
        <el-collapse-transition>
          <div v-show="showDetails" class="details-section">
            <div class="details-list">
              <div
                v-for="detail in archiveResult.details"
                :key="`${detail.sourcePath}-${detail.targetPath ?? detail.status}`"
                class="detail-item"
                :class="detail.status"
              >
                <el-tag
                  size="small"
                  :type="getDetailTagType(detail.status)"
                  effect="plain"
                >
                  {{ getDetailStatusLabel(detail.status) }}
                </el-tag>
                <div class="detail-paths">
                  <div class="detail-source" :title="detail.sourcePath">
                    {{ getFileName(detail.sourcePath) }}
                  </div>
                  <div
                    v-if="detail.targetPath"
                    class="detail-target"
                    :title="detail.targetPath"
                  >
                    → {{ detail.targetPath.replace(targetDirectory, "") }}
                  </div>
                  <div v-if="detail.error" class="detail-error">
                    {{ detail.error }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </el-collapse-transition>
      </template>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <template v-if="!archiveResult">
          <el-button @click="$emit('update:visible', false)">取消</el-button>
          <el-button
            type="primary"
            :loading="organizing"
            :disabled="!canOrganize"
            @click="$emit('organize')"
          >
            开始归档
          </el-button>
        </template>
        <template v-else>
          <el-button type="primary" @click="handleCloseResult">完成</el-button>
        </template>
      </div>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import {
  Files,
  FolderOpened,
  DocumentCopy,
  Link,
  Loading,
  WarnTriangleFilled,
  Coin,
  Key,
  CircleCheckFilled,
  List,
} from "@element-plus/icons-vue";
import type { BatchArchiveMode } from "../batchColorOrganizer";

interface ArchiveDetail {
  sourcePath: string;
  targetPath?: string;
  status: string;
  error?: string;
}

interface ArchiveResult {
  successCount: number;
  renamedCount: number;
  failedCount: number;
  sourceNotFoundCount: number;
  details: ArchiveDetail[];
}

interface PreflightState {
  loading: boolean;
  error: string;
  available?: number;
  required?: number;
  diskSufficient?: boolean;
  symlinkAllowed?: boolean;
}

interface Props {
  visible: boolean;
  selectedCount: number;
  targetDirectory: string;
  archiveMode: BatchArchiveMode;
  preflight: PreflightState;
  organizing: boolean;
  archiveResult: ArchiveResult | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "update:visible", value: boolean): void;
  (e: "update:targetDirectory", value: string): void;
  (e: "update:archiveMode", value: BatchArchiveMode): void;
  (e: "choose-directory"): void;
  (e: "organize"): void;
  (e: "open-directory"): void;
  (e: "clear-result"): void;
}>();

const showDetails = ref(false);

const hasPreflightResult = computed(() => {
  return props.archiveMode === "copy"
    ? props.preflight.diskSufficient !== undefined
    : props.preflight.symlinkAllowed !== undefined;
});

const preflightStatus = computed(() => {
  if (props.archiveMode === "copy") {
    return props.preflight.diskSufficient ? "success" : "error";
  }
  return props.preflight.symlinkAllowed ? "success" : "error";
});

const canOrganize = computed(() => {
  if (
    props.selectedCount === 0 ||
    !props.targetDirectory ||
    props.preflight.loading ||
    props.preflight.error
  ) {
    return false;
  }
  return props.archiveMode === "copy"
    ? props.preflight.diskSufficient === true
    : props.preflight.symlinkAllowed === true;
});

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = -1;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unit]}`;
};

function getFileName(path: string) {
  return path.split(/[/\\]/).pop() || path;
}

function getDetailStatusLabel(status: string) {
  if (status === "success") return "成功";
  if (status === "renamed") return "已重命名";
  if (status === "source_not_found") return "源文件丢失";
  return "失败";
}

function getDetailTagType(status: string) {
  if (status === "success") return "success";
  if (status === "renamed") return "warning";
  return "danger";
}

function handleCloseResult() {
  emit("update:visible", false);
  // 延迟清空结果，避免弹窗关闭动画中内容突然消失
  setTimeout(() => {
    emit("clear-result");
  }, 300);
}
</script>

<style scoped>
.archive-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 10px 0;
}

/* 待归档统计 */
.selection-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.08)
  );
  border: 1px solid rgba(var(--el-color-primary-rgb), 0.15);
  border-radius: 8px;
}

.summary-icon {
  color: var(--el-color-primary);
}

.summary-text {
  font-size: 14px;
  color: var(--text-color);
}

.summary-text .highlight {
  font-size: 18px;
  font-weight: 700;
  color: var(--el-color-primary);
  margin: 0 4px;
}

/* 配置表单 */
.config-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.config-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.config-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
}

.archive-mode-group {
  width: 100%;
  display: flex;
}

.archive-mode-group :deep(.el-radio-button) {
  flex: 1;
}

.archive-mode-group :deep(.el-radio-button__inner) {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 20px;
}

.radio-content {
  display: flex;
  align-items: center;
  gap: 8px;
}

.config-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}

/* 预检区域 */
.preflight-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preflight-section .section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
}

.preflight-box {
  padding: 12px 16px;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  min-height: 48px;
  display: flex;
  align-items: center;
}

.preflight-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.preflight-message {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  width: 100%;
}

.preflight-message.success {
  color: var(--el-color-success);
}

.preflight-message.error {
  color: var(--el-color-danger);
}

.preflight-text {
  flex: 1;
  min-width: 0;
}

.preflight-text .divider {
  margin: 0 8px;
  color: var(--border-color);
}

.preflight-text .status-text {
  margin-left: 6px;
  font-size: 12px;
  font-weight: 500;
}

/* 结果头部 */
.result-header {
  text-align: center;
  padding: 10px 0;
}

.result-icon {
  margin-bottom: 12px;
}

.result-icon.success {
  color: var(--el-color-success);
}

.result-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 6px;
  color: var(--text-color);
}

.result-subtitle {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin: 0;
}

/* 结果统计网格 */
.result-stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.result-stat {
  text-align: center;
  padding: 14px 8px;
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--border-color);
}

.result-stat.success {
  background: rgba(
    var(--el-color-success-rgb),
    calc(var(--card-opacity) * 0.08)
  );
  border-color: rgba(var(--el-color-success-rgb), 0.15);
}

.result-stat.renamed {
  background: rgba(
    var(--el-color-warning-rgb),
    calc(var(--card-opacity) * 0.08)
  );
  border-color: rgba(var(--el-color-warning-rgb), 0.15);
}

.result-stat.failed,
.result-stat.missing {
  background: rgba(
    var(--el-color-danger-rgb),
    calc(var(--card-opacity) * 0.08)
  );
  border-color: rgba(var(--el-color-danger-rgb), 0.15);
}

.stat-number {
  font-size: 24px;
  font-weight: 700;
  line-height: 1;
}

.result-stat.success .stat-number {
  color: var(--el-color-success);
}

.result-stat.renamed .stat-number {
  color: var(--el-color-warning);
}

.result-stat.failed .stat-number,
.result-stat.missing .stat-number {
  color: var(--el-color-danger);
}

.stat-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 6px;
}

.result-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 8px;
}

/* 详情列表 */
.details-section {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
  overflow: hidden;
}

.details-list {
  display: flex;
  flex-direction: column;
  max-height: 240px;
  overflow-y: auto;
  padding: 8px;
  gap: 6px;
}

.detail-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
}

.detail-paths {
  min-width: 0;
  flex: 1;
  font-size: 12px;
  line-height: 1.4;
}

.detail-source {
  color: var(--text-color);
  font-weight: 500;
}

.detail-target {
  margin-top: 2px;
  color: var(--el-text-color-secondary);
}

.detail-error {
  margin-top: 2px;
  color: var(--el-color-danger);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  width: 100%;
}

.is-loading {
  animation: rotating 2s linear infinite;
}

@keyframes rotating {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
