<template>
  <div class="aio-file-operator-container">
    <!-- 头部区域 -->
    <div class="header-section">
      <div class="title-area">
        <div class="text-info">
          <h2>本地文件操作器</h2>
          <p>为 AI 智能体提供安全、受控的本地物理文件读写与目录管理能力</p>
        </div>
      </div>
      <div class="status-badge" :class="{ active: isDistributedExposed }">
        <span class="dot"></span>
        {{ isDistributedExposed ? "分布式已桥接" : "本地就绪" }}
      </div>
    </div>

    <!-- 主体内容 -->
    <div class="main-content">
      <!-- 左侧配置面板 -->
      <div class="config-panel card-glass">
        <div class="panel-header">
          <h3>
            <el-icon><Setting /></el-icon> 安全沙箱与配置
          </h3>
        </div>
        <div class="panel-body">
          <!-- 沙箱安全模式 -->
          <div class="config-item">
            <div class="item-header">
              <span class="label">沙箱安全模式</span>
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

          <!-- 沙箱目录配置 -->
          <div
            class="config-item"
            :class="{ 'disabled-section': config.sandboxMode === 'blacklist' }"
          >
            <div class="item-header">
              <span class="label">
                安全白名单目录
                <el-tag
                  v-if="config.sandboxMode === 'blacklist'"
                  type="info"
                  size="small"
                  style="margin-left: 8px"
                  >已禁用</el-tag
                >
              </span>
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
                  :disabled="
                    config.allowedDirectories.length <= 1 ||
                    config.sandboxMode === 'blacklist'
                  "
                />
              </div>
            </div>
            <div class="sandbox-input-section">
              <DropZone
                variant="input"
                :directory-only="true"
                :multiple="false"
                hide-content
                :disabled="config.sandboxMode === 'blacklist'"
                @drop="handlePathDrop"
              >
                <div class="path-input-group">
                  <el-input
                    v-model="newDirectoryPath"
                    placeholder="输入或选择目录路径（支持拖拽）"
                    :disabled="config.sandboxMode === 'blacklist'"
                    @keyup.enter="addNewDirectory"
                  />
                  <el-button
                    @click="selectDirectory"
                    :icon="FolderOpened"
                    :disabled="config.sandboxMode === 'blacklist'"
                    >选择</el-button
                  >
                </div>
              </DropZone>
              <div class="sandbox-actions">
                <el-button
                  type="primary"
                  :icon="Plus"
                  @click="addNewDirectory"
                  :disabled="
                    !newDirectoryPath || config.sandboxMode === 'blacklist'
                  "
                  class="add-btn"
                >
                  添加目录
                </el-button>
                <el-button
                  type="info"
                  plain
                  @click="resetToDefault"
                  :disabled="config.sandboxMode === 'blacklist'"
                  class="reset-btn"
                >
                  重置默认
                </el-button>
              </div>
            </div>
          </div>

          <el-divider />

          <!-- 黑名单与安全规则 -->
          <div class="config-item">
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
                v-if="
                  !config.blackListRules || config.blackListRules.length === 0
                "
                description="暂无安全规则"
                :image-size="40"
              />
              <div
                v-else
                v-for="(rule, index) in config.blackListRules"
                :key="rule.id"
                class="rule-item"
              >
                <el-icon class="rule-icon" :class="rule.type"
                  ><Warning
                /></el-icon>
                <span class="path-text" :title="rule.path">{{
                  rule.path
                }}</span>
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
                    v-model="newRulePath"
                    placeholder="输入或选择规则目录（支持拖拽）"
                    @keyup.enter="addNewRule"
                  />
                  <el-button @click="selectRulePath" :icon="FolderOpened"
                    >选择</el-button
                  >
                </div>
              </DropZone>
              <div class="rule-actions">
                <el-radio-group v-model="newRuleType" size="small">
                  <el-radio-button value="block"
                    >死区 (完全禁止)</el-radio-button
                  >
                  <el-radio-button value="approve"
                    >审批区 (必须审批)</el-radio-button
                  >
                </el-radio-group>
                <el-button
                  type="primary"
                  :icon="Plus"
                  @click="addNewRule"
                  :disabled="!newRulePath"
                  size="small"
                  class="add-rule-btn"
                >
                  添加规则
                </el-button>
              </div>
            </div>
          </div>

          <el-divider />

          <!-- 最大文件大小限制 -->
          <div class="config-item">
            <div class="item-header">
              <span class="label">最大读取文件大小</span>
              <span class="value-text"
                >{{ (config.maxFileSize / 1024 / 1024).toFixed(0) }} MB</span
              >
            </div>
            <el-slider
              v-model="maxFileSizeMB"
              :min="1"
              :max="100"
              :step="1"
              @change="updateMaxFileSize"
            />
            <p class="hint-text">
              限制 AI 读取超大文件，防止内存溢出或前端卡死。
            </p>
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
                <el-tag type="success" size="small" effect="plain"
                  >已就绪</el-tag
                >
              </div>
              <div class="dep-item">
                <span class="dep-name">Word 解析器 (mammoth)</span>
                <el-tag type="success" size="small" effect="plain"
                  >已就绪</el-tag
                >
              </div>
              <div class="dep-item">
                <span class="dep-name">PDF 解析器 (pdfjs-dist)</span>
                <el-tag type="success" size="small" effect="plain"
                  >已就绪</el-tag
                >
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧审计日志面板 -->
      <div class="audit-panel card-glass">
        <div class="panel-header flex-between">
          <h3>
            <el-icon><Memo /></el-icon> 操作审计日志
          </h3>
          <el-button
            type="danger"
            plain
            size="small"
            :icon="Delete"
            @click="clearLogs"
            :disabled="logs.length === 0"
          >
            清空日志
          </el-button>
        </div>
        <div class="panel-body log-container">
          <el-empty v-if="logs.length === 0" description="暂无 AI 操作记录" />
          <div v-else class="log-list">
            <div
              v-for="(log, index) in sortedLogs"
              :key="index"
              class="log-item"
              :class="{ error: !log.result.success }"
            >
              <div class="log-meta">
                <span class="time">{{ formatTime(log.timestamp) }}</span>
                <span class="method-badge">{{ log.method }}</span>
                <el-tag
                  :type="log.result.success ? 'success' : 'danger'"
                  size="small"
                >
                  {{ log.result.success ? "成功" : "失败" }}
                </el-tag>
              </div>
              <div class="log-details">
                <div class="detail-row">
                  <span class="detail-label">参数:</span>
                  <code class="detail-value">{{
                    JSON.stringify(log.params)
                  }}</code>
                </div>
                <div class="detail-row">
                  <span class="detail-label">结果:</span>
                  <span
                    class="detail-value"
                    :class="{ 'text-danger': !log.result.success }"
                  >
                    {{ log.result.message }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import {
  FolderOpened,
  Setting,
  Folder,
  Delete,
  Plus,
  QuestionFilled,
  Memo,
  Warning,
} from "@element-plus/icons-vue";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { customMessage } from "@/utils/customMessage";
import DropZone from "@components/common/DropZone.vue";
import * as actions from "./actions";
import { DEFAULT_ALLOWED_DIRECTORIES } from "./config";
import type { AioFileOperatorConfig, OperationLogEntry } from "./types";

// 状态变量
const config = ref<AioFileOperatorConfig>({
  allowedDirectories: [],
  blackListRules: [],
  sandboxMode: "whitelist",
  maxFileSize: 10 * 1024 * 1024,
  enableAuditLog: true,
  overwritePolicy: "follow",
});

const maxFileSizeMB = ref(10);
const logs = ref<OperationLogEntry[]>([]);
const isDistributedExposed = ref(false);
const newDirectoryPath = ref("");
const newRulePath = ref("");
const newRuleType = ref<"block" | "approve">("block");

// 排序后的日志（最新的在最上面）
const sortedLogs = computed(() => {
  return [...logs.value].sort((a, b) => b.timestamp - a.timestamp);
});

// 初始化
onMounted(async () => {
  await loadConfig();
  await refreshLogs();
  checkDistributedStatus();
});

// 加载配置
async function loadConfig() {
  config.value = await actions.getConfig();
  maxFileSizeMB.value = Math.round(config.value.maxFileSize / 1024 / 1024);
}

// 保存配置
async function saveConfig() {
  await actions.setConfig(config.value);
  customMessage.success("配置已保存");
}

// 更新最大文件大小
function updateMaxFileSize(val: any) {
  config.value.maxFileSize = val * 1024 * 1024;
  saveConfig();
}

// 处理路径拖放
const handlePathDrop = (paths: string[]) => {
  if (paths.length > 0) {
    newDirectoryPath.value = paths[0];
    customMessage.success(`已选择路径: ${paths[0]}`);
  }
};

// 选择目录
async function selectDirectory() {
  try {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: "选择允许 AI 访问的沙箱目录",
    });

    if (typeof selected === "string") {
      newDirectoryPath.value = selected;
    }
  } catch (e) {
    console.error("选择目录失败", e);
  }
}

