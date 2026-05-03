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
  /** 引用文件列表 */
  references: SkillFile[];
  /** 资源文件列表 */
  assets: SkillFile[];
  /** 来源类型 */
  source: "user" | "builtin";
}

/**
 * 可执行脚本
 */
export interface SkillScript {
  name: string;
  relativePath: string;
  language: "python" | "bash" | "javascript" | "powershell" | "unknown";
  description?: string;
}

/**
 * 引用/资源文件
 */
export interface SkillFile {
  name: string;
  relativePath: string;
  size: number;
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
