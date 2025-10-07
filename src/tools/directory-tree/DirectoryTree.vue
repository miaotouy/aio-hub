<template>
  <div class="directory-tree-container">
    <!-- 左侧：配置面板 -->
    <div class="config-panel">
      <InfoCard title="配置选项" class="config-card">
        <div class="config-section">
          <label>目标路径</label>
          <DropZone
            drop-id="directory-tree-path"
            variant="input"
            :directory-only="true"
            :multiple="false"
            :auto-execute="autoGenerateOnDrop"
            hide-content
            @drop="handlePathDrop"
          >
            <div class="path-input-group">
              <el-input
                v-model="targetPath"
                placeholder="输入或选择目录路径（支持拖拽）"
                @keyup.enter="generateTree"
              />
              <el-button @click="selectDirectory" :icon="FolderOpened">选择</el-button>
            </div>
          </DropZone>
        </div>

        <div class="config-section">
          <label>显示选项</label>
          <div class="checkbox-group">
            <el-checkbox v-model="showFiles" label="显示文件" />
            <el-checkbox v-model="showHidden" label="显示隐藏文件" />
            <el-checkbox v-model="includeMetadata" label="输出包含配置和统计" />
            <el-checkbox v-model="autoGenerateOnDrop" label="拖拽后自动生成" />
          </div>
        </div>

        <div class="config-section">
          <label>过滤规则</label>
          <el-select v-model="filterMode" placeholder="选择过滤模式">
            <el-option label="无过滤" value="none" />
            <el-option label="应用 .gitignore" value="gitignore" />
            <el-option label="自定义规则" value="custom" />
          </el-select>

          <el-input
            v-if="filterMode === 'custom'"
            v-model="customPattern"
            type="textarea"
            :rows="5"
            placeholder="每行一个规则，支持通配符&#10;例如: *.log&#10;node_modules/"
            class="custom-pattern-input"
          />
        </div>

        <div class="config-section">
          <label>深度限制</label>
          <el-slider
            v-model="maxDepth"
            :min="1"
            :max="10"
            :marks="{ 1: '1', 5: '5', 10: '10' }"
            show-stops
          />
          <div class="depth-info">当前深度: {{ maxDepth === 10 ? "无限制" : maxDepth }}</div>
        </div>

        <el-button
          type="primary"
          @click="generateTree"
          :loading="isGenerating"
          :disabled="!targetPath"
          class="generate-btn"
        >
          <el-icon><Histogram /></el-icon>
          生成目录树
        </el-button>
        <div style="padding-bottom: 30px"></div>
      </InfoCard>
    </div>

    <!-- 右侧：结果显示 -->
    <div class="result-panel">
      <InfoCard title="目录结构" class="result-card">
        <template #headerExtra>
          <el-button-group v-if="treeResult">
            <el-tooltip v-if="statsInfo" placement="top">
              <template #content>
                <div class="stats-tooltip">
                  <div class="stats-row">
                    <span class="stats-label">总目录:</span>
                    <span class="stats-value">{{ statsInfo.total_dirs }}</span>
                  </div>
                  <div class="stats-row">
                    <span class="stats-label">总文件:</span>
                    <span class="stats-value">{{ statsInfo.total_files }}</span>
                  </div>
                  <div class="stats-row">
                    <span class="stats-label">过滤目录:</span>
                    <span class="stats-value">{{ statsInfo.filtered_dirs }}</span>
                  </div>
                  <div class="stats-row">
                    <span class="stats-label">过滤文件:</span>
                    <span class="stats-value">{{ statsInfo.filtered_files }}</span>
                  </div>
                  <div v-if="statsInfo.filter_count > 0" class="stats-row">
                    <span class="stats-label">过滤规则:</span>
                    <span class="stats-value">{{ statsInfo.filter_count }} 条</span>
                  </div>
                </div>
              </template>
              <el-button :icon="DataAnalysis" text circle />
            </el-tooltip>
            <el-tooltip content="复制到剪贴板" placement="top">
              <el-button :icon="CopyDocument" text circle @click="copyToClipboard" />
            </el-tooltip>
            <el-tooltip content="导出为文件" placement="top">
              <el-button :icon="Download" text circle @click="exportToFile" />
            </el-tooltip>
          </el-button-group>
        </template>

        <div v-if="!treeResult" class="empty-state">
          <el-empty description="选择目录并生成目录树" />
        </div>

        <el-scrollbar v-else class="tree-scrollbar">
          <pre class="tree-content">{{ treeResult }}</pre>
        </el-scrollbar>
      </InfoCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { ElMessage } from "element-plus";
import {
  FolderOpened,
  Histogram,
  CopyDocument,
  Download,
  DataAnalysis,
} from "@element-plus/icons-vue";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { invoke } from "@tauri-apps/api/core";
import { debounce } from "lodash";
import InfoCard from "../../components/common/InfoCard.vue";
import DropZone from "../../components/common/DropZone.vue";
import { loadConfig, saveConfig, type DirectoryTreeConfig } from "./config";

