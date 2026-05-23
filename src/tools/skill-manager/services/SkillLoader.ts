/**
 * SkillLoader — 调用 Rust 命令的薄封装层
 */
import { invoke } from "@tauri-apps/api/core";
import type { SkillManifest, ExternalScanPath, WellKnownPath, SkillPackageInfo, BundleMetadata } from "../types";

export interface PrepareDetectResult {
  tempPath: string;
  packageInfo: SkillPackageInfo;
}
import { createModuleErrorHandler } from "@/utils/errorHandler";

const errorHandler = createModuleErrorHandler("skill-manager/loader");

export class SkillLoader {
  private cachedManifests: SkillManifest[] | null = null;

  /**
   * 调用 Rust 命令扫描所有搜索路径，返回 Skill 清单列表
   */
  async scanAll(externalPaths?: ExternalScanPath[]): Promise<SkillManifest[]> {
    // 正常扫描 (不再自动释出内置技能)
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
  async refreshManifests(externalPaths?: ExternalScanPath[]): Promise<SkillManifest[]> {
    this.cachedManifests = null;
    return await this.scanAll(externalPaths);
  }

  /**
   * 调用 Rust 命令卸载 Skill
   */
  async uninstallSkill(skillId: string): Promise<void> {
    await invoke("uninstall_skill", { skillId });
    // 清除缓存，下次扫描重新加载
    this.cachedManifests = null;
  }

  /**
   * 调用 Rust 命令重命名 Skill
   */
  async renameSkill(skillId: string, newName: string): Promise<void> {
    await invoke("rename_skill", { skillId, newName });
    // 清除缓存
    this.cachedManifests = null;
  }

  /**
   * 获取缓存（若存在）
   */
  getCachedManifests(): SkillManifest[] | null {
    return this.cachedManifests;
  }

  /**
   * 探测目录/仓库的包结构
   */
  async detectPackage(path: string): Promise<SkillPackageInfo> {
    return await invoke<SkillPackageInfo>("detect_skill_package", { path });
  }

  /**
   * 准备并探测技能包（支持本地目录、Git 仓库、ZIP 链接、本地 ZIP 文件）
   */
  async prepareAndDetectPackage(inputType: string, pathOrUrl: string): Promise<PrepareDetectResult> {
    return await invoke<PrepareDetectResult>("prepare_and_detect_package", {
      inputType,
      pathOrUrl,
    });
  }

  /**
   * 清理临时目录
   */
  async cleanTempDir(tempPath: string): Promise<void> {
    await invoke("clean_temp_dir", { tempPath });
  }

  /**
   * 从集合包安装选中的 skill
   */
  async installBundle(sourcePath: string, bundleInfo: any): Promise<BundleMetadata> {
    const metadata = await invoke<BundleMetadata>("install_bundle", {
      sourcePath,
      bundleInfo,
    });
    this.cachedManifests = null;
    return metadata;
  }

  /**
   * 卸载整个 Bundle
   */
  async uninstallBundle(bundleName: string): Promise<void> {
    await invoke("uninstall_bundle", { bundleName });
    this.cachedManifests = null;
  }

  /**
   * 获取所有已安装的 Bundle 元数据
   */
  async getInstalledBundles(): Promise<BundleMetadata[]> {
    return (
      (await errorHandler.wrapAsync(async () => {
        return await invoke<BundleMetadata[]>("get_installed_bundles");
      })) ?? []
    );
  }
}

export const skillLoader = new SkillLoader();
