/**
 * SkillProxy — 技能代理
 *
 * 实现 ToolRegistry 接口，代表一个已安装 Skill 在 AIO 工具系统中的入口。
 * 每个 Skill 注册为独立 ToolRegistry，可复用 tool-calling 配置中的工具开关。
 */
import type { ToolRegistry, ServiceMetadata, MethodMetadata, AgentExtensionContext } from "@/services/types";
import type { SkillManifest } from "../types";
import { useSkillManagerStore } from "../stores/skillManagerStore";

export class SkillProxy implements ToolRegistry {
  readonly id: string; // "skill:{skill-name}"
  readonly name: string;
  readonly description: string;
  readonly runMode = "main-only";

  private manifest: SkillManifest;
  private _activated = false;

  constructor(manifest: SkillManifest) {
    this.id = `skill:${manifest.name}`;
    this.name = manifest.name;
    this.description = manifest.description;
    this.manifest = manifest;
  }

  /** 获取底层 manifest 引用 */
  getManifest(): SkillManifest {
    return this.manifest;
  }

  /** 是否已激活 */
  get activated(): boolean {
    return this._activated;
  }

  /**
   * 提供技能元数据
   * 只暴露 activate 方法。脚本/文件操作由 SkillManagerProxy 提供。
   */
  getMetadata(): ServiceMetadata {
    const methods: MethodMetadata[] = [];

    // 核心方法：激活技能
    methods.push({
      name: "activate",
      displayName: `激活: ${this.name}`,
      description: `激活技能 "${this.name}"，将完整指令加载到上下文。激活后可通过 skill_run_script 和 skill_read_file 操作此技能的资源。`,
      parameters: [],
      returnType: "Promise<string>",
      agentCallable: true,
    });

    return { methods };
  }

  /**
   * 提供 Prompt 上下文 — 渐进式披露
   * - 未激活：摘要（~100 tokens）
   * - 已激活：完整 SKILL.md + 资源索引 + 通用工具调用指引
   */
  getExtraPromptContext(_context?: AgentExtensionContext): string {
    if (!this._activated) {
      return this.buildSummaryContext();
    }
    return this.buildFullContext();
  }

  private buildSummaryContext(): string {
    const parts: string[] = [
      `<skill_summary id="${this.id}">`,
      `  name: ${this.manifest.name}`,
      `  description: ${this.manifest.description}`,
    ];
    if (this.manifest.scripts.length > 0) {
      parts.push(`  scripts: ${this.manifest.scripts.map((s) => s.name).join(", ")}`);
    }
    if (this.manifest.references.length > 0) {
      parts.push(`  references: ${this.manifest.references.length} 个文档（激活后查看完整索引）`);
    }
    parts.push(`  activation: 调用 activate() 方法以加载完整指令`);
    parts.push(`</skill_summary>`);
    return parts.join("\n");
  }

  private buildFullContext(): string {
    const skillId = this.manifest.name;
    const parts: string[] = [];

    parts.push(`<skill_context id="${this.id}">`);
    parts.push(`## ${this.manifest.name}`);
    parts.push(this.manifest.instructions);

    // 引用文件索引
    if (this.manifest.references.length > 0) {
      parts.push(`\n### 可用引用文件`);
      parts.push(`> 读取文件请调用 \`skill:system.skill_read_file\`（skill_id="${skillId}"，path="引用文件相对路径"）`);
      for (const ref of this.manifest.references) {
        parts.push(`- \`${ref.relativePath}\` (${(ref.size / 1024).toFixed(1)} KB)`);
      }
      if (this.manifest.references.length > 5) {
        parts.push(`> 可使用 \`skill:system.skill_list_dir\` 浏览子目录（skill_id="${skillId}"）`);
      }
    }

    // 脚本列表
    if (this.manifest.scripts.length > 0) {
      parts.push(`\n### 可用脚本`);
      parts.push(
        `> 执行脚本请调用 \`skill:system.skill_run_script\`（skill_id="${skillId}"，script_name="脚本名"，args="命令行参数"）`,
      );
      for (const script of this.manifest.scripts) {
        parts.push(`- \`${script.name}\`: ${script.description || `[${script.language}] 执行脚本`}`);
      }
    }

    parts.push("</skill_context>");
    return parts.join("\n");
  }

  /** 激活技能 */
  async activate(): Promise<string> {
    this._activated = true;
    const store = useSkillManagerStore();
    store.setSkillActive(this.manifest.name, true);
    return `技能 "${this.manifest.name}" 已激活，完整指令已加载到上下文。`;
  }
}