// 配置状态
const targetPath = ref("");
const showFiles = ref(true);
const showHidden = ref(false);
const filterMode = ref<"none" | "gitignore" | "custom">("none");
const customPattern = ref("");
const maxDepth = ref(5);
const autoGenerateOnDrop = ref(true); // 拖拽后自动生成
const includeMetadata = ref(false); // 输出时是否包含配置和统计信息

// 结果状态
const treeResult = ref("");
const statsInfo = ref<{
  total_dirs: number;
  total_files: number;
  filtered_dirs: number;
  filtered_files: number;
  show_files: boolean;
  show_hidden: boolean;
  max_depth: string;
  filter_count: number;
} | null>(null);
const isGenerating = ref(false);
const isLoadingConfig = ref(true);

// 处理路径拖放
const handlePathDrop = (paths: string[]) => {
  if (paths.length > 0) {
    targetPath.value = paths[0];
    ElMessage.success(`已设置目标路径: ${paths[0]}`);
    console.log(`已通过拖拽设置目标路径: ${paths[0]}`);

    // 根据配置决定是否自动生成目录树
    if (autoGenerateOnDrop.value) {
      setTimeout(() => {
        generateTree();
      }, 500);
    }
  }
};

// 加载配置
onMounted(async () => {
  try {
    const config = await loadConfig();
    customPattern.value = config.customPatterns;
    filterMode.value = config.lastFilterMode;
    targetPath.value = config.lastTargetPath;
    showFiles.value = config.showFiles;
    showHidden.value = config.showHidden;
    maxDepth.value = config.maxDepth;
    autoGenerateOnDrop.value = config.autoGenerateOnDrop ?? true; // 兼容旧配置
    includeMetadata.value = config.includeMetadata ?? false; // 兼容旧配置
  } catch (error) {
    console.error("加载配置失败:", error);
  } finally {
    isLoadingConfig.value = false;
  }
});

// 防抖保存配置
const debouncedSaveConfig = debounce(async () => {
  if (isLoadingConfig.value) return; // 初始加载时不保存

  try {
    const config: DirectoryTreeConfig = {
      customPatterns: customPattern.value,
      lastFilterMode: filterMode.value,
      lastTargetPath: targetPath.value,
      showFiles: showFiles.value,
      showHidden: showHidden.value,
      maxDepth: maxDepth.value,
      autoGenerateOnDrop: autoGenerateOnDrop.value,
      includeMetadata: includeMetadata.value,
      version: "1.0.0",
    };
    await saveConfig(config);
  } catch (error) {
    console.error("保存配置失败:", error);
  }
}, 500);

// 监听配置变化并自动保存
watch(
  [
    customPattern,
    filterMode,
    targetPath,
    showFiles,
    showHidden,
    maxDepth,
    autoGenerateOnDrop,
    includeMetadata,
  ],
  () => {
    debouncedSaveConfig();
  }
);

// 选择目录
const selectDirectory = async () => {
  try {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: "选择要分析的目录",
    });
    if (typeof selected === "string") {
      targetPath.value = selected;
    }
  } catch (error) {
    console.error("选择目录失败:", error);
    ElMessage.error("选择目录失败");
  }
};

