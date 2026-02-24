import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { formatDateTime } from "@/utils/time";
import {
  loadConfig as loadConfigFromStore,
  saveConfig as saveConfigToStore,
  type DirectoryTreeConfig,
  type TreeNode,
} from "./config";

export type { TreeNode };

const logger = createModuleLogger("tools/directory-tree");
const errorHandler = createModuleErrorHandler("tools/directory-tree");

/**
 * 生成目录树的参数
 */
export interface GenerateTreeOptions {
  /** 目标路径 */
  path: string;
  /** 是否显示文件 */
  showFiles: boolean;
  /** 是否显示隐藏文件 */
  showHidden: boolean;
  /** 最大深度（0 表示无限制） */
  maxDepth: number;
  /** 过滤模式 */
  filterMode: "none" | "gitignore" | "custom" | "both";
  /** 自定义过滤规则（当 filterMode 为 'custom' 时使用） */
  customPattern?: string;
  /** 是否在输出中包含元数据 */
  includeMetadata?: boolean;
  /** 是否显示文件大小 */
  showSize?: boolean;
  /** 是否显示目录大小 */
  showDirSize?: boolean;
}

/**
 * 目录树生成结果
 */
export interface TreeGenerationResult {
  /** 结构化目录树数据 */
  structure: TreeNode;
  /** 统计信息 */
  stats: {
    total_dirs: number;
    total_files: number;
    show_files: boolean;
    show_hidden: boolean;
    max_depth: string;
    filter_count: number;
    generated_at: string;
  };
}

/**
 * 构建元数据头部
 */
export function buildMetadataHeader(options: GenerateTreeOptions, stats: TreeGenerationResult["stats"]): string {
  return [
    "# 目录树生成信息",
    `- 生成时间: ${stats.generated_at}`,
    "",
    "## 统计信息",
    `- 总目录: ${stats.total_dirs}`,
    `- 总文件: ${stats.total_files}`,
    stats.filter_count > 0 ? `- 过滤规则数: ${stats.filter_count}` : "",
    "",
    "## 生成配置",
    `- 目标路径: ${options.path}`,
    `- 显示文件: ${options.showFiles ? "是" : "否"}`,
    `- 显示隐藏: ${options.showHidden ? "是" : "否"}`,
    options.showSize !== undefined ? `- 显示文件大小: ${options.showSize ? "是" : "否"}` : "",
    options.showDirSize !== undefined ? `- 显示目录大小: ${options.showDirSize ? "是" : "否"}` : "",
    `- 过滤模式: ${
      options.filterMode === "gitignore"
        ? "使用 .gitignore"
        : options.filterMode === "custom"
          ? "自定义规则"
          : options.filterMode === "both"
            ? "同时使用 .gitignore 和自定义规则"
            : "无"
    }`,
    `- 最大深度: ${options.maxDepth === 10 ? "无限制" : options.maxDepth}`,
    (options.filterMode === "custom" || options.filterMode === "both") && options.customPattern?.trim()
      ? `- 自定义规则:\n${options.customPattern
          .split("\n")
          .filter((l: string) => l.trim())
          .map((l: string) => `  ${l}`)
          .join("\n")}`
      : "",
    "",
    "## 目录结构",
    "",
  ].join("\n");
}

/**
 * 树渲染选项
 */
export interface RenderTreeOptions {
  /** 最大显示深度 */
  maxDepth?: number;
  /** 排除包含此关键词的节点 */
  excludePattern?: string;
  /** 是否显示文件 */
  showFiles?: boolean;
  /** 是否显示文件大小 */
  showSize?: boolean;
  /** 是否显示目录大小 */
  showDirSize?: boolean;
  /** 是否显示目录子项数量 */
  showDirItemCount?: boolean;
}

