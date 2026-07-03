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
  <div class="security-config-panel card-glass">
    <div class="panel-header">
      <h3>
        <el-icon><Setting /></el-icon> 安全边界与规则配置
      </h3>
    </div>
    <div class="panel-body">
      <!-- 路径访问控制模式 -->
      <div class="config-item">
        <div class="item-header">
          <span class="label">路径访问控制</span>
        </div>
        <el-segmented
          v-model="config.sandboxMode"
          :options="[
            { label: '白名单模式', value: 'whitelist' },
            { label: '黑名单模式', value: 'blacklist' },
          ]"
          @change="saveConfig"
          style="width: 100%"
        />
        <p class="hint-text">
          {{
            config.sandboxMode === "whitelist"
              ? "白名单模式：仅允许访问白名单目录，其他目录一律禁止（死区）。"
              : "黑名单模式：默认允许访问所有目录，但黑名单规则中的目录除外。"
          }}
        </p>
      </div>

      <el-divider />

      <!-- 白名单目录配置（仅在白名单模式下显示） -->
      <div v-if="config.sandboxMode === 'whitelist'" class="config-item">
        <div class="item-header">
          <span class="label"> 白名单目录（允许访问） </span>
          <el-tooltip
            content="白名单模式下，AI 仅被允许读写这些目录及其子目录下的文件，防止目录穿越攻击。"
          >
            <el-icon class="info-icon"><QuestionFilled /></el-icon>
          </el-tooltip>
        </div>
        <div class="sandbox-list">
          <div
            v-for="(dir, index) in config.allowedDirectories"
            :key="index"
            class="sandbox-item"
          >
            <el-icon class="folder-icon"><Folder /></el-icon>
            <span class="path-text" :title="dir">{{ dir }}</span>
            <el-button
              type="danger"
              link
              :icon="Delete"
              @click="removeDirectory(index)"
              :disabled="config.allowedDirectories.length <= 1"
            />
          </div>
        </div>
        <div class="sandbox-input-section">
          <DropZone
            variant="input"
            :directory-only="true"
            :multiple="false"
            hide-content
            @drop="handlePathDrop"
          >
            <div class="path-input-group">
              <el-input
                v-model="localNewDirectoryPath"
                placeholder="输入或选择目录路径（支持拖拽）"
                @keyup.enter="addNewDirectory"
              />
              <el-button @click="selectDirectory" :icon="FolderOpened"
                >选择</el-button
              >
            </div>
          </DropZone>
          <div class="sandbox-actions">
            <el-button
              type="primary"
              :icon="Plus"
              @click="addNewDirectory"
              :disabled="!localNewDirectoryPath"
              class="add-btn"
            >
              添加允许目录
            </el-button>
            <el-button
              type="info"
              plain
              @click="resetToDefault"
              class="reset-btn"
            >
              重置默认
            </el-button>
          </div>
        </div>
        <el-divider />
      </div>

      <!-- 黑名单与安全规则（仅在黑名单模式下显示） -->
      <div v-if="config.sandboxMode === 'blacklist'" class="config-item">
        <div class="item-header">
          <span class="label">黑名单与安全规则</span>
          <el-tooltip
            content="对特定目录或文件设置更细粒度的安全规则。死区：完全禁止访问；审批区：无论如何都要审批，自动审批不绕过。"
          >
            <el-icon class="info-icon"><QuestionFilled /></el-icon>
          </el-tooltip>
        </div>
        <div class="rules-list">
          <el-empty
            v-if="!config.blackListRules || config.blackListRules.length === 0"
            description="暂无安全规则"
            :image-size="40"
          />
          <div
            v-else
            v-for="(rule, index) in config.blackListRules"
            :key="rule.id"
            class="rule-item"
          >
            <el-icon class="rule-icon" :class="rule.type"><Warning /></el-icon>
            <span class="path-text" :title="rule.path">{{ rule.path }}</span>
            <el-tag
              :type="rule.type === 'block' ? 'danger' : 'warning'"
              size="small"
              effect="dark"
            >
              {{ rule.type === "block" ? "死区 (禁止)" : "审批区 (审批)" }}
            </el-tag>
            <el-button
              type="danger"
              link
              :icon="Delete"
              @click="removeRule(index)"
            />
          </div>
        </div>
        <div class="rule-input-section">
          <DropZone
            variant="input"
            :directory-only="true"
            :multiple="false"
            hide-content
            @drop="handleRulePathDrop"
          >
            <div class="path-input-group">
              <el-input
                v-model="localNewRulePath"
                placeholder="输入或选择规则目录（支持拖拽）"
                @keyup.enter="addNewRule"
              />
              <el-button @click="selectRulePath" :icon="FolderOpened"
                >选择</el-button
              >
            </div>
          </DropZone>
          <div class="rule-actions">
            <el-radio-group v-model="localNewRuleType" size="small">
              <el-radio-button value="block">死区 (完全禁止)</el-radio-button>
              <el-radio-button value="approve"
                >审批区 (必须审批)</el-radio-button
              >
            </el-radio-group>
            <el-button
              type="primary"
              :icon="Plus"
              @click="addNewRule"
              :disabled="!localNewRulePath"
              size="small"
              class="add-rule-btn"
            >
              添加规则
            </el-button>
          </div>
        </div>
        <el-divider />
      </div>

      <!-- 最大文件大小限制 -->
      <div class="config-item">
        <div class="item-header">
          <span class="label">最大读取文件大小</span>
          <span class="value-text"
            >{{ (config.maxFileSize / 1024 / 1024).toFixed(0) }} MB</span
          >
        </div>
        <el-slider
          v-model="localMaxFileSizeMB"
          :min="1"
          :max="100"
          :step="1"
          @change="updateMaxFileSize"
        />
        <p class="hint-text">限制 AI 读取超大文件，防止内存溢出或前端卡死。</p>
      </div>

      <el-divider />

      <!-- 文件覆盖策略 -->
      <div class="config-item flex-between">
        <div class="text-group">
          <span class="label">文件覆盖策略</span>
          <p class="hint-text">当写入的文件已存在时，如何处理覆盖行为。</p>
        </div>
        <el-select
          v-model="config.overwritePolicy"
          @change="saveConfig"
          style="width: 180px"
        >
          <el-option label="遵循 Agent 传参" value="follow" />
          <el-option label="总是覆盖" value="always" />
          <el-option label="从不覆盖 (自动累加)" value="never" />
        </el-select>
      </div>

      <el-divider />

      <!-- 审计日志开关 -->
      <div class="config-item flex-between">
        <div class="text-group">
          <span class="label">启用操作审计日志</span>
          <p class="hint-text">
            记录 AI 调用此工具的所有操作历史，便于安全审计。
          </p>
        </div>
        <el-switch v-model="config.enableAuditLog" @change="saveConfig" />
      </div>

      <el-divider />

      <!-- 基建状态核对 -->
      <div class="config-item">
        <span class="label">基建依赖状态</span>
        <div class="dependency-status">
          <div class="dep-item">
            <span class="dep-name">Tauri File Commands</span>
            <el-tag type="success" size="small" effect="plain">已就绪</el-tag>
          </div>
          <div class="dep-item">
            <span class="dep-name">Word 解析器 (mammoth)</span>
            <el-tag type="success" size="small" effect="plain">已就绪</el-tag>
          </div>
          <div class="dep-item">
            <span class="dep-name">PDF 解析器 (pdfjs-dist)</span>
            <el-tag type="success" size="small" effect="plain">已就绪</el-tag>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import {
  FolderOpened,
  Setting,
  Folder,
  Delete,
  Plus,
  QuestionFilled,
  Warning,
} from "@element-plus/icons-vue";
import DropZone from "@components/common/DropZone.vue";
import type { AioFileOperatorConfig } from "../types";

