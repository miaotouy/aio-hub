<template>
  <el-dialog
    v-model="visible"
    title="导出分析报告"
    width="1000px"
    :close-on-click-modal="false"
    @close="handleClose"
    top="4vh"
    class="export-dialog"
  >
    <div class="export-module">
      <!-- 导出配置 -->
      <el-form label-width="100px">
        <el-form-item label="导出格式">
          <el-radio-group v-model="exportConfig.format">
            <el-radio-button value="markdown">Markdown</el-radio-button>
            <el-radio-button value="json">JSON</el-radio-button>
            <el-radio-button value="csv">CSV</el-radio-button>
            <el-radio-button value="html">HTML</el-radio-button>
            <el-radio-button value="text">纯文本</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="包含内容">
          <el-checkbox-group v-model="exportConfig.includes">
            <el-checkbox value="statistics">统计信息</el-checkbox>
            <el-checkbox value="commits">提交记录</el-checkbox>
            <el-checkbox value="contributors">贡献者列表</el-checkbox>
            <el-checkbox value="timeline">时间线</el-checkbox>
            <el-checkbox value="charts">图表数据</el-checkbox>
          </el-checkbox-group>
        </el-form-item>

        <el-form-item label="提交范围" v-if="exportConfig.includes.includes('commits')">
          <el-radio-group v-model="exportConfig.commitRange">
            <el-radio value="all">全部提交</el-radio>
            <el-radio value="filtered">当前筛选结果</el-radio>
            <el-radio value="custom">自定义数量</el-radio>
          </el-radio-group>
          <el-input-number
            v-if="exportConfig.commitRange === 'custom'"
            v-model="exportConfig.customCount"
            :min="1"
            :max="totalCommits"
            style="margin-left: 10px"
          />
        </el-form-item>

        <el-form-item label="日期格式">
          <el-select v-model="exportConfig.dateFormat">
            <el-option label="ISO 8601" value="iso" />
            <el-option label="本地时间" value="local" />
            <el-option label="相对时间" value="relative" />
            <el-option label="Unix 时间戳" value="timestamp" />
          </el-select>
        </el-form-item>

        <!-- HTML 主题选项 -->
        <el-form-item label="HTML 主题" v-if="exportConfig.format === 'html'">
          <el-radio-group v-model="exportConfig.htmlTheme">
            <el-radio-button value="light">浅色主题</el-radio-button>
            <el-radio-button value="dark">深色主题</el-radio-button>
            <el-radio-button value="auto">跟随系统</el-radio-button>
          </el-radio-group>
          <el-tooltip content="导出的 HTML 文件将使用选择的主题配色" placement="top">
            <el-icon style="margin-left: 10px; color: var(--text-color-light)">
              <QuestionFilled />
            </el-icon>
          </el-tooltip>
        </el-form-item>

        <el-form-item label="隐私选项">
          <el-checkbox v-model="exportConfig.includeAuthor"> 显示作者名称 </el-checkbox>
          <el-tooltip content="导出时包含作者的名称" placement="top">
            <el-icon style="margin-left: 5px; color: var(--text-color-light)">
              <QuestionFilled />
            </el-icon>
          </el-tooltip>
          <el-checkbox v-model="exportConfig.includeEmail" :disabled="!exportConfig.includeAuthor">
            显示作者邮箱
          </el-checkbox>
          <el-tooltip content="导出时包含作者的邮箱地址（需要先启用显示作者名称）" placement="top">
            <el-icon style="margin-left: 5px; color: var(--text-color-light)">
              <QuestionFilled />
            </el-icon>
          </el-tooltip>
        </el-form-item>

        <el-form-item label="其他选项">
          <el-checkbox v-model="exportConfig.includeFullMessage"> 包含完整提交消息 </el-checkbox>
          <el-checkbox v-model="exportConfig.includeFiles"> 包含文件变更列表 </el-checkbox>
          <el-checkbox v-model="exportConfig.includeTags"> 包含标签信息 </el-checkbox>
          <el-checkbox v-model="exportConfig.includeStats"> 包含代码统计 </el-checkbox>
        </el-form-item>
      </el-form>

      <!-- 预览区域 -->
      <div class="preview-section">
        <div class="preview-header">
          <span>内容预览</span>
          <el-tag v-if="loadingFiles" type="warning" size="small" style="margin-left: 10px">
            正在加载文件信息...
          </el-tag>
          <el-button-group>
            <el-button
              size="small"
              @click="updatePreview"
              :icon="RefreshRight"
              :loading="generating"
            >
              刷新预览
            </el-button>
            <el-button size="small" @click="copyToClipboard" :icon="CopyDocument"> 复制 </el-button>
            <el-button size="small" @click="downloadFile" :icon="Download"> 下载 </el-button>
          </el-button-group>
        </div>
        <div class="preview-content" v-loading="generating">
          <el-scrollbar height="400px">
            <pre v-if="exportConfig.format !== 'html'" class="preview-text">{{
              previewContent
            }}</pre>
            <div v-else v-html="previewContent" class="preview-html"></div>
          </el-scrollbar>
        </div>
      </div>
    </div>

    <template #footer>
      <el-space>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="handleExport" :loading="exporting"> 导出文件 </el-button>
      </el-space>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { ElMessage } from "element-plus";
