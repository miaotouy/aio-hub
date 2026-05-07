/**
 * SkillManagerProxy — Skill 系统代理
 *
 * 单例 ToolRegistry（id: "skill:system"）。
 * 1. 动态披露：根据已启用的 Skill 动态生成 activate_<name> 方法。
 * 2. 通用工具：向 Agent 暴露操作任意 Skill 资源的通用工具（脚本执行、文件读取）。
 * 所有核心操作均委托给 Rust 后端执行。
 */
import { invoke } from "@tauri-apps/api/core";
import { type, platform, arch, version } from "@tauri-apps/plugin-os";
import type { ToolRegistry, ServiceMetadata } from "@/services/types";
import type { SkillScriptResult, RuntimeSettings } from "../types";
import { useSkillManagerStore } from "../stores/skillManagerStore";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("skill-manager/system-proxy");
const errorHandler = createModuleErrorHandler("skill-manager/system-proxy");

export class SkillManagerProxy implements ToolRegistry {
  readonly id = "skill:system";
  readonly name = "Skill 系统工具";
  readonly description = "提供对已安装 Skill 私有资源的受限访问能力（仅限 scripts/ 和 references/）";
  readonly runMode = "main-only";

  getMetadata(): ServiceMetadata {
    const store = useSkillManagerStore();
    const enabledManifests = store.enabledManifests;

    const methods: any[] = [
      {
        name: "skill_run_script",
        displayName: "执行 Skill 私有脚本",
        description:
          "执行指定 Skill 内部 scripts/ 目录下的预定义脚本。当你在 Skill 文档中看到类似 `npx <name> <command> --flag` 的命令时，请使用此工具进行转换调用。",
        parameters: [
          {
            name: "skill_id",
            type: "string",
            description: "Skill 的唯一标识符。对应 CLI 命令中的包名/工具名（如 `npx gitnexus` 中的 `gitnexus`）",
            required: true,
          },
          {
            name: "script_name",
            type: "string",
            description: "脚本名称。对应 CLI 中的子命令或脚本文件名（如 `analyze` 或 `hello.js`）",
            required: true,
          },
          {
            name: "args",
            type: "string",
            description: "命令行参数。对应 CLI 中的所有后续 Flag 和参数（如 `--force --embeddings`）",
            required: false,
          },
        ],
        returnType: "Promise<string>",
        agentCallable: true,
      },
      {
        name: "skill_read_file",
        displayName: "读取 Skill 文件",
        description:
          "读取 Skill 目录内的文本文件（如 SKILL.md、references/guide.md 等）。用于获取 Skill 的详细文档或参考资料。",
        parameters: [
          {
            name: "skill_id",
            type: "string",
            description: "Skill 的唯一标识符",
            required: true,
          },
          {
            name: "path",
            type: "string",
            description: "文件相对路径。如果文档提到 `README.md` 或 `guide.md`，请尝试在此处读取",
            required: true,
          },
        ],
        returnType: "Promise<string>",
        agentCallable: true,
      },
      {
        name: "skill_list_dir",
        displayName: "列出 Skill 目录",
        description: "列出 Skill 目录下的文件和子目录结构。",
        parameters: [
          { name: "skill_id", type: "string", description: "Skill 名称", required: true },
          {
            name: "sub_dir",
            type: "string",
            description: "子目录路径（可选，默认为根目录）",
            required: false,
          },
        ],
        returnType: "Promise<string>",
        agentCallable: true,
      },
    ];

    // 动态注入每个已启用 Skill 的激活方法
    // 方法的 description 承载了 Skill 的摘要介绍
    for (const manifest of enabledManifests) {
      const methodName = `activate_${manifest.name}`;

      // 构造摘要描述
      const summary = [
        `激活技能 "${manifest.name}"。`,
        `描述: ${manifest.description}`,
        manifest.scripts.length > 0 ? `可用脚本: ${manifest.scripts.map((s) => s.name).join(", ")}` : "",
        manifest.files.length > 0 ? `可用文件: ${manifest.files.length} 个` : "",
        `调用此方法将返回该技能的完整指令和资源索引。`,
      ]
        .filter(Boolean)
        .join("\n");

      methods.push({
        name: methodName,
        displayName: `激活: ${manifest.name}`,
        description: summary,
        parameters: [],
        returnType: "Promise<string>",
        agentCallable: true,
      });

      // 动态挂载方法实现
      (this as any)[methodName] = async () => {
        return this.buildSkillInstruction(manifest.name);
      };
    }

    return { methods };
  }

  // ---- 方法实现（全部委托给 Rust 命令） ----

  /** 从 Store 获取运行时配置 */
  private getRuntimeSettings(): RuntimeSettings {
    const store = useSkillManagerStore();
    return store.config.runtimeSettings;
  }

  async skill_run_script(args: Record<string, string>): Promise<string> {
    const { skill_id, script_name, args: scriptArgs } = args;
    logger.info(`正在执行技能脚本: ${skill_id}/${script_name}`, { args: scriptArgs });

    const runtimeSettings = this.getRuntimeSettings();
    logger.debug("运行时配置已加载", {
      js: runtimeSettings.javascript.command || "(自动检测)",
      py: runtimeSettings.python.command || "(自动检测)",
    });

    return (
      (await errorHandler.wrapAsync(async () => {
        const result = await invoke<SkillScriptResult>("run_skill_script", {
          skillId: skill_id,
          scriptName: script_name,
          args: scriptArgs ?? "",
          runtimeSettings,
        });
        if (!result.success) {
          return `脚本执行失败（exit code: ${result.exitCode}）\nstderr: ${result.stderr}`;
        }
        return result.stdout || "脚本执行完成（无输出）";
      })) ?? "脚本执行出错，请查看日志。"
    );
  }

