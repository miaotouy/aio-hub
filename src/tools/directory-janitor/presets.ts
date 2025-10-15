/**
 * 目录清道夫预设配置
 */

export interface CleanupPreset {
  id: string;
  name: string;
  description: string;
  scanPath: string;
  namePattern: string;
  minAgeDays: number;
  minSizeMB: number;
  maxDepth: number;
}

export const builtInPresets: CleanupPreset[] = [
  {
    id: 'kilo-code-checkpoints',
    name: 'Kilo Code 检查点',
    description: '清理 Kilo Code 任务的旧检查点（.git 仓库）',
    scanPath: '%AppData%/Code/User/globalStorage/kilocode.kilo-code/tasks',
    namePattern: 'checkpoints',
    minAgeDays: 7,
    minSizeMB: 0,
    maxDepth: 2, // 扫描到 tasks/[UUID]/checkpoints
  },
  {
    id: 'roo-cline-checkpoints',
    name: 'Roo Cline 检查点',
    description: '清理 Roo Cline 任务的旧检查点（.git 仓库）',
    scanPath: '%AppData%/Code/User/globalStorage/rooveterinaryinc.roo-cline/tasks',
    namePattern: 'checkpoints',
    minAgeDays: 7,
    minSizeMB: 0,
    maxDepth: 2, // 扫描到 tasks/[UUID]/checkpoints
  },
  {
    id: 'vscode-extensions-cache',
    name: 'VS Code 扩展缓存',
    description: '清理 VS Code 扩展产生的通用缓存',
    scanPath: '',
    namePattern: '*.cache',
    minAgeDays: 30,
    minSizeMB: 10,
    maxDepth: 2,
  },
  {
    id: 'node-modules',
    name: 'Node.js 项目依赖',
    description: '清理项目中的 node_modules 文件夹',
    scanPath: '',
    namePattern: 'node_modules',
    minAgeDays: 30,
    minSizeMB: 100,
    maxDepth: 3,
  },
  {
    id: 'build-artifacts',
    name: '编译产物',
    description: '清理常见的编译输出目录',
    scanPath: '',
    namePattern: 'dist|build|out|target',
    minAgeDays: 14,
    minSizeMB: 10,
    maxDepth: 2,
  },
  {
    id: 'temp-folders',
    name: '临时文件夹',
    description: '清理系统临时文件',
    scanPath: '',
    namePattern: '*',
    minAgeDays: 7,
    minSizeMB: 1,
    maxDepth: 1,
  },
];

/**
 * 获取常见的 VS Code 路径提示
 */
export function getVSCodePathHint(): string {
  // 提供常见路径提示，用户需要根据实际情况调整
  const isWindows = navigator.platform.toLowerCase().includes('win');
  if (isWindows) {
    return 'C:/Users/你的用户名/AppData/Roaming/Code/User/globalStorage';
  }
  return '~/Library/Application Support/Code/User/globalStorage'; // macOS
}