import { invoke } from "@tauri-apps/api/core";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import type { SkillScriptResult, RuntimeSettings, SkillManifest, AvailableSkillInfo } from "../types";

const errorHandler = createModuleErrorHandler("skill-manager/service");
const logger = createModuleLogger("skill-manager/service");

/**
 * SkillService — 封装所有与 Skill 相关的底层操作
 */
export const SkillService = {
  /**
   * 读取 Skill 资源文件
   *
   * 文件不存在时静默返回空字符串（属于预期情况），其他错误正常上报。
   */
  async readResource(skillId: string, relativePath: string): Promise<string> {
    try {
      return await invoke<string>("read_skill_resource", {
        skillId,
        relativePath,
      });
    } catch (error: any) {
      const msg = String(error?.message ?? error ?? "");
      // "文件不存在"属于预期情况，静默处理
      if (msg.includes("文件不存在") || msg.includes("not found") || msg.includes("No such file")) {
        logger.debug("资源文件不存在（预期内）", { skillId, relativePath });
        return "";
      }
      // 其他错误正常上报
      errorHandler.error(error, undefined, { skillId, relativePath });
      return "";
    }
  },

  /**
   * 写入 Skill 资源文件
   */
  async writeResource(skillId: string, relativePath: string, content: string): Promise<boolean> {
    const result = await errorHandler.wrapAsync(async () => {
      await invoke("write_skill_resource", {
        skillId,
        relativePath,
        content,
      });
      return true;
    });
    return result === true;
  },

  /**
   * 列出 Skill 目录内容
   */
  async listDirectory(skillId: string, subDir: string = ""): Promise<string[]> {
    return (
      (await errorHandler.wrapAsync(async () => {
        return await invoke<string[]>("list_skill_directory", {
          skillId,
          subDir: subDir || null,
        });
      })) ?? []
    );
  },

  /**
   * 执行 Skill 脚本
   */
  async runScript(
    skillId: string,
    scriptName: string,
    args: string = "",
    runtimeSettings: RuntimeSettings,
    envVars?: Record<string, string>,
  ): Promise<SkillScriptResult | null> {
    return await errorHandler.wrapAsync(async () => {
      return await invoke<SkillScriptResult>("run_skill_script", {
        skillId,
        scriptName,
        args,
        runtimeSettings,
        envVars: envVars && Object.keys(envVars).length > 0 ? envVars : null,
      });
    });
  },

  /**
   * 列出内置可用的 skill
   */
  async listBuiltinSkills(): Promise<AvailableSkillInfo[]> {
    return (
      (await errorHandler.wrapAsync(async () => {
        return await invoke<AvailableSkillInfo[]>("list_builtin_skills");
      })) ?? []
    );
  },

  /**
   * 安装指定的内置 skill
   */
  async installBuiltinSkill(skillId: string): Promise<boolean> {
    const result = await errorHandler.wrapAsync(async () => {
      await invoke("install_builtin_skill", { skillId });
      return true;
    });
    return result === true;
  },

  /**
   * 将指定 skill 重置为内置模板版本
   */
  async resetSkillToBuiltin(skillId: string): Promise<boolean> {
    const result = await errorHandler.wrapAsync(async () => {
      await invoke("reset_skill_to_builtin", { skillId });
      return true;
    });
    return result === true;
  },

  /**
   * 获取内置模板中指定 skill 的版本号
   */
  async getBuiltinSkillVersion(skillId: string): Promise<string | null> {
    return (
      (await errorHandler.wrapAsync(async () => {
        return await invoke<string | null>("get_builtin_skill_version", { skillId });
      })) ?? null
    );
  },

  /**
   * 获取所有 Skill 清单
   */
  async getAllManifests(externalPaths?: any[]): Promise<SkillManifest[]> {
    return (
      (await errorHandler.wrapAsync(async () => {
        return await invoke<SkillManifest[]>("get_all_skill_manifests", {
          externalPaths,
        });
      })) ?? []
    );
  },
};