// 生成目录树
const generateTree = async () => {
  if (!targetPath.value) {
    ElMessage.warning("请先选择目录");
    return;
  }

  isGenerating.value = true;
  try {
    // 准备过滤规则
    let ignorePatterns: string[] = [];

    if (filterMode.value === "gitignore") {
      // 传递特殊标记，让后端递归收集所有 .gitignore 文件
      ignorePatterns = ["__USE_GITIGNORE__"];
    } else if (filterMode.value === "custom") {
      ignorePatterns = customPattern.value
        .split("\n")
        .map((line: string) => line.trim())
        .filter((line: string) => line);
    }

    // 调用 Rust 后端生成目录树
    const result: { tree: string; stats: any } = await invoke("generate_directory_tree", {
      path: targetPath.value,
      showFiles: showFiles.value,
      showHidden: showHidden.value,
      maxDepth: maxDepth.value === 10 ? 0 : maxDepth.value, // 0 表示无限制
      ignorePatterns,
    });

    // 准备输出内容
    let outputContent = result.tree;

    // 如果启用了包含元数据选项，添加配置和统计信息
    if (includeMetadata.value) {
      const metadata = [
        "# 目录树生成信息",
        "",
        "## 统计信息",
        `- 总目录: ${result.stats.total_dirs}`,
        `- 总文件: ${result.stats.total_files}`,
        `- 过滤目录: ${result.stats.filtered_dirs}`,
        `- 过滤文件: ${result.stats.filtered_files}`,
        result.stats.filter_count > 0 ? `- 过滤规则数: ${result.stats.filter_count}` : "",
        "",
        "## 生成配置",
        `- 目标路径: ${targetPath.value}`,
        `- 显示文件: ${showFiles.value ? "是" : "否"}`,
        `- 显示隐藏: ${showHidden.value ? "是" : "否"}`,
        `- 过滤模式: ${filterMode.value === "gitignore" ? "使用 .gitignore" : filterMode.value === "custom" ? "自定义规则" : "无"}`,
        `- 最大深度: ${maxDepth.value === 10 ? "无限制" : maxDepth.value}`,
        filterMode.value === "custom" && customPattern.value.trim()
          ? `- 自定义规则:\n${customPattern.value
              .split("\n")
              .filter((l: string) => l.trim())
              .map((l: string) => `  ${l}`)
              .join("\n")}`
          : "",
        "",
        "## 目录结构",
        "",
      ]
      .join("\n");

      outputContent = metadata + outputContent;
    }

    treeResult.value = outputContent;
    statsInfo.value = result.stats;

    // 在控制台输出统计信息和配置
    console.log("📊 目录树统计信息:", {
      总目录: result.stats.total_dirs,
      总文件: result.stats.total_files,
      过滤目录: result.stats.filtered_dirs,
      过滤文件: result.stats.filtered_files,
      过滤规则数: result.stats.filter_count,
      显示文件: result.stats.show_files,
      显示隐藏: result.stats.show_hidden,
      最大深度: result.stats.max_depth,
    });

    console.log("⚙️ 使用的配置:", {
      目标路径: targetPath.value,
      显示文件: showFiles.value,
      显示隐藏: showHidden.value,
      过滤模式: filterMode.value,
      最大深度: maxDepth.value === 10 ? "无限制" : maxDepth.value,
      过滤规则:
        filterMode.value === "custom"
          ? customPattern.value.split("\n").filter((l: string) => l.trim()).length + " 条"
          : filterMode.value === "gitignore"
            ? "使用 .gitignore"
            : "无",
    });

    ElMessage.success("目录树生成成功");
  } catch (error: any) {
    console.error("生成目录树失败:", error);
    ElMessage.error(`生成失败: ${error}`);
    treeResult.value = `错误: ${error}`;
  } finally {
    isGenerating.value = false;
  }
};

// 复制到剪贴板
const copyToClipboard = async () => {
  try {
    await writeText(treeResult.value);
    ElMessage.success("已复制到剪贴板");
  } catch (error) {
    console.error("复制失败:", error);
    ElMessage.error("复制到剪贴板失败");
  }
};

// 导出为文件
const exportToFile = async () => {
  try {
    // 从路径中提取目录名称
    const getDirName = (path: string) => {
      const normalized = path.replace(/\\/g, "/");
      const parts = normalized.split("/");
      return parts[parts.length - 1] || parts[parts.length - 2] || "目录";
    };

    // 生成带日期时间的文件名
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");

    const dirName = getDirName(targetPath.value);
    const dateTime = `${year}${month}${day}_${hours}${minutes}`;
    const defaultFileName = `${dirName}_目录树_${dateTime}.txt`;

    const savePath = await saveDialog({
      defaultPath: defaultFileName,
      filters: [
        { name: "Text Files", extensions: ["txt"] },
        { name: "Markdown Files", extensions: ["md"] },
      ],
      title: "保存目录树",
    });

    if (savePath) {
      await writeTextFile(savePath, treeResult.value);
      ElMessage.success("文件保存成功");
    }
  } catch (error) {
    console.error("保存文件失败:", error);
    ElMessage.error("保存文件失败");
  }
};
</script>

<style scoped>
.directory-tree-container {
  display: flex;
  gap: 20px;
  width: 100%;
  height: 100%;
  padding: 20px;
  box-sizing: border-box;
  --primary-color-rgb: 64, 158, 255; /* 默认蓝色的 RGB 值 */
}

.config-panel {
  flex: 0 0 350px;
  min-width: 350px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.config-card {
  flex-shrink: 0;
  overflow-y: auto;
}

.result-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.result-card {
  flex: 1;
  min-height: 0;
}

:deep(.el-card__body) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.config-section {
  margin-bottom: 12px;
}

.config-section label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

.path-input-group {
  display: flex;
  gap: 6px;
}

.checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.custom-pattern-input {
  margin-top: 10px;
}

.depth-info {
  text-align: center;
  margin-top: 16px;
  font-size: 13px;
  color: var(--text-color-light);
}

.generate-btn {
  width: 100%;
  margin-top: 10px;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tree-scrollbar {
  flex: 1;
  min-height: 0;
}

.tree-content {
  margin: 0;
  padding: 16px;
  font-family: "Consolas", "Monaco", "Courier New", monospace;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-color);
  background-color: var(--container-bg);
  border-radius: 4px;
  white-space: pre;
  overflow-x: auto;
}

.stats-tooltip {
  padding: 4px 0;
}

.stats-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 4px 0;
  font-size: 13px;
}

.stats-label {
  font-weight: 500;
}

.stats-value {
  font-weight: 600;
  font-family: "Consolas", "Monaco", monospace;
}
</style>
