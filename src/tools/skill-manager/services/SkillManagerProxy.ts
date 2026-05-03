/**
 * SkillManagerProxy — 系统级通用工具
 *
 * 单例 ToolRegistry（id: "skill:system"），向 Agent 暴露操作任意 Skill 资源的通用工具。
 * 所有方法委托给 Rust 命令执行。
 */
import { invoke } from "@tauri-apps/api/core";
import type { ToolRegistry, ServiceMetadata } from "@/services/types";
import type { SkillScriptResult } from "../types";
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
            "执行指定 Skill 内部 scripts/ 目录下的预定义脚本。严禁执行系统命令或外部程序。安全校验在 Rust 侧完成。",
          parameters: [
            {
              name: "skill_id",
              type: "string",
              description: "Skill 名称（如 gpt-image-2）",
              required: true,
            },
            {
              name: "script_name",
              type: "string",
              description: "脚本相对路径（如 sync.js），必须位于该 Skill 的 scripts/ 目录下",
              required: true,
            },
            {
              name: "args",
              type: "string",
              description: "传递给脚本的命令行参数",
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
            "读取 Skill 目录内的文本文件（SKILL.md、references/、assets/ 等），路径限定在对应 Skill 目录内以防越权访问。",
          parameters: [
            { name: "skill_id", type: "string", description: "Skill 名称", required: true },
            {
              name: "path",
              type: "string",
              description: "相对于 Skill 根目录的文件路径（如 references/prompt-writing.md）",
              required: true,
            },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
        },
        {
          name: "skill_list_dir",
          displayName: "列出 Skill 目录",
          description: "列出 Skill 目录下的文件和子目录结构，用于静态知识库型 Skill 的文件发现。",
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
    return "";
  }

  // ---- 方法实现（全部委托给 Rust 命令） ----

  async skill_run_script(args: Record<string, string>): Promise<string> {
    const { skill_id, script_name, args: scriptArgs } = args;
    logger.info(`正在执行技能脚本: ${skill_id}/${script_name}`, { args: scriptArgs });

    return (
      (await errorHandler.wrapAsync(async () => {
        const result = await invoke<SkillScriptResult>("run_skill_script", {
          skillId: skill_id,
          scriptName: script_name,
          args: scriptArgs ?? "",
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