import { CopyDocument, Download, RefreshRight, QuestionFilled } from "@element-plus/icons-vue";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { generateHTML } from "../utils/htmlGenerator";
import type { GitCommit, ExportConfig, RepoStatistics } from "../types";

const props = defineProps<{
  commits: GitCommit[];
  filteredCommits: GitCommit[];
  statistics: RepoStatistics;
  repoPath: string;
  branch: string;
  initialConfig?: Partial<ExportConfig>;
}>();

const emit = defineEmits<{
  close: [];
  "update:exportConfig": [config: ExportConfig];
}>();

const visible = defineModel<boolean>("visible", { required: true });
const generating = ref(false);
const exporting = ref(false);
const previewContent = ref("");
const commitsWithFiles = ref<GitCommit[]>([]);
const loadingFiles = ref(false);

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
  includeStats: true,
  htmlTheme: "light",
});

// 初始化配置
if (props.initialConfig) {
  exportConfig.value = { ...exportConfig.value, ...props.initialConfig };
}

const totalCommits = computed(() => props.commits.length);

// 格式化日期
function formatDate(date: string, format: string): string {
  const d = new Date(date);

  switch (format) {
    case "iso":
      return d.toISOString();
    case "local":
      return d.toLocaleString("zh-CN");
    case "relative":
      return getRelativeTime(d);
    case "timestamp":
      return String(d.getTime());
    default:
      return d.toLocaleString("zh-CN");
  }
}

// 获取相对时间
function getRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  if (days < 365) return `${Math.floor(days / 30)} 月前`;
  return `${Math.floor(days / 365)} 年前`;
}

