/**
 * Skill 清单（与 Rust SkillManifest 结构一致）
 */
export interface SkillManifest {
  /** 技能名称 */
  name: string;
  /** 技能描述 */
  description: string;
  /** 许可证 */
  license?: string;
  /** 环境兼容性说明 */
  compatibility?: string;
  /** 扩展元数据 */
  metadata?: Record<string, string>;
  /** 预批准工具列表 */
  allowedTools?: string[];
  /** SKILL.md 的 Markdown 主体内容（指令文本） */
  instructions: string;
  /** 技能目录的绝对路径 */
  basePath: string;
  /** 可执行脚本列表 */
  scripts: SkillScript[];
  /** 所有非脚本文件列表 */
  files: SkillFile[];
  /** 来源类型 (user | builtin | external:{id}) */
  source: string;
}

/**
 * 可执行脚本
 */
export interface SkillScript {
  name: string;
  relativePath: string;
  language: string;
  description?: string;
  size: number;
}

/**
 * 引用/资源文件
 */
export interface SkillFile {
  name: string;
  relativePath: string;
  size: number;
  mimeType: string;
}

/**
 * 运行时配置（每种语言）
 */
export interface LanguageRuntime {
  /** 可执行命令路径（如 "bun"、"node"、"python3"、"C:/python/python.exe"） */
  command: string;
}

/**
 * 运行环境配置
 */
export interface RuntimeSettings {
  javascript: LanguageRuntime;
  python: LanguageRuntime;
  shell: LanguageRuntime;
  powershell: LanguageRuntime;
}

/**
 * Shell 类型
 */
export type ShellType = "auto-detect" | "powershell" | "cmd" | "bash" | "zsh";

/**
 * 命令链接风格
 */
export type CommandChainStyle = "auto" | "semicolon" | "ampersand";

/**
 * 终端偏好配置
 */
export interface TerminalPreferences {
  /** 默认 Shell */
  defaultShell: ShellType;
  /** 命令链接风格 */
  commandChainStyle: CommandChainStyle;
}

/**
 * 外部扫描路径配置
 */
export interface ExternalScanPath {
  id: string;
  path: string;
  enabled: boolean;
  label?: string;
}

/**
 * 已知工具预设路径（跨平台）
 */
export interface WellKnownPath {
  id: string;
  label: string;
  defaultPath: string;
}

/**
 * 脚本执行结果
 */
export interface SkillScriptResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
}

/**
 * 可用的 Skill 信息（来自源，尚未安装）
 */
export interface AvailableSkillInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  metadata?: Record<string, string>;
}

/**
 * Skill 源类型
 */
export type SkillSourceType = "builtin" | "remote-registry" | "git-repo";

/**
 * Skill 源定义
 */
export interface SkillSource {
  id: string;
  type: SkillSourceType;
  name: string;
  description?: string;
  enabled: boolean;
  url?: string;
}

/**
 * 内置 skill 安装记录
 */
export interface BuiltinInstallInfo {
  /** 安装时的版本号 */
  version: string;
  /** 安装时间 */
  installedAt: string; // ISO 8601
  /** 用户是否修改过（可选，用于更新提示） */
  userModified?: boolean;
}

/**
 * @deprecated 使用 BuiltinInstallInfo
 */
export type EjectedBuiltinInfo = BuiltinInstallInfo;
