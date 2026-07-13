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
  <div class="export-panel">
    <div class="export-content-layout">
      <!-- 左侧配置区 -->
      <div class="config-section">
        <!-- 预设管理区（收纳到配置区顶部） -->
        <PresetManager :repo-path="repoPath" @change="updatePreview" />

        <div class="section-title">导出配置</div>
        <div class="config-scroll-container">
          <ExportConfiguration
            v-model:config="exportConfig"
            :total-commits="totalCommits"
          />
        </div>

        <div v-if="needsEnrichment" class="enrich-panel">
          <div class="enrich-content">
            <span class="enrich-title">⚠️ 需要补充数据</span>
            <span class="enrich-desc">
              将为 {{ requiredEnrichHashes.length }} 个提交补充
              {{ enrichmentRequirementText }}（预计约
              {{ estimatedSeconds }} 秒）。
            </span>
            <el-progress
              v-if="enriching"
              :percentage="
                enrichProgress.total > 0
                  ? Math.round(
                      (enrichProgress.loaded / enrichProgress.total) * 100
                    )
                  : 0
              "
              :stroke-width="12"
              striped
              striped-flow
              class="enrich-progress"
            >
              <template #default="{ percentage }">
                <span class="progress-text"
                  >{{ enrichProgress.loaded }} / {{ enrichProgress.total }} ({{
                    percentage
                  }}%)</span
                >
              </template>
            </el-progress>
          </div>
          <div class="enrich-actions">
            <el-button
              type="warning"
              size="small"
              :loading="enriching"
              @click="startEnrich"
            >
              {{ enriching ? "正在补充..." : "开始补充" }}
            </el-button>
            <el-button
              v-if="enriching"
              size="small"
              @click="$emit('cancel-enrich')"
              >取消</el-button
            >
          </div>
        </div>
      </div>

      <!-- 右侧预览区 -->
      <div class="preview-area">
        <div class="preview-card">
          <ExportPreview
            :content="previewContent"
            :format="exportConfig.format"
            :generating="generating"
            :loading-files="loadingFiles"
            :exporting="exporting"
            :disabled-export="needsEnrichment"
            @refresh="updatePreview"
            @copy="copyToClipboard"
            @download="downloadFile"
            @export="handleExport"
            @send-to-chat="handleSendToChat"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, toRef } from "vue";
import { customMessage } from "@/utils/customMessage";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { GitCommit, ExportConfig, RepoStatistics } from "../types";
import { useGitAnalyzerState } from "../composables/useGitAnalyzerState";
import { useReportGenerator } from "../composables/useReportGenerator";
import { useSendToChat } from "@/composables/useSendToChat";
import { commitCache } from "../composables/useCommitCache";
import ExportConfiguration from "./ExportConfiguration.vue";
import ExportPreview from "./ExportPreview.vue";
import PresetManager from "./PresetManager.vue";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const errorHandler = createModuleErrorHandler("ExportModule");
const { sendToChat } = useSendToChat();

const props = defineProps<{
  commits: GitCommit[];
  filteredCommits: GitCommit[];
  statistics: RepoStatistics;
  repoPath: string;
  branch: string;
  initialConfig?: Partial<ExportConfig>;
  reverseOrder?: boolean;
}>();

const emit = defineEmits<{
  "update:exportConfig": [config: ExportConfig];
  "enrich-commits": [
    options: {
      hashes: string[];
      includeStats: boolean;
      includeFiles: boolean;
      includeBranches: boolean;
    },
  ];
  "cancel-enrich": [];
}>();

const generating = ref(false);
const exporting = ref(false);
const previewContent = ref("");

// 预设管理本地状态
const totalCommits = computed(() => props.commits.length);

// 从 state 获取共享状态
const {
  loadingFiles,
  filterSummary,
  hasActiveFilters,
  exportConfig,
  enriching,
  enrichProgress,
  enrichedHashes,
} = useGitAnalyzerState();
// 生成导出文件名
function generateFileName(extension: string): string {
  // 从仓库路径提取项目名
  const projectName = props.repoPath
    ? props.repoPath.split(/[/\\]/).filter(Boolean).pop() || "git-repo"
    : "git-repo";

  // 格式化日期为 YYYY-MM-DD
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const dateStr = `${year}-${month}-${day}`;

  return `${projectName}_提交统计_${dateStr}.${extension}`;
}