  async skill_read_file(args: Record<string, string>): Promise<string> {
    const { skill_id, path } = args;
    return (
      (await errorHandler.wrapAsync(async () => {
        return await invoke<string>("read_skill_resource", {
          skillId: skill_id,
          relativePath: path,
        });
      })) ?? "读取文件失败。"
    );
  }

  async skill_list_dir(args: Record<string, string>): Promise<string> {
    const { skill_id, sub_dir = "" } = args;
    return (
      (await errorHandler.wrapAsync(async () => {
        const entries = await invoke<string[]>("list_skill_directory", {
          skillId: skill_id,
          subDir: sub_dir || null,
        });
        return entries.length > 0 ? entries.map((e: string) => `- ${e}`).join("\n") : "目录为空";
      })) ?? "列出目录失败。"
    );
  }

  /**
   * 构造 Skill 的完整指令内容（原 SkillProxy 逻辑）
   */
  private async buildSkillInstruction(skillId: string): Promise<string> {
    const store = useSkillManagerStore();
    const manifest = store.manifests.find((m) => m.name === skillId);
    if (!manifest) return `未找到技能 "${skillId}" 的清单。`;

    const parts: string[] = [];
    parts.push(`<skill_context id="skill:${manifest.name}">`);
    parts.push(`## ${manifest.name}`);
    parts.push(manifest.instructions);

    // 文件索引
    if (manifest.files.length > 0) {
      parts.push(`\n### 可用文件`);
      parts.push(`> 读取文件请调用 \`skill:system.skill_read_file\`（skill_id="${skillId}"，path="文件相对路径"）`);
      for (const file of manifest.files) {
        parts.push(`- \`${file.relativePath}\` (${(file.size / 1024).toFixed(1)} KB)`);
      }
      if (manifest.files.length > 5) {
        parts.push(`> 可使用 \`skill:system.skill_list_dir\` 浏览子目录（skill_id="${skillId}"）`);
      }
    }

    // 脚本列表
    if (manifest.scripts.length > 0) {
      parts.push(`\n### 可用脚本`);
      parts.push(
        `> 执行脚本请调用 \`skill:system.skill_run_script\`（skill_id="${skillId}"，script_name="脚本名"，args="命令行参数"）`,
      );
      for (const script of manifest.scripts) {
        parts.push(`- \`${script.name}\`: ${script.description || `[${script.language}] 执行脚本`}`);
      }
    }

    // 注入宿主环境信息（原 getExtraPromptContext 逻辑搬迁至此，作为激活后的补充信息）
    parts.push(`\n### 宿主环境信息`);
    parts.push(this.getHostEnvironmentInfo());

    parts.push("</skill_context>");
    return parts.join("\n");
  }

  /**
   * 提取命令的文件名（脱敏）
   */
  private getCommandBasename(cmd: string, fallback: string): string {
    if (!cmd) return fallback;
    // 处理 Windows 和 Unix 路径
    const parts = cmd.split(/[\\/]/);
    return parts[parts.length - 1] || fallback;
  }

  /**
   * 获取宿主环境信息（原 getExtraPromptContext 逻辑）
   */
  private getHostEnvironmentInfo(): string {
    try {
      const store = useSkillManagerStore();
      const osType = type();
      const osPlatform = platform();
      const osArch = arch();
      const osVersion = version();
      const prefs = store.config.terminalPreferences;
      const rt = store.config.runtimeSettings;

      const jsCmd = this.getCommandBasename(rt.javascript.command, "bun / node (自动检测)");
      const pyCmd = this.getCommandBasename(rt.python.command, "python (自动检测)");
      const shellCmd = this.getCommandBasename(rt.shell.command, "bash (自动检测)");
      const psCmd = this.getCommandBasename(rt.powershell.command, "powershell");

      let shellDesc = "PowerShell";
      let chainStyle = "使用 `;` 串联命令（PowerShell 语义）";
      let pathStyle = "`\\`（反斜杠）";

      if (prefs.defaultShell === "cmd") {
        shellDesc = "cmd.exe";
        chainStyle = "使用 `&&` 串联命令";
      } else if (prefs.defaultShell === "bash") {
        shellDesc = "bash";
        chainStyle = "使用 `&&` 串联命令";
        pathStyle = "`/`（正斜杠）";
      } else if (prefs.defaultShell === "zsh") {
        shellDesc = "zsh";
        chainStyle = "使用 `&&` 串联命令";
        pathStyle = "`/`（正斜杠）";
      }

      if (prefs.commandChainStyle === "semicolon") {
        chainStyle = "使用 `;` 串联命令";
      } else if (prefs.commandChainStyle === "ampersand") {
        chainStyle = "使用 `&&` 串联命令";
      }

      return [
        `- 操作系统: ${osType} ${osVersion} (${osPlatform})`,
        `- 系统架构: ${osArch}`,
        `- 默认 Shell: ${shellDesc}`,
        `- 命令链接: ${chainStyle}`,
        `- 路径风格: ${pathStyle}`,
        `- 可用运行时: ${jsCmd}, ${pyCmd}, ${shellCmd}, ${psCmd}`,
        `- 执行说明:`,
        `  - 调用脚本请使用 skill:system.skill_run_script`,
        `  - 原生 Shell 命令（mkdir, ls 等）请使用工具集提供的对应能力`,
        `  - Skill 中的 \`npx\` 示例在 AIO 中应根据提供的工具协议格式转译`,
      ].join("\n");
    } catch (error) {
      return "获取宿主环境信息失败。";
    }
  }
}

export const skillManagerProxy = new SkillManagerProxy();