// 添加自定义目录
function addNewDirectory() {
  const path = newDirectoryPath.value.trim();
  if (!path) return;

  // 校验是否是绝对路径
  const isAbsolute = /^(?:[a-zA-Z]:[\\/]|[\\/]).+$/.test(path);
  if (!isAbsolute) {
    customMessage.error("请输入有效的绝对路径");
    return;
  }

  const normalized = path.replace(/\\/g, "/");
  if (config.value.allowedDirectories.includes(normalized)) {
    customMessage.warning("该目录已在列表中");
    return;
  }

  config.value.allowedDirectories.push(normalized);
  saveConfig();
  newDirectoryPath.value = "";
  customMessage.success("成功添加沙箱目录");
}

// 删除目录
function removeDirectory(index: number) {
  if (config.value.sandboxMode === "blacklist") return;
  config.value.allowedDirectories.splice(index, 1);
  saveConfig();
}

// 重置为默认
function resetToDefault() {
  if (config.value.sandboxMode === "blacklist") return;
  config.value.allowedDirectories = [...DEFAULT_ALLOWED_DIRECTORIES];
  saveConfig();
}

// 选择规则路径
async function selectRulePath() {
  try {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: "选择规则目录",
    });

    if (typeof selected === "string") {
      newRulePath.value = selected;
    }
  } catch (e) {
    console.error("选择目录失败", e);
  }
}

