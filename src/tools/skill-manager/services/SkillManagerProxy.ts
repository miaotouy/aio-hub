/**
 * SkillManagerProxy — 系统级通用工具
 *
 * 单例 ToolRegistry（id: "skill:system"），向 Agent 暴露操作任意 Skill 资源的通用工具。
 * 所有方法委托给 Rust 命令执行。
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
    return {
      methods: [
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
      ],
    };
  }

  getExtraPromptContext(): string {
    try {
      const store = useSkillManagerStore();

      // OS 信息
      const osType = type();
      const osPlatform = platform();
      const osArch = arch();
      const osVersion = version();

      // 终端偏好
      const prefs = store.config.terminalPreferences;

      // 可用运行时
      const rt = store.config.runtimeSettings;
      const jsCmd = rt.javascript.command || "bun / node (自动检测)";
      const pyCmd = rt.python.command || "python (自动检测)";
      const shellCmd = rt.shell.command || "bash (自动检测)";
      const psCmd = rt.powershell.command || "powershell";

      // 确定默认终端描述和命令链接风格
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

      // 用户手动覆盖命令链偏好
      if (prefs.commandChainStyle === "semicolon") {
        chainStyle = "使用 `;` 串联命令";
      } else if (prefs.commandChainStyle === "ampersand") {
        chainStyle = "使用 `&&` 串联命令";
      }

      return `[Skill 宿主环境]
- 操作系统: ${osType} ${osVersion} (${osPlatform})
- 系统架构: ${osArch}
- 默认 Shell: ${shellDesc}
- 命令链接: ${chainStyle}
- 路径风格: ${pathStyle}
- 可用运行时: ${jsCmd}, ${pyCmd}, ${shellCmd}, ${psCmd}
- 执行说明:
  - 调用脚本请使用 skill:system.skill_run_script
  - 原生 Shell 命令（mkdir, ls 等）请使用工具集提供的对应能力
  - Skill 中的 \`npx\` 示例在 AIO 中应根据提供的工具协议格式转译`;
    } catch (error) {
      logger.warn("获取宿主环境信息失败", { error });
      return "";
    }
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
}

export const skillManagerProxy = new SkillManagerProxy();