const props = defineProps<{
  config: AioFileOperatorConfig;
  maxFileSizeMB: number;
  newDirectoryPath: string;
  newRulePath: string;
  newRuleType: "block" | "approve";
}>();

const emit = defineEmits([
  "save-config",
  "update-max-file-size",
  "handle-path-drop",
  "select-directory",
  "add-new-directory",
  "remove-directory",
  "reset-to-default",
  "select-rule-path",
  "handle-rule-path-drop",
  "add-new-rule",
  "remove-rule",
  "update:newDirectoryPath",
  "update:newRulePath",
  "update:newRuleType",
]);

// 绑定本地 ref 方便双向绑定
const localNewDirectoryPath = ref(props.newDirectoryPath);
const localNewRulePath = ref(props.newRulePath);
const localNewRuleType = ref(props.newRuleType);
const localMaxFileSizeMB = ref(props.maxFileSizeMB);

watch(
  () => props.newDirectoryPath,
  (val) => {
    localNewDirectoryPath.value = val;
  }
);
watch(
  () => props.newRulePath,
  (val) => {
    localNewRulePath.value = val;
  }
);
watch(
  () => props.newRuleType,
  (val) => {
    localNewRuleType.value = val;
  }
);
watch(
  () => props.maxFileSizeMB,
  (val) => {
    localMaxFileSizeMB.value = val;
  }
);

