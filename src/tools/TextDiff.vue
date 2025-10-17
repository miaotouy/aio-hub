<template>
  <div class="text-diff-container">
    <!-- 工具栏 -->
    <el-card shadow="never" class="toolbar-card">
      <div class="toolbar">
        <!-- 语言选择 -->
        <div class="toolbar-group">
          <el-select v-model="language" placeholder="选择语言" size="small" style="width: 150px">
            <el-option label="纯文本" value="plaintext" />
            <el-option label="JavaScript" value="javascript" />
            <el-option label="TypeScript" value="typescript" />
            <el-option label="JSON" value="json" />
            <el-option label="HTML" value="html" />
            <el-option label="CSS" value="css" />
            <el-option label="Python" value="python" />
            <el-option label="Java" value="java" />
            <el-option label="C++" value="cpp" />
            <el-option label="Markdown" value="markdown" />
          </el-select>
        </div>

        <!-- 布局切换 -->
        <div class="toolbar-group">
          <el-radio-group v-model="renderSideBySide" size="small">
            <el-radio-button :value="true">并排</el-radio-button>
            <el-radio-button :value="false">内联</el-radio-button>
          </el-radio-group>
        </div>

        <!-- 比对选项 -->
        <div class="toolbar-group">
          <el-checkbox v-model="ignoreWhitespace" size="small">忽略行尾空白</el-checkbox>
          <el-checkbox v-model="renderOverviewRuler" size="small">只看变更</el-checkbox>
          <el-checkbox v-model="wordWrap" size="small">自动换行</el-checkbox>
          <div class="checkbox-with-tip">
            <el-checkbox v-model="ignoreCaseInDiffComputing" size="small"> 忽略大小写 </el-checkbox>
            <el-tooltip content="实验性功能：仅影响导航计数，不改变可视差异" placement="top">
              <el-icon class="experimental-icon" :size="16" color="var(--el-color-info)">
                <QuestionFilled />
              </el-icon>
            </el-tooltip>
          </div>
        </div>

        <!-- 差异导航 -->
        <div class="toolbar-group">
          <el-button-group size="small">
            <el-button :disabled="!canNavigate" @click="goToPreviousDiff">
              <el-icon><ArrowUp /></el-icon>
              上一处
            </el-button>
            <el-button :disabled="!canNavigate" @click="goToNextDiff">
              下一处
              <el-icon><ArrowDown /></el-icon>
            </el-button>
          </el-button-group>
          <span v-if="totalDiffs > 0" class="diff-counter">
            {{ currentDiffIndex + 1 }} / {{ totalDiffs }}
          </span>
          <span v-else class="diff-counter">无差异</span>
        </div>

        <!-- 文件操作 -->
        <div class="toolbar-group">
          <el-dropdown size="small">
            <el-button size="small">
              <el-icon><FolderOpened /></el-icon>
              文件
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="openFile('left')">
                  <el-icon><Document /></el-icon>
                  打开左侧
                </el-dropdown-item>
                <el-dropdown-item @click="openFile('right')">
                  <el-icon><Document /></el-icon>
                  打开右侧
                </el-dropdown-item>
                <el-dropdown-item divided @click="saveFile('left')">保存左侧</el-dropdown-item>
                <el-dropdown-item @click="saveFile('right')">保存右侧</el-dropdown-item>
                <el-dropdown-item @click="saveFile('both')">保存两侧</el-dropdown-item>
                <el-dropdown-item divided @click="exportPatch">
                  <el-icon><Download /></el-icon>
                  导出 .patch
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>

        <!-- 剪贴板操作 -->
        <div class="toolbar-group">
          <el-dropdown size="small">
            <el-button size="small">
              <el-icon><DocumentCopy /></el-icon>
              剪贴板
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="copyToClipboard('left')">复制左侧</el-dropdown-item>
                <el-dropdown-item @click="copyToClipboard('right')">复制右侧</el-dropdown-item>
                <el-dropdown-item @click="copyToClipboard('patch')">复制补丁</el-dropdown-item>
                <el-dropdown-item divided @click="pasteFromClipboard('left')"
                  >粘贴到左侧</el-dropdown-item
                >
                <el-dropdown-item @click="pasteFromClipboard('right')">粘贴到右侧</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>

        <!-- 操作按钮 -->
        <div class="toolbar-group">
          <el-button size="small" @click="clearAll">清空</el-button>
          <el-button size="small" @click="swapTexts">交换</el-button>
        </div>
      </div>
    </el-card>

    <!-- 文件名显示 -->
    <div v-if="leftFileName || rightFileName" class="file-names">
      <div class="file-name-item">
        <span v-if="leftFileName" class="file-name">
          <el-icon><Document /></el-icon>
          {{ leftFileName }}
        </span>
        <span v-else class="file-name-placeholder">左侧：未命名</span>
      </div>
      <div class="file-name-item">
        <span v-if="rightFileName" class="file-name">
          <el-icon><Document /></el-icon>
          {{ rightFileName }}
        </span>
        <span v-else class="file-name-placeholder">右侧：未命名</span>
      </div>
    </div>

    <!-- Diff 编辑器 - 一体化输入和对比 -->
    <el-card shadow="never" class="diff-editor-card">
      <div class="editor-container">
        <!-- 左侧拖放区域 -->
        <div
          ref="leftDropZone"
          class="drop-zone left-drop-zone"
          :class="{ 'drop-zone--active': isLeftDragging }"
        >
          <div class="drop-hint">
            <el-icon><FolderOpened /></el-icon>
            <span>拖放文件到左侧</span>
          </div>
        </div>

        <!-- 右侧拖放区域 -->
        <div
          ref="rightDropZone"
          class="drop-zone right-drop-zone"
          :class="{ 'drop-zone--active': isRightDragging }"
        >
          <div class="drop-hint">
            <el-icon><FolderOpened /></el-icon>
            <span>拖放文件到右侧</span>
          </div>
        </div>

        <!-- Monaco 编辑器 -->
        <vue-monaco-diff-editor
          v-model:original="textA"
          v-model:modified="textB"
          :language="language"
          :options="editorOptions"
          :theme="monacoTheme"
          class="diff-editor"
          @editor-mounted="handleEditorMounted"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, shallowRef } from "vue";
