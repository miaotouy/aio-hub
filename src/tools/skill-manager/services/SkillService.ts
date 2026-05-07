import { invoke } from "@tauri-apps/api/core";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { SkillScriptResult, RuntimeSettings, SkillManifest } from "../types";

const errorHandler = createModuleErrorHandler("skill-manager/service");

/**
 * SkillService — 封装所有与 Skill 相关的底层操作
 */
export const SkillService = {
  /**
   * 读取 Skill 资源文件
   */
  async readResource(skillId: string, relativePath: string): Promise<string> {
    return (
      (await errorHandler.wrapAsync(async () => {
        return await invoke<string>("read_skill_resource", {
          skillId,
          relativePath,
        });
      })) ?? ""
    );
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
  ): Promise<SkillScriptResult | null> {
    return await errorHandler.wrapAsync(async () => {
      return await invoke<SkillScriptResult>("run_skill_script", {
        skillId,
        scriptName,
        args,
        runtimeSettings,
      });
    });
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