// 获取要导出的提交记录
function getCommitsToExport(): GitCommit[] {
  // 先根据范围获取基础提交列表
  const base: GitCommit[] = (() => {
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

  // 如果需要文件变更信息，合并文件数据（内部已做开关与可用性判断）
  return getMergedCommits(base);
}

// 加载带文件信息的提交列表
async function loadCommitsWithFiles() {
  if (!exportConfig.value.includeFiles) {
    commitsWithFiles.value = [];
    return;
  }

  loadingFiles.value = true;
  try {
    // 使用新的后端接口一次性加载所有提交的文件信息
    const commits = await invoke<GitCommit[]>("git_load_commits_with_files", {
      path: props.repoPath || ".",
      branch: null,
      limit: props.commits.length,
    });

    commitsWithFiles.value = commits;
    ElMessage.success("已加载文件变更信息");
  } catch (error) {
    console.error("加载文件信息失败:", error);
    ElMessage.error("加载文件信息失败");
    commitsWithFiles.value = [];
  } finally {
    loadingFiles.value = false;
  }
}

// 获取合并后的提交数据（优先使用带文件信息的版本）
function getMergedCommits(commits: GitCommit[]): GitCommit[] {
  if (!exportConfig.value.includeFiles || commitsWithFiles.value.length === 0) {
    return commits;
  }

  // 创建一个 hash -> commit 的映射
  const filesMap = new Map<string, GitCommit>();
  commitsWithFiles.value.forEach((c) => filesMap.set(c.hash, c));

  // 合并数据
  return commits.map((commit) => {
    const withFiles = filesMap.get(commit.hash);
    if (withFiles && withFiles.files) {
      return { ...commit, files: withFiles.files };
    }
    return commit;
  });
}

// 生成时间线数据
function generateTimelineData(commits: GitCommit[]): Array<{ date: string; count: number }> {
  const dateCounts = commits.reduce(
    (acc, c) => {
      const date = c.date.split("T")[0];
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return Object.entries(dateCounts)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// 生成图表数据
function generateChartData(commits: GitCommit[]) {
  // 提交频率数据
  const frequencyData = generateTimelineData(commits);

  // 贡献者分布数据
  const contributorData = getContributorStats(commits);

  // 热力图数据
  const heatmapData: Array<{ day: number; hour: number; count: number }> = [];
  const dayMap = new Map<string, number>();

  commits.forEach((c) => {
    const date = new Date(c.date);
    const day = date.getDay();
    const hour = date.getHours();
    const key = `${day}-${hour}`;
    dayMap.set(key, (dayMap.get(key) || 0) + 1);
  });

  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const count = dayMap.get(`${day}-${hour}`) || 0;
      if (count > 0) {
        heatmapData.push({ day, hour, count });
      }
    }
  }

  return {
    frequency: frequencyData,
    contributors: contributorData,
    heatmap: heatmapData,
  };
}

// 生成 Markdown 格式
function generateMarkdown(): string {
  const lines: string[] = [];
  const config = exportConfig.value;

  lines.push(`# Git 仓库分析报告`);
  lines.push("");
  lines.push(`**仓库路径**: ${props.repoPath || "当前目录"}`);
  lines.push(`**分支**: ${props.branch}`);
  lines.push(`**生成时间**: ${new Date().toLocaleString("zh-CN")}`);
  lines.push("");

  // 统计信息
  if (config.includes.includes("statistics")) {
    lines.push("## 📊 统计信息");
    lines.push("");
    lines.push(`- **总提交数**: ${props.statistics.totalCommits}`);
    lines.push(`- **贡献者数**: ${props.statistics.contributors}`);
    lines.push(`- **时间跨度**: ${props.statistics.timeSpan} 天`);
    lines.push(`- **平均提交/天**: ${props.statistics.averagePerDay.toFixed(2)}`);
    lines.push("");
  }

  // 贡献者列表
  if (config.includes.includes("contributors")) {
    const commitsToExport = getCommitsToExport();
    const contributors = getContributorStats(commitsToExport);
    lines.push("## 👥 贡献者统计");
    lines.push("");
    lines.push("| 贡献者 | 提交数 | 占比 |");
    lines.push("|--------|--------|------|");
    contributors.slice(0, 10).forEach((c) => {
      const percentage =
        commitsToExport.length > 0 ? ((c.count / commitsToExport.length) * 100).toFixed(1) : "0.0";
      lines.push(`| ${c.name} | ${c.count} | ${percentage}% |`);
    });
    lines.push("");
  }

  // 时间线
  if (config.includes.includes("timeline")) {
    const commitsToExport = getCommitsToExport();
    const timelineData = generateTimelineData(commitsToExport);
    lines.push("## 📅 提交时间线");
    lines.push("");
    lines.push("| 日期 | 提交数 |");
    lines.push("|------|--------|");
    timelineData.forEach((item) => {
      lines.push(`| ${item.date} | ${item.count} |`);
    });
    lines.push("");
  }

  // 图表数据
  if (config.includes.includes("charts")) {
    const commitsToExport = getCommitsToExport();
    const chartData = generateChartData(commitsToExport);

    lines.push("## 📈 图表数据");
    lines.push("");

    // 提交频率趋势
    lines.push("### 提交频率");
    lines.push("");
    lines.push("| 日期 | 提交数 |");
    lines.push("|------|--------|");
    chartData.frequency.slice(0, 30).forEach((item) => {
      lines.push(`| ${item.date} | ${item.count} |`);
    });
    lines.push("");

    // 贡献者分布
    lines.push("### 贡献者分布");
    lines.push("");
    lines.push("| 贡献者 | 提交数 |");
    lines.push("|--------|--------|");
    chartData.contributors.slice(0, 10).forEach((item) => {
      lines.push(`| ${item.name} | ${item.count} |`);
    });
    lines.push("");

    // 提交热力图
    lines.push("### 提交热力图（周几×小时）");
    lines.push("");
    const weekDays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    lines.push("| 星期 | 小时 | 提交数 |");
    lines.push("|------|------|--------|");
    chartData.heatmap
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)
      .forEach((item) => {
        lines.push(`| ${weekDays[item.day]} | ${item.hour}:00 | ${item.count} |`);
      });
    lines.push("");
  }

  // 提交记录
  if (config.includes.includes("commits")) {
    const commits = getCommitsToExport();
    lines.push("## 📝 提交记录");
    lines.push("");
    lines.push(`共 ${commits.length} 条记录`);
    lines.push("");

    commits.forEach((commit) => {
      lines.push(
        `### ${commit.hash.substring(0, 7)} - ${formatDate(commit.date, config.dateFormat)}`
      );
      lines.push("");
      if (config.includeAuthor) {
        if (config.includeEmail) {
          lines.push(`**作者**: ${commit.author} <${commit.email}>`);
        } else {
          lines.push(`**作者**: ${commit.author}`);
        }
        lines.push("");
      }
      if (config.includeFullMessage && commit.full_message) {
        lines.push(`**提交信息**:`);
        lines.push("");
        lines.push(commit.full_message);
      } else {
        lines.push(`**提交信息**: ${commit.message}`);
      }

      if (config.includeTags && commit.tags && commit.tags.length > 0) {
        lines.push("");
        lines.push(`**标签**: ${commit.tags.join(", ")}`);
      }

      if (config.includeStats && commit.stats) {
        lines.push("");
        lines.push(
          `**统计**: +${commit.stats.additions} -${commit.stats.deletions} (${commit.stats.files} 文件)`
        );
      }

      if (config.includeFiles && commit.files && commit.files.length > 0) {
        lines.push("");
        lines.push("**文件变更**:");
        commit.files.forEach((file) => {
          lines.push(`  - ${file.path} (+${file.additions} -${file.deletions})`);
        });
      }

      lines.push("");
      lines.push("---");
      lines.push("");
    });
  }

  return lines.join("\n");
}

// 生成 JSON 格式
function generateJSON(): string {
  const data: any = {
    repository: props.repoPath || "当前目录",
    branch: props.branch,
    generatedAt: new Date().toISOString(),
    statistics: props.statistics,
  };

  const config = exportConfig.value;
  const commitsToExport = getCommitsToExport();

  if (config.includes.includes("contributors")) {
    data.contributors = getContributorStats(commitsToExport);
  }

  if (config.includes.includes("timeline")) {
    data.timeline = generateTimelineData(commitsToExport);
  }

  if (config.includes.includes("charts")) {
    data.charts = generateChartData(commitsToExport);
  }

  if (config.includes.includes("commits")) {
    data.commits = commitsToExport.map((commit) => ({
      hash: commit.hash,
      ...(config.includeAuthor ? { author: commit.author } : {}),
      ...(config.includeAuthor && config.includeEmail ? { email: commit.email } : {}),
      date: formatDate(commit.date, config.dateFormat),
      message: commit.message,
      ...(config.includeFullMessage && commit.full_message
        ? { full_message: commit.full_message }
        : {}),
      ...(config.includeTags && commit.tags ? { tags: commit.tags } : {}),
      ...(config.includeStats && commit.stats ? { stats: commit.stats } : {}),
      ...(config.includeFiles && commit.files ? { files: commit.files } : {}),
    }));
  }

  return JSON.stringify(data, null, 2);
}

// 生成 CSV 格式
function generateCSV(): string {
  const lines: string[] = [];
  const config = exportConfig.value;

  if (config.includes.includes("commits")) {
    const commits = getCommitsToExport();

    // 头部
    const headers = ["Hash"];
    if (config.includeAuthor) {
      headers.push("Author");
      if (config.includeEmail) {
        headers.push("Email");
      }
    }
    headers.push("Date", "Message");
    if (config.includeStats) {
      headers.push("Additions", "Deletions", "Files Changed");
    }
    if (config.includeTags) {
      headers.push("Tags");
    }
    lines.push(headers.join(","));

    // 数据行
    commits.forEach((commit) => {
      const row = [commit.hash.substring(0, 7)];

      if (config.includeAuthor) {
        row.push(`"${commit.author}"`);
        if (config.includeEmail) {
          row.push(commit.email);
        }
      }

      row.push(
        formatDate(commit.date, config.dateFormat),
        `"${commit.message.replace(/"/g, '""')}"`
      );

      if (config.includeStats && commit.stats) {
        row.push(String(commit.stats.additions));
        row.push(String(commit.stats.deletions));
        row.push(String(commit.stats.files));
      }

      if (config.includeTags) {
        row.push(commit.tags ? `"${commit.tags.join(", ")}"` : "");
      }

      lines.push(row.join(","));
    });
  }

  return lines.join("\n");
}

// 生成纯文本格式
function generateText(): string {
  const lines: string[] = [];
  const config = exportConfig.value;

  lines.push("=".repeat(60));
  lines.push("Git 仓库分析报告");
  lines.push("=".repeat(60));
  lines.push("");
  lines.push(`仓库路径: ${props.repoPath || "当前目录"}`);
  lines.push(`分支: ${props.branch}`);
  lines.push(`生成时间: ${new Date().toLocaleString("zh-CN")}`);
  lines.push("");

  if (config.includes.includes("statistics")) {
    lines.push("-".repeat(40));
    lines.push("统计信息");
    lines.push("-".repeat(40));
    lines.push(`总提交数: ${props.statistics.totalCommits}`);
    lines.push(`贡献者数: ${props.statistics.contributors}`);
    lines.push(`时间跨度: ${props.statistics.timeSpan} 天`);
    lines.push(`平均提交/天: ${props.statistics.averagePerDay.toFixed(2)}`);
    lines.push("");
  }

  if (config.includes.includes("contributors")) {
    const commitsToExport = getCommitsToExport();
    const contributors = getContributorStats(commitsToExport);
    lines.push("-".repeat(40));
    lines.push("贡献者统计");
    lines.push("-".repeat(40));
    contributors.slice(0, 10).forEach((c) => {
      const percentage =
        commitsToExport.length > 0 ? ((c.count / commitsToExport.length) * 100).toFixed(1) : "0.0";
      lines.push(`${c.name}: ${c.count} 次提交 (${percentage}%)`);
    });
    lines.push("");
  }

  if (config.includes.includes("timeline")) {
    const commitsToExport = getCommitsToExport();
    const timelineData = generateTimelineData(commitsToExport);
    lines.push("-".repeat(40));
    lines.push("提交时间线");
    lines.push("-".repeat(40));
    timelineData.forEach((item) => {
      lines.push(`${item.date}: ${item.count} 次提交`);
    });
    lines.push("");
  }

  if (config.includes.includes("charts")) {
    const commitsToExport = getCommitsToExport();
    const chartData = generateChartData(commitsToExport);

    lines.push("-".repeat(40));
    lines.push("图表数据");
    lines.push("-".repeat(40));

    lines.push("\n提交频率 (最近30天):");
    chartData.frequency.slice(0, 30).forEach((item) => {
      lines.push(`  ${item.date}: ${item.count}`);
    });

    lines.push("\n贡献者分布 (Top 10):");
    chartData.contributors.slice(0, 10).forEach((item) => {
      lines.push(`  ${item.name}: ${item.count}`);
    });

    lines.push("\n提交热力图 (Top 20):");
    const weekDays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    chartData.heatmap
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)
      .forEach((item) => {
        lines.push(`  ${weekDays[item.day]} ${item.hour}:00 - ${item.count} 次`);
      });
    lines.push("");
  }

  if (config.includes.includes("commits")) {
    const commits = getCommitsToExport();
    lines.push("-".repeat(40));
    lines.push(`提交记录 (${commits.length} 条)`);
    lines.push("-".repeat(40));
    lines.push("");

    commits.forEach((commit) => {
      lines.push(`[${commit.hash.substring(0, 7)}] ${formatDate(commit.date, config.dateFormat)}`);
      if (config.includeAuthor) {
        if (config.includeEmail) {
          lines.push(`作者: ${commit.author} <${commit.email}>`);
        } else {
          lines.push(`作者: ${commit.author}`);
        }
      }
      if (config.includeFullMessage && commit.full_message) {
        lines.push(`提交信息:`);
        lines.push(commit.full_message);
      } else {
        lines.push(`提交信息: ${commit.message}`);
      }

      if (config.includeStats && commit.stats) {
        lines.push(
          `变更: +${commit.stats.additions} -${commit.stats.deletions} (${commit.stats.files} 文件)`
        );
      }

      if (config.includeTags && commit.tags && commit.tags.length > 0) {
        lines.push(`标签: ${commit.tags.join(", ")}`);
      }

      if (config.includeFiles && commit.files && commit.files.length > 0) {
        lines.push(`文件变更 (${commit.files.length}):`);
        commit.files.forEach((file) => {
          lines.push(`  - ${file.path} (+${file.additions} -${file.deletions})`);
        });
      }

      lines.push("");
    });
  }

  return lines.join("\n");
}

// HTML 转义函数，防止 XSS
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

// 获取贡献者统计
function getContributorStats(commits: GitCommit[]) {
  const authorCounts = commits.reduce(
    (acc, c) => {
      acc[c.author] = (acc[c.author] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return Object.entries(authorCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

// 更新预览
async function updatePreview() {
  generating.value = true;
  try {
    switch (exportConfig.value.format) {
      case "markdown":
        previewContent.value = generateMarkdown();
        break;
      case "json":
        previewContent.value = generateJSON();
        break;
      case "csv":
        previewContent.value = generateCSV();
        break;
      case "html":
        previewContent.value = generateHTML({
          config: exportConfig.value,
          repoPath: props.repoPath,
          branch: props.branch,
          statistics: props.statistics,
          commits: props.commits,
          getCommitsToExport,
          getContributorStats,
          formatDate,
          escapeHtml,
          generateTimelineData,
          generateChartData,
        });
        break;
      case "text":
        previewContent.value = generateText();
        break;
    }
  } catch (error) {
    console.error("生成预览失败:", error);
    ElMessage.error("生成预览失败");
  } finally {
    generating.value = false;
  }
}

// 复制到剪贴板
async function copyToClipboard() {
  try {
    await navigator.clipboard.writeText(previewContent.value);
    ElMessage.success("已复制到剪贴板");
  } catch (error) {
    console.error("复制失败:", error);
    ElMessage.error("复制失败");
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
  const fileName = `git-analysis-${new Date().getTime()}.${extension}`;

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

  ElMessage.success(`已下载: ${fileName}`);
}

// 导出文件（使用 Tauri 的文件保存对话框）
async function handleExport() {
  exporting.value = true;
  try {
    const formatExtensions: Record<string, string> = {
      markdown: "md",
      json: "json",
      csv: "csv",
      html: "html",
      text: "txt",
    };

    const extension = formatExtensions[exportConfig.value.format];
    const defaultName = `git-analysis-${new Date().getTime()}.${extension}`;

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
      ElMessage.success(`文件已保存: ${filePath}`);
      visible.value = false;
    }
  } catch (error) {
    console.error("导出失败:", error);
    ElMessage.error("导出失败");
  } finally {
    exporting.value = false;
  }
}

// 关闭对话框
function handleClose() {
  emit("close");
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
  async (val) => {
    if (val) {
      // 如果有初始配置，重新应用
      if (props.initialConfig) {
        exportConfig.value = { ...exportConfig.value, ...props.initialConfig };
      }

      // 如果勾选了包含文件变更列表，先加载文件信息
      if (exportConfig.value.includeFiles) {
        await loadCommitsWithFiles();
      }

      updatePreview();
    }
  }
);

// 监听 includeFiles 选项变化
watch(
  () => exportConfig.value.includeFiles,
  async (includeFiles) => {
    if (includeFiles && visible.value && commitsWithFiles.value.length === 0) {
      await loadCommitsWithFiles();
      updatePreview();
    }
  }
);
</script>

<style scoped>
.export-module {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-height: calc(90vh - 120px);
  overflow-y: auto;
}

/* 对话框整体样式优化 */
:deep(.export-dialog) {
  .el-dialog__body {
    padding: 20px;
    max-height: calc(90vh - 120px);
    overflow-y: auto;
  }
}

.preview-section {
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  overflow: hidden;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: var(--card-bg);
  border-bottom: 1px solid var(--border-color-light);
  font-weight: 500;
}

.preview-content {
  background: var(--container-bg);
  height: 400px;
}

.preview-text {
  padding: 16px;
  margin: 0;
  font-family:
    "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
  color: var(--text-color);
}

.preview-html {
  padding: 16px;
}

/* 覆盖 HTML 预览中的样式 */
.preview-html :deep(h1),
.preview-html :deep(h2),
.preview-html :deep(h3) {
  margin-top: 0;
}

.preview-html :deep(table) {
  margin: 10px 0;
}

:deep(.el-checkbox-group) {
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
}

:deep(.el-radio-group) {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

/* 修复 radio-button 样式问题 */
:deep(.el-radio-button) {
  .el-radio-button__inner {
    border: 1px solid var(--el-border-color);
    border-radius: 4px !important;
    margin-right: 8px;
  }

  &:not(:last-child) .el-radio-button__inner {
    border-right: 1px solid var(--el-border-color);
  }

  &.is-active .el-radio-button__inner {
    border-color: var(--el-color-primary);
    background-color: var(--el-color-primary);
    color: var(--el-color-white);
  }

  &:hover .el-radio-button__inner {
    border-color: var(--el-color-primary);
  }
}
</style>