import { VueMonacoDiffEditor } from "@guolao/vue-monaco-editor";
import {
  ArrowUp,
  ArrowDown,
  QuestionFilled,
  FolderOpened,
  DocumentCopy,
  Download,
  Document,
} from "@element-plus/icons-vue";
import { createModuleLogger } from "@utils/logger";
import type { editor } from "monaco-editor";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { customMessage } from '@/utils/customMessage';
import { createTwoFilesPatch } from "diff";
import { useFileDrop } from "@composables/useFileDrop";
import { useTheme } from "@composables/useTheme";

const logger = createModuleLogger("TextDiff");

// 主题
const { isDark } = useTheme();

// 文本内容
const textA = ref("");
const textB = ref("");
const language = ref<string>("plaintext");

// 文件路径与名称状态
const leftFilePath = ref<string>("");
const leftFileName = ref<string>("");
const rightFilePath = ref<string>("");
const rightFileName = ref<string>("");

// 拖放区域引用
const leftDropZone = ref<HTMLElement>();
const rightDropZone = ref<HTMLElement>();

// 布局与比对选项
const renderSideBySide = ref(true); // 并排/内联
const ignoreWhitespace = ref(true); // 忽略行尾空白
const renderOverviewRuler = ref(false); // 只看变更
const wordWrap = ref(false); // 自动换行
const ignoreCaseInDiffComputing = ref(false); // 忽略大小写（实验）

// 差异导航状态
const currentDiffIndex = ref(0);
const totalDiffs = ref(0);
const diffEditor = shallowRef<editor.IStandaloneDiffEditor | null>(null);
const diffNavigator = shallowRef<any>(null);

// Monaco 主题（根据亮暗主题动态切换）
const monacoTheme = computed(() => isDark.value ? "vs-dark" : "vs");

// 编辑器配置（计算属性）
const editorOptions = computed(() => ({
  readOnly: false,
  renderSideBySide: renderSideBySide.value,
  automaticLayout: true,
  fontSize: 14,
  lineNumbers: "on" as const,
  minimap: { enabled: true },
  scrollBeyondLastLine: false,
  wordWrap: (wordWrap.value ? "on" : "off") as "on" | "off",
  folding: true,
  renderWhitespace: "selection" as const,
  diffWordWrap: (wordWrap.value ? "on" : "off") as "on" | "off",
  // 忽略空白差异
  ignoreTrimWhitespace: ignoreWhitespace.value,
  // 只看变更相关选项
  renderOverviewRuler: !renderOverviewRuler.value,
  renderIndicators: !renderOverviewRuler.value,
  // 差异算法优化
  diffAlgorithm: "advanced" as const,
}));