// 处理规则路径拖放
const handleRulePathDrop = (paths: string[]) => {
  if (paths.length > 0) {
    newRulePath.value = paths[0];
    customMessage.success(`已选择路径: ${paths[0]}`);
  }
};

// 添加安全规则
function addNewRule() {
  const path = newRulePath.value.trim();
  if (!path) return;

  // 校验是否是绝对路径
  const isAbsolute = /^(?:[a-zA-Z]:[\\/]|[\\/]).+$/.test(path);
  if (!isAbsolute) {
    customMessage.error("请输入有效的绝对路径");
    return;
  }

  const normalized = path.replace(/\\/g, "/");

  if (!config.value.blackListRules) {
    config.value.blackListRules = [];
  }

  if (config.value.blackListRules.some((r) => r.path === normalized)) {
    customMessage.warning("该路径已在规则列表中");
    return;
  }

  config.value.blackListRules.push({
    id: Math.random().toString(36).substring(2, 9),
    path: normalized,
    type: newRuleType.value,
  });

  saveConfig();
  newRulePath.value = "";
  customMessage.success("成功添加安全规则");
}

// 删除安全规则
function removeRule(index: number) {
  config.value.blackListRules.splice(index, 1);
  saveConfig();
  customMessage.success("成功删除安全规则");
}