// 获取要导出的提交记录
function getCommitsToExport(): GitCommit[] {
  // 先根据范围获取基础提交列表
  let base: GitCommit[] = (() => {
    switch (exportConfig.value.commitRange) {
      case "all":
        return props.commits;
      case "filtered":
        return props.filteredCommits;
      case "custom":
        return props.filteredCommits.slice(0, exportConfig.value.customCount);
      default:
        return props.filteredCommits;
    }
  })();

  // 应用倒序（仅当选择"所有提交"且启用倒序时）
  if (exportConfig.value.commitRange === "all" && props.reverseOrder) {
    base = [...base].reverse();
  }

  // 如果需要文件变更信息，合并文件数据
  return getMergedCommits(base);
}

const requiredEnrichHashes = computed(() => {
  if (!exportConfig.value.includeStats && !exportConfig.value.includeFiles) {
    return [];
  }

  return getCommitsToExport()
    .filter((commit) => {
      // 已经补充过的提交不再需要重复补充
      if (enrichedHashes.value.has(commit.hash)) {
        return false;
      }
      if (exportConfig.value.includeStats) {
        return !commit.stats || !commit.files;
      }
      return !commit.files;
    })
    .map((commit) => commit.hash);
});

const needsEnrichment = computed(() => requiredEnrichHashes.value.length > 0);
const enrichmentRequirementText = computed(() => {
  const requirements: string[] = [];
  if (exportConfig.value.includeStats) {
    requirements.push("行级统计");
  }
  if (exportConfig.value.includeFiles) {
    requirements.push("文件变更详情");
  }
  return requirements.join("、") || "完整提交数据";
});
const estimatedSeconds = computed(() =>
  Math.max(1, Math.ceil(requiredEnrichHashes.value.length / 10))
);

// 获取合并后的提交数据（优先使用带文件信息的版本）
function getMergedCommits(commits: GitCommit[]): GitCommit[] {
  const cached =
    commitCache.getBatchCommits(props.repoPath, props.branch) || [];
  if (!exportConfig.value.includeFiles || cached.length === 0) {
    return commits;
  }

  // 创建一个 hash -> commit 的映射
  const filesMap = new Map<string, GitCommit>();
  cached.forEach((c) => filesMap.set(c.hash, c));

  // 合并数据
  return commits.map((commit) => {
    const withFiles = filesMap.get(commit.hash);
    if (withFiles && withFiles.files) {
      return { ...commit, files: withFiles.files };
    }
    return commit;
  });
}

// 初始化报告生成器
const { generateReport } = useReportGenerator({
  config: exportConfig,
  repoPath: toRef(props, "repoPath"),
  branch: toRef(props, "branch"),
  getCommitsToExport,
  filterSummary,
  hasActiveFilters,
});

// 更新预览
async function updatePreview() {
  if (generating.value) return;
  generating.value = true;
  try {
    previewContent.value = generateReport();
  } catch (error) {
    errorHandler.error(error, "生成报告预览失败", {
      context: {
        format: exportConfig.value.format,
        commitRange: exportConfig.value.commitRange,
        includeStatistics: exportConfig.value.includeStatistics,
        includeCommits: exportConfig.value.includeCommits,
        includeContributors: exportConfig.value.includeContributors,
        includeFiles: exportConfig.value.includeFiles,
      },
    });
  } finally {
    generating.value = false;
  }
}
// 复制到剪贴板
async function copyToClipboard() {
  try {
    await navigator.clipboard.writeText(previewContent.value);
    customMessage.success("已复制到剪贴板");
  } catch (error) {
    errorHandler.error(error, "复制报告内容到剪贴板失败", {
      context: {
        format: exportConfig.value.format,
        contentLength: previewContent.value.length,
      },
    });
  }
}