// 是否可以导航
const canNavigate = computed(() => totalDiffs.value > 0);

// 编辑器挂载处理
const handleEditorMounted = (editorInstance: any) => {
  diffEditor.value = editorInstance.getDiffEditor();

  // 创建差异导航器
  if (diffEditor.value && (window as any).monaco) {
    const monaco = (window as any).monaco;
    diffNavigator.value = monaco.editor.createDiffNavigator(diffEditor.value, {
      followsCaret: true,
      ignoreCharChanges: true,
    });
  }

  // 初始化差异计数
  updateDiffCount();

  logger.info("差异编辑器已挂载");
};

// 更新差异计数
const updateDiffCount = () => {
  if (!diffEditor.value) {
    totalDiffs.value = 0;
    currentDiffIndex.value = 0;
    return;
  }

  try {
    const lineChanges = diffEditor.value.getLineChanges() || [];
    totalDiffs.value = lineChanges.length;
    currentDiffIndex.value = 0;

    logger.debug(`差异计数更新: ${totalDiffs.value} 处`);
  } catch (error) {
    logger.error("更新差异计数失败", error);
    totalDiffs.value = 0;
  }
};

// 上一处差异
const goToPreviousDiff = () => {
  if (!diffNavigator.value || !canNavigate.value) return;

  try {
    diffNavigator.value.previous();
    if (currentDiffIndex.value > 0) {
      currentDiffIndex.value--;
    } else {
      currentDiffIndex.value = totalDiffs.value - 1;
    }
    logger.debug(`导航到上一处差异: ${currentDiffIndex.value + 1}/${totalDiffs.value}`);
  } catch (error) {
    logger.error("导航到上一处差异失败", error);
  }
};

// 下一处差异
const goToNextDiff = () => {
  if (!diffNavigator.value || !canNavigate.value) return;

  try {
    diffNavigator.value.next();
    if (currentDiffIndex.value < totalDiffs.value - 1) {
      currentDiffIndex.value++;
    } else {
      currentDiffIndex.value = 0;
    }
    logger.debug(`导航到下一处差异: ${currentDiffIndex.value + 1}/${totalDiffs.value}`);
  } catch (error) {
    logger.error("导航到下一处差异失败", error);
  }
};

// 清空所有文本
const clearAll = () => {
  textA.value = "";
  textB.value = "";
  logger.info("已清空所有文本");
};

// 交换左右文本
const swapTexts = () => {
  const temp = textA.value;
  textA.value = textB.value;
  textB.value = temp;
  logger.info("已交换左右文本");
};

// 监听文本变化，更新差异计数
watch(
  [textA, textB],
  () => {
    nextTick(() => {
      updateDiffCount();
    });
  },
  { flush: "post" }
);

// 监听比对选项变化，重新计算差异
watch([ignoreWhitespace, ignoreCaseInDiffComputing], () => {
  nextTick(() => {
    updateDiffCount();
  });
});

// ====== 文件操作功能 ======

// 从文件扩展名推断语言
const inferLanguage = (filePath: string): string => {
  const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();
  const langMap: Record<string, string> = {
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".json": "json",
    ".html": "html",
    ".htm": "html",
    ".css": "css",
    ".scss": "css",
    ".less": "css",
    ".py": "python",
    ".java": "java",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".cxx": "cpp",
    ".c": "cpp",
    ".h": "cpp",
    ".hpp": "cpp",
    ".md": "markdown",
    ".txt": "plaintext",
  };
  return langMap[ext] || "plaintext";
};

// 打开文件
const openFile = async (side: "left" | "right") => {
  try {
    const filePath = await open({
      multiple: false,
      title: `打开文件到${side === "left" ? "左侧" : "右侧"}`,
    });

    if (!filePath) return;

    const content = await readTextFile(filePath as string);

    // 检查大文件
    if (content.length > 10 * 1024 * 1024) {
      await customMessage.warning("文件较大（>10MB），可能影响性能");
    }

    // 检测二进制文件
    if (content.includes("\0")) {
      customMessage.error("不支持二进制文件");
      return;
    }

    const fileName = (filePath as string).split(/[/\\]/).pop() || "";

    if (side === "left") {
      textA.value = content;
      leftFilePath.value = filePath as string;
      leftFileName.value = fileName;
    } else {
      textB.value = content;
      rightFilePath.value = filePath as string;
      rightFileName.value = fileName;
    }

    // 自动推断语言
    language.value = inferLanguage(filePath as string);

    customMessage.success(`已加载: ${fileName}`);
    logger.info(`文件已加载到${side}侧`, { path: filePath, size: content.length });
  } catch (error: any) {
    logger.error("打开文件失败", error);
    customMessage.error(`打开文件失败: ${error}`);
  }
};

