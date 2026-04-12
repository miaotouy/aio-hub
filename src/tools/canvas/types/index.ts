import type { CanvasMetadata } from "./canvas-metadata";

/**
 * 画布状态定义
 */
export interface CanvasState {
  metadata: CanvasMetadata | null;
  // 当前处于编辑状态的文件路径列表
  openFiles: string[];
  // 当前激活的文件路径
  activeFile: string | null;
  // 画布是否处于加载中
  isLoading: boolean;
  // 是否有未保存的更改（内存中的影子文件）
  hasPendingChanges: boolean;
}

// 画布列表项（用于管理界面展示）
export interface CanvasListItem {
  metadata: CanvasMetadata;
  status: "idle" | "open" | "pending" | "syncing";
  pendingFileCount: number; // 有多少文件在影子缓存中
}

// 文件树节点
export interface CanvasFileNode {
  name: string;
  path: string; // 相对于画布根目录的路径
  isDirectory: boolean;
  children?: CanvasFileNode[];
  size?: number;
  status: "clean" | "modified" | "new" | "deleted";
}

// 画布模板
export interface CanvasTemplate {
  id: string;
  name: string;
  description: string;
  files: Record<string, string>; // filepath -> content
  entryFile: string;
}

// Diff 操作记录（用于 undo）
export interface DiffOperation {
  id: string;
  timestamp: number;
  filePath: string;
  previousContent: string; // 修改前的内容
  newContent: string; // 修改后的内容
  description: string;
}

/**
 * 待处理快照（用于撤销/重做）
 */
export interface PendingSnapshot {
  id: string;
  timestamp: number;
  // 变更描述
  description: string;
  // 变更的文件列表
  affectedFiles: string[];
  // 变更前的 Git Commit Hash
  baseCommitHash: string;
}

/**
 * 预览配置
 */
export interface PreviewConfig {
  // 是否自动刷新
  autoRefresh: boolean;
  // 预览端口（如果有本地服务）
  port?: number;
  // 预览模式：'browser' | 'iframe' | 'detached'
  mode: "browser" | "iframe" | "detached";
}

export * from "./canvas-metadata";