watch(localNewDirectoryPath, (val) => {
  emit("update:newDirectoryPath", val);
});
watch(localNewRulePath, (val) => {
  emit("update:newRulePath", val);
});
watch(localNewRuleType, (val) => {
  emit("update:newRuleType", val);
});

function saveConfig() {
  emit("save-config");
}

function updateMaxFileSize(val: any) {
  emit("update-max-file-size", val);
}

function handlePathDrop(paths: string[]) {
  emit("handle-path-drop", paths);
}

function selectDirectory() {
  emit("select-directory");
}

function addNewDirectory() {
  emit("add-new-directory");
}

function removeDirectory(index: number) {
  emit("remove-directory", index);
}

function resetToDefault() {
  emit("reset-to-default");
}

function selectRulePath() {
  emit("select-rule-path");
}

function handleRulePathDrop(paths: string[]) {
  emit("handle-rule-path-drop", paths);
}

function addNewRule() {
  emit("add-new-rule");
}

function removeRule(index: number) {
  emit("remove-rule", index);
}
</script>

<style scoped>
.security-config-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.panel-header {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-color);
  background-color: rgba(255, 255, 255, 0.01);
}

.panel-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--el-text-color-primary);
}

.panel-body {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
}

.config-item {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.config-item.flex-between {
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.label {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.value-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-color-primary);
}

.info-icon {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  cursor: help;
}

.sandbox-list,
.rules-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 150px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background-color: rgba(0, 0, 0, 0.02);
}

.sandbox-item,
.rule-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 4px;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
}

.folder-icon {
  font-size: 14px;
  color: var(--el-color-warning);
}

.rule-icon {
  font-size: 14px;
}

.rule-icon.block {
  color: var(--el-color-danger);
}

.rule-icon.approve {
  color: var(--el-color-warning);
}

.path-text {
  flex: 1;
  font-size: 12px;
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-text-color-regular);
}

.sandbox-input-section,
.rule-input-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 6px;
}

.path-input-group {
  display: flex;
  gap: 6px;
  width: 100%;
}

.sandbox-actions,
.rule-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.add-btn,
.add-rule-btn {
  flex: 1;
}

.reset-btn {
  flex-shrink: 0;
}

.hint-text {
  margin: 0;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}

.text-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dependency-status {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 6px;
}

.dep-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  border-radius: 6px;
  background-color: rgba(0, 0, 0, 0.01);
  border: 1px solid var(--border-color);
}

.dep-name {
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.flex-between {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.el-divider--horizontal {
  margin: 12px 0;
}
</style>