// 保存文件
const saveFile = async (side: "left" | "right" | "both") => {
  try {
    if (side === "both") {
      await saveFile("left");
      await saveFile("right");
      return;
    }

    const content = side === "left" ? textA.value : textB.value;
    const currentName = side === "left" ? leftFileName.value : rightFileName.value;

    if (!content) {
      customMessage.warning(`${side === "left" ? "左侧" : "右侧"}内容为空`);
      return;
    }

    const filePath = await save({
      defaultPath: currentName || "untitled.txt",
      title: `保存${side === "left" ? "左侧" : "右侧"}文件`,
    });

    if (!filePath) return;

    await writeTextFile(filePath, content);

    const fileName = filePath.split(/[/\\]/).pop() || "";
    if (side === "left") {
      leftFilePath.value = filePath;
      leftFileName.value = fileName;
    } else {
      rightFilePath.value = filePath;
      rightFileName.value = fileName;
    }

    customMessage.success(`已保存: ${fileName}`);
    logger.info(`文件已保存`, { path: filePath, size: content.length });
  } catch (error: any) {
    logger.error("保存文件失败", error);
    customMessage.error(`保存失败: ${error}`);
  }
};

// 处理文件拖放
const handleFileDrop = async (paths: string[], side: "left" | "right") => {
  try {
    if (paths.length === 0) return;

    // 如果拖入两个文件，分配到左右
    if (paths.length === 2) {
      const [path1, path2] = paths.sort();
      await loadFileToSide(path1, "left");
      await loadFileToSide(path2, "right");
      return;
    }

    // 单文件：优先填充空侧，否则填充目标侧
    if (paths.length === 1) {
      if (!textA.value && side === "left") {
        await loadFileToSide(paths[0], "left");
      } else if (!textB.value && side === "right") {
        await loadFileToSide(paths[0], "right");
      } else if (!textA.value) {
        await loadFileToSide(paths[0], "left");
      } else if (!textB.value) {
        await loadFileToSide(paths[0], "right");
      } else {
        await loadFileToSide(paths[0], side);
      }
    }
  } catch (error: any) {
    logger.error("处理拖放文件失败", error);
    customMessage.error(`处理失败: ${error}`);
  }
};

// 加载文件到指定侧
const loadFileToSide = async (filePath: string, side: "left" | "right") => {
  try {
    const content = await readTextFile(filePath);

    if (content.length > 10 * 1024 * 1024) {
      await customMessage.warning("文件较大（>10MB），可能影响性能");
    }

    if (content.includes("\0")) {
      customMessage.error("不支持二进制文件");
      return;
    }

    const fileName = filePath.split(/[/\\]/).pop() || "";

    if (side === "left") {
      textA.value = content;
      leftFilePath.value = filePath;
      leftFileName.value = fileName;
    } else {
      textB.value = content;
      rightFilePath.value = filePath;
      rightFileName.value = fileName;
    }

    language.value = inferLanguage(filePath);

    logger.info(`文件已加载到${side}侧`, { path: filePath });
  } catch (error: any) {
    logger.error("加载文件失败", error);
    throw error;
  }
};

// ====== 剪贴板操作 ======

// 复制到剪贴板
const copyToClipboard = async (type: "left" | "right" | "patch") => {
  try {
    let content = "";

    if (type === "left") {
      content = textA.value;
      if (!content) {
        customMessage.warning("左侧内容为空");
        return;
      }
    } else if (type === "right") {
      content = textB.value;
      if (!content) {
        customMessage.warning("右侧内容为空");
        return;
      }
    } else if (type === "patch") {
      content = generateUnifiedPatch();
      if (!content) {
        customMessage.warning("无法生成补丁：两侧内容相同或为空");
        return;
      }
    }

    await writeText(content);

    const label = type === "left" ? "左侧内容" : type === "right" ? "右侧内容" : "补丁";
    customMessage.success(`已复制${label}到剪贴板`);
    logger.info(`已复制${label}到剪贴板`, { length: content.length });
  } catch (error: any) {
    logger.error("复制到剪贴板失败", error);
    customMessage.error(`复制失败: ${error}`);
  }
};