/** 格式化文件大小 */
export function formatSize(size: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let s = size;
  let unitIndex = 0;
  while (s >= 1024 && unitIndex < units.length - 1) {
    s /= 1024;
    unitIndex++;
  }
  return unitIndex === 0 ? `${s} ${units[unitIndex]}` : `${s.toFixed(2)} ${units[unitIndex]}`;
}

/** 递归计算树的实际最大深度 */
export function calculateMaxDepth(node: TreeNode, currentDepth = 0): number {
  let max = currentDepth;
  for (const child of node.children) {
    const childDepth = calculateMaxDepth(child, currentDepth + 1);
    if (childDepth > max) max = childDepth;
  }
  return max;
}

/** 获取目录子项数量描述字符串 */
export function getDirItemCountStr(node: TreeNode): string {
  if (!node.is_dir || node.children.length === 0) return "";
  const fileCount = node.children.filter((c) => !c.is_dir).length;
  const dirCount = node.children.filter((c) => c.is_dir).length;
  const parts: string[] = [];
  if (fileCount > 0) parts.push(`${fileCount} file${fileCount > 1 ? "s" : ""}`);
  if (dirCount > 0) parts.push(`${dirCount} dir${dirCount > 1 ? "s" : ""}`);
  return parts.length > 0 ? ` [${parts.join(", ")}]` : "";
}

/** 递归渲染树节点为文本行 */
export function renderTreeRecursive(
  node: TreeNode,
  prefix: string,
  isLast: boolean,
  isRoot: boolean,
  options: Required<RenderTreeOptions> & { excludePattern: string },
  currentDepth: number,
  output: string[]
): void {
  if (!node.is_dir && !options.showFiles) return;
  if (options.excludePattern && node.name.includes(options.excludePattern)) return;

  if (isRoot) {
    const sizeStr = options.showDirSize && node.size > 0 ? ` (${formatSize(node.size)})` : "";
    const itemCountStr = options.showDirItemCount ? getDirItemCountStr(node) : "";
    output.push(`${node.name}${sizeStr}${itemCountStr}`);
  } else {
    if (currentDepth > options.maxDepth) return;
    const connector = isLast ? "└── " : "├── ";
    let sizeStr = "";
    if (node.size > 0) {
      if (node.is_dir && options.showDirSize) sizeStr = ` (${formatSize(node.size)})`;
      else if (!node.is_dir && options.showSize) sizeStr = ` (${formatSize(node.size)})`;
    }
    const itemCountStr = node.is_dir && options.showDirItemCount ? getDirItemCountStr(node) : "";
    const errorStr = node.error ? ` ${node.error}` : "";
    const slash = node.is_dir ? "/" : "";
    output.push(`${prefix}${connector}${node.name}${slash}${sizeStr}${itemCountStr}${errorStr}`);
  }

  if (node.is_dir && node.children.length > 0) {
    if (!isRoot && currentDepth >= options.maxDepth) return;
    const newPrefix = isRoot ? "" : prefix + (isLast ? "    " : "│   ");
    const filteredChildren = options.showFiles ? node.children : node.children.filter((child) => child.is_dir);
    for (let i = 0; i < filteredChildren.length; i++) {
      renderTreeRecursive(
        filteredChildren[i],
        newPrefix,
        i === filteredChildren.length - 1,
        false,
        options,
        currentDepth + 1,
        output
      );
    }
  }
}

/**
 * 将树结构渲染为文本字符串
 */
export function renderTree(
  structure: TreeNode,
  renderOptions?: RenderTreeOptions,
  generationOptions?: GenerateTreeOptions,
  stats?: TreeGenerationResult["stats"]
): string {
  const opts: Required<RenderTreeOptions> & { excludePattern: string } = {
    maxDepth: renderOptions?.maxDepth ?? calculateMaxDepth(structure),
    excludePattern: renderOptions?.excludePattern ?? "",
    showFiles: renderOptions?.showFiles ?? true,
    showSize: renderOptions?.showSize ?? false,
    showDirSize: renderOptions?.showDirSize ?? false,
    showDirItemCount: renderOptions?.showDirItemCount ?? false,
  };

  const result: string[] = [];
  if (generationOptions && stats) {
    result.push(buildMetadataHeader(generationOptions, stats));
  }
  renderTreeRecursive(structure, "", true, true, opts, 0, result);
  return result.join("\n");
}

