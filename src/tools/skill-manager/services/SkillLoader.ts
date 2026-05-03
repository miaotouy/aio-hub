/**
 * SkillLoader — 调用 Rust 命令的薄封装层
 */
import { invoke } from "@tauri-apps/api/core";
import type { SkillManifest, ExternalScanPath, WellKnownPath } from "../types";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const errorHandler = createModuleErrorHandler("skill-manager/loader");

export class SkillLoader {
  private cachedManifests: SkillManifest[] | null = null;

  /**
   * 调用 Rust 命令扫描所有搜索路径，返回 Skill 清单列表
   */
  async scanAll(externalPaths?: ExternalScanPath[]): Promise<SkillManifest[]> {
    const manifests =
      (await errorHandler.wrapAsync(async () => {
        return await invoke<SkillManifest[]>("get_all_skill_manifests", {
          externalPaths: externalPaths ?? [],
        });
      })) ?? [];
    this.cachedManifests = manifests;
    return manifests;
  }

  /**
   * 获取已知工具的默认全局路径列表
   */
  async getWellKnownPaths(): Promise<WellKnownPath[]> {
    return (
      (await errorHandler.wrapAsync(async () => {
        return await invoke<WellKnownPath[]>("get_well_known_skill_paths");
      })) ?? []
    );
  }

  /**
   * 从内存缓存中获取指定 Skill 的清单
   */
  getManifest(name: string): SkillManifest | undefined {
    return this.cachedManifests?.find((m) => m.name === name);
  }

  /**
   * 刷新清单（重新调用 Rust 命令扫描）
   */
  async refreshManifests(): Promise<SkillManifest[]> {
    this.cachedManifests = null;
    return await this.scanAll();
  }

  /**
   * 获取缓存（若存在）
   */
  getCachedManifests(): SkillManifest[] | null {
    return this.cachedManifests;
  }
}

export const skillLoader = new SkillLoader();