// 从剪贴板粘贴
const pasteFromClipboard = async (side: "left" | "right") => {
  try {
    const content = await readText();

    if (!content) {
      customMessage.warning("剪贴板为空");
      return;
    }

    if (side === "left") {
      textA.value = content;
      leftFilePath.value = "";
      leftFileName.value = "";
    } else {
      textB.value = content;
      rightFilePath.value = "";
      rightFileName.value = "";
    }

    customMessage.success(`已粘贴到${side === "left" ? "左侧" : "右侧"}`);
    logger.info(`已从剪贴板粘贴到${side}侧`, { length: content.length });
  } catch (error: any) {
    logger.error("从剪贴板粘贴失败", error);
    customMessage.error(`粘贴失败: ${error}`);
  }
};

// ====== 补丁生成与导出 ======

// 生成统一 diff 补丁
const generateUnifiedPatch = (): string => {
  const oldText = textA.value;
  const newText = textB.value;

  if (!oldText && !newText) return "";

  // 处理行尾空白（如果需要忽略）
  let processedOld = oldText;
  let processedNew = newText;

  if (ignoreWhitespace.value) {
    processedOld = oldText
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n");
    processedNew = newText
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n");
  }

  const oldFileName = leftFileName.value || "original";
  const newFileName = rightFileName.value || "modified";

  const patch = createTwoFilesPatch(oldFileName, newFileName, processedOld, processedNew, "", "", {
    context: 3,
  });

  return patch;
};

// 导出补丁文件
const exportPatch = async () => {
  try {
    const patch = generateUnifiedPatch();

    if (!patch) {
      customMessage.warning("无法生成补丁：两侧内容相同或为空");
      return;
    }

    // 生成默认文件名
    let defaultName = "diff.patch";
    if (leftFileName.value && rightFileName.value) {
      const leftBase = leftFileName.value.replace(/\.[^.]+$/, "");
      const rightBase = rightFileName.value.replace(/\.[^.]+$/, "");
      defaultName = `${leftBase}_vs_${rightBase}.patch`;
    }

    const filePath = await save({
      defaultPath: defaultName,
      title: "导出补丁文件",
      filters: [
        {
          name: "Patch 文件",
          extensions: ["patch", "diff"],
        },
      ],
    });

    if (!filePath) return;

    await writeTextFile(filePath, patch);

    const fileName = filePath.split(/[/\\]/).pop() || "";
    customMessage.success(`补丁已导出: ${fileName}`);
    logger.info("补丁已导出", { path: filePath, size: patch.length });
  } catch (error: any) {
    logger.error("导出补丁失败", error);
    customMessage.error(`导出失败: ${error}`);
  }
};

// 设置文件拖放
const { isDraggingOver: isLeftDragging } = useFileDrop({
  element: leftDropZone,
  fileOnly: true,
  multiple: true,
  onDrop: (paths) => handleFileDrop(paths, "left"),
});

const { isDraggingOver: isRightDragging } = useFileDrop({
  element: rightDropZone,
  fileOnly: true,
  multiple: true,
  onDrop: (paths) => handleFileDrop(paths, "right"),
});
</script>

<style scoped>
.text-diff-container {
  display: flex;
  flex-direction: column;
  padding: 20px;
  height: 100%;
  box-sizing: border-box;
  gap: 20px;
  overflow: hidden;
}

.toolbar-card {
  flex-shrink: 0;
}

.toolbar {
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.checkbox-with-tip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.experimental-icon {
  cursor: help;
  vertical-align: middle;
}

.diff-counter {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  margin-left: 8px;
}

.diff-editor-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.diff-editor-card :deep(.el-card__body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
}

.file-names {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 2px;
}

.file-name-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  font-size: 13px;
}

.file-name {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--el-text-color-primary);
  font-weight: 500;
}

.file-name-placeholder {
  color: var(--el-text-color-placeholder);
  font-style: italic;
}

.editor-container {
  position: relative;
  display: flex;
  height: 100%;
}

.drop-zone {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 50%;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
}

.left-drop-zone {
  left: 0;
}

.right-drop-zone {
  right: 0;
}

.drop-zone--active {
  opacity: 1;
  pointer-events: auto;
  background: rgba(64, 158, 255, 0.1);
  border: 2px dashed var(--el-color-primary);
}

.drop-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px;
  background: rgba(0, 0, 0, 0.8);
  border-radius: 8px;
  color: var(--el-color-primary);
  font-size: 14px;
  font-weight: 500;
}

.drop-hint .el-icon {
  font-size: 32px;
}

.diff-editor {
  flex: 1;
  min-height: 400px;
  height: 100%;
}
</style>
