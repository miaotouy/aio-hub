// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * useSkillManager — 技能管理 Composable
 *
 * 提供 UI 层与 Store/Service 之间的粘合逻辑。
 */
import { useSkillManagerStore } from "../stores/skillManagerStore";
import { skillLoader } from "../services/SkillLoader";
import { skillBridgeFactory } from "../services/SkillBridgeFactory";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const errorHandler = createModuleErrorHandler("skill-manager/composable");

export function useSkillManager() {
  const store = useSkillManagerStore();

  /** 初始化：加载配置 + 扫描技能 */
  async function initialize() {
    await store.loadConfig();
    store.setScanStatus("scanning");
    try {
      // 从 store 获取启用的外部路径
      const externalPaths = store.config.externalScanEnabled
        ? store.config.externalScanPaths.filter((p) => p.enabled)
        : [];

      const manifests = await skillLoader.scanAll(externalPaths);
      store.setManifests(manifests);

      // 加载已安装的 bundles
      const bundles = await skillLoader.getInstalledBundles();
      store.bundles = bundles;

      store.setScanStatus("ready");
    } catch (error) {
      console.error("[SkillManager] 扫描技能失败", error);
      store.setScanStatus("error");
    }
  }

  /** 刷新技能清单 */
  async function refresh() {
    await skillBridgeFactory.refresh();
  }

  /** 切换技能启用状态 */
  function toggleSkill(name: string) {
    store.toggleSkill(name);
  }

  /** 卸载技能（user 来源或从内置安装的均可卸载） */
  async function uninstallSkill(name: string): Promise<boolean> {
    const manifest = store.manifests.find((m) => m.name === name);
    if (!manifest) return false;
    // 仅允许 user 来源（包括从内置安装后变为 user 的）卸载
    if (manifest.source !== "user") return false;

    const result = await errorHandler.wrapAsync(
      async () => {
        await skillLoader.uninstallSkill(name);
      },
      { userMessage: `卸载技能 "${name}" 失败`, showToUser: false }
    );

    if (result === null) return false;

    // 从 store 中移除（包括清理 builtinInstallRecords）
    store.removeSkill(name);
    return true;
  }

  /** 重命名技能（仅 user 来源） */
  async function renameSkill(
    oldName: string,
    newName: string
  ): Promise<boolean> {
    const manifest = store.manifests.find((m) => m.name === oldName);
    if (!manifest || manifest.source !== "user") return false;

    const result = await errorHandler.wrapAsync(
      async () => {
        await skillLoader.renameSkill(oldName, newName);
      },
      { userMessage: `重命名技能 "${oldName}" 失败`, showToUser: false }
    );

    if (result === null) return false;

    // 同步 Store 中的配置（如禁用状态）
    store.renameSkill(oldName, newName);

    // 刷新列表以同步状态
    await initialize();
    return true;
  }

  /** 卸载整个 Bundle */
  async function uninstallBundle(bundleName: string): Promise<boolean> {
    const bundle = store.bundles.find((b) => b.name === bundleName);
    if (!bundle) return false;

    const result = await errorHandler.wrapAsync(
      async () => {
        await skillLoader.uninstallBundle(bundleName);
      },
      { userMessage: `卸载技能包 "${bundleName}" 失败`, showToUser: false }
    );

    if (result === null) return false;

    // 从 store 中移除
    store.removeBundle(bundleName);

    // 刷新列表以同步状态
    await initialize();
    return true;
  }

  return {
    store,
    initialize,
    refresh,
    toggleSkill,
    uninstallSkill,
    renameSkill,
    uninstallBundle,
  };
}