// 刷新日志
async function refreshLogs() {
  logs.value = await actions.getOperationLogs();
}

// 清空日志
async function clearLogs() {
  await actions.clearLogs();
  await refreshLogs();
}

// 检查分布式桥接状态
async function checkDistributedStatus() {
  // 实际项目中，可以通过 vcp-connector 状态来判断是否已桥接
  isDistributedExposed.value = true; // 默认开启分布式桥接暴露
}

// 格式化时间
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")}`;
}
</script>

<style scoped>
.aio-file-operator-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px;
  height: 100%;
  box-sizing: border-box;
  background-color: transparent;
  overflow-y: auto;
}

.header-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
}

.title-area {
  display: flex;
  align-items: center;
  gap: 16px;
}

.main-icon {
  font-size: 36px;
  color: var(--el-color-primary);
}

.text-info h2 {
  margin: 0 0 4px 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.text-info p {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  background-color: rgba(var(--el-color-info-rgb), 0.1);
  color: var(--el-text-color-regular);
}

.status-badge.active {
  background-color: rgba(var(--el-color-success-rgb), 0.1);
  color: var(--el-color-success);
}

.status-badge .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--el-text-color-secondary);
}

.status-badge.active .dot {
  background-color: var(--el-color-success);
  box-shadow: 0 0 8px var(--el-color-success);
}

.main-content {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 20px;
  flex: 1;
  min-height: 0;
}

.card-glass {
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  background-color: rgba(255, 255, 255, 0.02);
}

.panel-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--el-text-color-primary);
}

.panel-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.config-item {
  display: flex;
  flex-direction: column;
  gap: 12px;
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
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.value-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-color-primary);
}

.info-icon {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  cursor: help;
}

.sandbox-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 180px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background-color: rgba(0, 0, 0, 0.05);
}

.sandbox-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 4px;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
}

.folder-icon {
  font-size: 16px;
  color: var(--el-color-warning);
}

.path-text {
  flex: 1;
  font-size: 13px;
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-text-color-regular);
}

.sandbox-input-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}

.path-input-group {
  display: flex;
  gap: 6px;
  width: 100%;
}

.sandbox-actions {
  display: flex;
  gap: 10px;
}

.add-btn {
  flex: 1;
}

.reset-btn {
  flex-shrink: 0;
}

.hint-text {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}

.text-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dependency-status {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}

.dep-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-radius: 6px;
  background-color: rgba(0, 0, 0, 0.02);
  border: 1px solid var(--border-color);
}

.dep-name {
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.flex-between {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.log-container {
  padding: 0;
}

.log-list {
  display: flex;
  flex-direction: column;
}

.log-item {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: background-color 0.2s;
}

.log-item:hover {
  background-color: rgba(255, 255, 255, 0.01);
}

.log-item.error {
  border-left: 3px solid var(--el-color-danger);
}

.log-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-family: monospace;
}

.method-badge {
  font-size: 12px;
  font-weight: 600;
  font-family: monospace;
  color: var(--el-color-primary);
  background-color: rgba(var(--el-color-primary-rgb), 0.1);
  padding: 2px 8px;
  border-radius: 4px;
}

.log-details {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background-color: rgba(0, 0, 0, 0.1);
  padding: 10px 14px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
}

.detail-row {
  display: flex;
  gap: 8px;
  font-size: 12px;
  line-height: 1.4;
}

.detail-label {
  color: var(--el-text-color-secondary);
  font-weight: 500;
  width: 40px;
  flex-shrink: 0;
}

.detail-value {
  color: var(--el-text-color-regular);
  word-break: break-all;
  font-family: monospace;
}

.text-danger {
  color: var(--el-color-danger);
}
</style>