/**
 * 生成目录树
 */
export async function generateTree(options: GenerateTreeOptions): Promise<TreeGenerationResult> {
  logger.info("开始生成目录树", { path: options.path });

  try {
    // 准备过滤规则
    let ignorePatterns: string[] = [];

    if (options.filterMode === "gitignore") {
      ignorePatterns = ["__USE_GITIGNORE__"];
    } else if (options.filterMode === "custom" && options.customPattern) {
      ignorePatterns = options.customPattern
        .split("\n")
        .map((line: string) => line.trim())
        .filter((line: string) => line && !line.startsWith("#"));
    } else if (options.filterMode === "both") {
      ignorePatterns = ["__USE_GITIGNORE__"];
      if (options.customPattern) {
        const customPatterns = options.customPattern
          .split("\n")
          .map((line: string) => line.trim())
          .filter((line: string) => line && !line.startsWith("#"));
        ignorePatterns.push(...customPatterns);
      }
    }

    // 调用 Rust 后端生成目录树
    const result: TreeGenerationResult = await invoke("generate_directory_tree", {
      path: options.path,
      showFiles: options.showFiles,
      showHidden: options.showHidden,
      maxDepth: options.maxDepth === 10 ? 0 : options.maxDepth,
      ignorePatterns,
    });

    const statsWithTime = {
      ...result.stats,
      generated_at: formatDateTime(new Date(), "yyyy-MM-dd HH:mm:ss"),
    };

    logger.info("目录树生成成功", {
      statistics: statsWithTime,
    });

    return {
      structure: result.structure,
      stats: statsWithTime,
    };
  } catch (error: any) {
    errorHandler.handle(error, {
      userMessage: "生成目录树失败",
      showToUser: false,
      context: {
        path: options.path,
        configuration: options,
      },
    });
    throw error;
  }
}

/**
 * 选择目录
 */
export async function selectDirectory(title = "选择要分析的目录"): Promise<string | null> {
  try {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title,
    });

    if (typeof selected === "string") {
      logger.info("用户选择了目录", { path: selected });
      return selected;
    }

    return null;
  } catch (error) {
    errorHandler.handle(error, { userMessage: "选择目录失败", showToUser: false });
    throw error;
  }
}

/**
 * 导出目录树到文件
 */
export async function exportToFile(content: string, targetPath: string): Promise<void> {
  try {
    const getDirName = (path: string) => {
      const normalized = path.replace(/\\/g, "/");
      const parts = normalized.split("/");
      return parts[parts.length - 1] || parts[parts.length - 2] || "目录";
    };

    const dirName = getDirName(targetPath);
    const dateTime = formatDateTime(new Date(), "yyyyMMdd_HHmm");
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
      await writeTextFile(savePath, content);
      logger.info("文件保存成功", { path: savePath });
    }
  } catch (error) {
    errorHandler.handle(error, { userMessage: "保存文件失败", showToUser: false });
    throw error;
  }
}

/**
 * 加载配置
 */
export async function loadConfig(): Promise<DirectoryTreeConfig> {
  try {
    const config = await loadConfigFromStore();
    logger.debug("配置加载成功");
    return config;
  } catch (error) {
    errorHandler.handle(error, { userMessage: "加载配置失败", showToUser: false });
    throw error;
  }
}

/**
 * 保存配置
 */
export async function saveConfig(config: DirectoryTreeConfig): Promise<void> {
  try {
    await saveConfigToStore(config);
    logger.debug("配置保存成功");
  } catch (error) {
    errorHandler.handle(error, { userMessage: "保存配置失败", showToUser: false });
    throw error;
  }
}
