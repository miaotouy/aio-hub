<template>
  <BaseDialog
    :modelValue="visible"
    @update:modelValue="visible = $event"
    title="导出分析报告"
    width="1000px"
    height="85vh"
    :close-on-backdrop-click="false"
  >
    <template #content>
      <div class="export-module">
        <!-- 导出配置 -->
        <ExportConfiguration v-model:config="exportConfig" :total-commits="totalCommits" />

        <!-- 预览区域 -->
        <ExportPreview
          :content="previewContent"
          :format="exportConfig.format"
          :generating="generating"
          :loading-files="loadingFiles"
          @refresh="updatePreview"
          @copy="copyToClipboard"
          @download="downloadFile"
          @send-to-chat="handleSendToChat"
        />
      </div>
    </template>

    <template #footer>
      <el-space>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="handleExport" :loading="exporting"> 导出文件 </el-button>
      </el-space>
    </template>
  </BaseDialog>
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
  close: [];
  "update:exportConfig": [config: ExportConfig];
}>();
const visible = defineModel<boolean>("visible", { required: true });
const generating = ref(false);
const exporting = ref(false);
const previewContent = ref("");

// 获取当前缓存的文件数据（从统一缓存服务）
const commitsWithFiles = computed(() => {
  return commitCache.getBatchCommits(props.repoPath, props.branch) || [];
});

const exportConfig = ref<ExportConfig>({
  format: "markdown",
  includes: ["statistics", "commits", "contributors"],
  commitRange: "filtered",
  customCount: 100,
  dateFormat: "local",
  includeAuthor: true,
  includeEmail: false,
  includeFullMessage: false,
  includeFiles: false,
  includeTags: true,
  includeBranches: true,
  includeStats: true,
  includeFilterInfo: true,
  htmlTheme: "light",
});

// 初始化配置
if (props.initialConfig) {
  exportConfig.value = { ...exportConfig.value, ...props.initialConfig };
}

const totalCommits = computed(() => props.commits.length);

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

// 从 state 获取共享状态（文件变更信息在仓库加载完成后自动加载）
const { loadingFiles, filterSummary, hasActiveFilters } = useGitAnalyzerState();

// 获取合并后的提交数据（优先使用带文件信息的版本）
function getMergedCommits(commits: GitCommit[]): GitCommit[] {
  const cached = commitsWithFiles.value;
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
const reportGenerator = useReportGenerator({
  config: exportConfig,
  repoPath: toRef(props, "repoPath"),
  branch: toRef(props, "branch"),
  statistics: props.statistics,
  commits: props.commits,
  getCommitsToExport,
  filterSummary,
  hasActiveFilters,
});

// 更新预览
async function updatePreview() {
  if (generating.value) return;
  generating.value = true;
  try {
    previewContent.value = reportGenerator.generateReport();
  } catch (error) {
    errorHandler.error(error, "生成报告预览失败", {
      context: {
        format: exportConfig.value.format,
        commitRange: exportConfig.value.commitRange,
        includes: exportConfig.value.includes,
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
  const blob = new Blob([previewContent.value], { type: "text/plain;charset=utf-8" });
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
function handleSendToChat() {
  const format = exportConfig.value.format;
  const isCodeFormat = ["markdown", "json", "html", "csv", "text"].includes(format);

  sendToChat(previewContent.value, {
    format: isCodeFormat ? "code" : "plain",
    language: isCodeFormat ? format : undefined,
  });
}

// 导出文件（使用 Tauri 的文件保存对话框）
async function handleExport() {
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
      visible.value = false;
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

// 监听配置变化并通知父组件
watch(
  exportConfig,
  (newConfig) => {
    emit("update:exportConfig", newConfig);
  },
  { deep: true }
);

// 监听对话框打开时更新预览
watch(
  () => visible.value,
  (val) => {
    if (val) {
      // 如果有初始配置，重新应用
      if (props.initialConfig) {
        exportConfig.value = { ...exportConfig.value, ...props.initialConfig };
      }
      updatePreview();
    }
  }
);

// 监听 includeFiles 选项变化，更新预览
watch(
  () => exportConfig.value.includeFiles,
  () => {
    if (!visible.value) return;
    updatePreview();
  }
);

// 监听 loadingFiles 变化，加载完成后自动刷新预览
watch(loadingFiles, (loading) => {
  if (!loading && visible.value && exportConfig.value.includeFiles) {
    updatePreview();
  }
});

// 监听仓库路径和分支变化，清空对应缓存
watch([() => props.repoPath, () => props.branch], ([newPath, newBranch], [oldPath, oldBranch]) => {
  if (newPath !== oldPath || newBranch !== oldBranch) {
    commitCache.clearBatchCache(oldPath, oldBranch);
  }
});
</script>

<style scoped>
.export-module {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
</style>