// 下载文件
async function downloadFile() {
  const formatExtensions: Record<string, string> = {
    markdown: "md",
    json: "json",
    csv: "csv",
    html: "html",
    text: "txt",
  };

  const extension = formatExtensions[exportConfig.value.format];
  const fileName = generateFileName(extension);

  // 创建 Blob 并下载
  const blob = new Blob([previewContent.value], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  customMessage.success(`已下载: ${fileName}`);
}

// 发送到聊天
// 发送到聊天
function handleSendToChat() {
  const format = exportConfig.value.format;
  const isCodeFormat = ["markdown", "json", "html", "csv", "text"].includes(
    format
  );

  sendToChat(previewContent.value, {
    format: isCodeFormat ? "code" : "plain",
    language: isCodeFormat ? format : undefined,
  });
}

// 导出文件（使用 Tauri 的文件保存对话框）
async function handleExport() {
  if (needsEnrichment.value) {
    customMessage.warning("请先补充导出所需数据");
    return;
  }

  exporting.value = true;

  const formatExtensions: Record<string, string> = {
    markdown: "md",
    json: "json",
    csv: "csv",
    html: "html",
    text: "txt",
  };

  const extension = formatExtensions[exportConfig.value.format];
  const defaultName = generateFileName(extension);

  try {
    const filePath = await save({
      defaultPath: defaultName,
      filters: [
        {
          name: exportConfig.value.format.toUpperCase(),
          extensions: [extension],
        },
      ],
    });

    if (filePath) {
      await writeTextFile(filePath, previewContent.value);
      customMessage.success(`文件已保存: ${filePath}`);
    }
  } catch (error) {
    errorHandler.error(error, "导出报告文件失败", {
      context: {
        format: exportConfig.value.format,
        defaultFileName: defaultName,
        contentLength: previewContent.value.length,
        commitRange: exportConfig.value.commitRange,
      },
    });
  } finally {
    exporting.value = false;
  }
}

function startEnrich() {
  emit("enrich-commits", {
    hashes: requiredEnrichHashes.value,
    includeStats: exportConfig.value.includeStats,
    includeFiles:
      exportConfig.value.includeFiles || exportConfig.value.includeStats,
    includeBranches: false,
  });
}

// 暴露更新预览方法给父组件
defineExpose({
  updatePreview,
});

// 监听需要补充数据的导出选项变化，更新预览
watch(
  () => [exportConfig.value.includeFiles, exportConfig.value.includeStats],
  () => {
    updatePreview();
  }
);

// 监听 loadingFiles 变化，加载完成后自动刷新预览
watch(loadingFiles, (loading) => {
  if (!loading && exportConfig.value.includeFiles) {
    updatePreview();
  }
});

// 仓库路径或分支变更时，清理预览内容
watch(
  () => [props.repoPath, props.branch],
  ([newPath, newBranch], [oldPath, oldBranch]) => {
    if (newPath !== oldPath || newBranch !== oldBranch) {
      previewContent.value = "";
    }
  }
);
</script>

<style scoped>
.export-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 16px;
  overflow: hidden;
}

.export-content-layout {
  flex: 1;
  display: flex;
  gap: 20px;
  min-height: 0;
  overflow: hidden;
}

.config-section {
  width: 420px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: var(--container-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color-light);
  padding: 16px;
  flex-shrink: 0;
  overflow: hidden;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-color);
  border-bottom: 1px solid var(--border-color-light);
  padding-bottom: 8px;
  flex-shrink: 0;
}

.config-scroll-container {
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
}

.enrich-panel {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 12px;
  border: 1px solid color-mix(in srgb, var(--el-color-warning) 30%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--el-color-warning) 5%, var(--card-bg));
  flex-shrink: 0;
}

.enrich-content {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.enrich-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--el-color-warning);
  white-space: nowrap;
}

.enrich-desc {
  font-size: 12px;
  color: var(--el-text-color-primary);
}

.enrich-progress {
  width: 180px;
  margin-left: 8px;
}

.progress-text {
  font-size: 11px;
  white-space: nowrap;
}

.enrich-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
}

.preview-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.preview-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 让 ExportPreview 内部高度占满 */
.preview-card :deep(.preview-section) {
  height: 100%;
}

/* 响应式布局：窄屏适配 */
@media (max-width: 1200px) {
  .export-content-layout {
    flex-direction: column;
    overflow-y: auto;
  }

  .config-section {
    width: 100%;
    height: auto;
    flex-shrink: 0;
    overflow: visible;
  }

  .config-scroll-container {
    max-height: 400px;
    overflow-y: auto;
  }

  .preview-area {
    width: 100%;
    height: 800px;
    min-height: 600px;
    flex-shrink: 0;
  }
}
</style>
