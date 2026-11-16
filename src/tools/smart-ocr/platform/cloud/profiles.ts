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
 * 云端 OCR 配置管理 Composable
 */

import { ref, computed } from "vue";
import type { OcrProfile } from "./types";
import type { OcrPreset } from "./providers";
import { createConfigManager } from "@utils/configManager";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("OcrProfiles");
const errorHandler = createModuleErrorHandler("OcrProfiles");

const STORAGE_KEY = "ocr-profiles"; // 用于 localStorage 数据迁移

// 配置文件管理器
const configManager = createConfigManager<{ profiles: OcrProfile[] }>({
  moduleName: "ocr-service",
  fileName: "profiles.json",
  version: "1.0.0",
  createDefault: () => ({ profiles: [] }),
});

// 全局状态
const profiles = ref<OcrProfile[]>([]);
const isLoaded = ref(false);
let loadPromise: Promise<void> | null = null;
const revision = ref(0);
let writeQueue: Promise<unknown> = Promise.resolve();

export function useOcrProfiles() {
  /**
   * 从文件系统加载配置（支持 localStorage 迁移）
   */
  const loadProfiles = async () => {
    if (isLoaded.value) return;
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      try {
        logger.info("开始加载 OCR 配置");

        // 尝试从文件系统加载
        const config = await configManager.load();
        let loadedProfiles = config.profiles || [];

        // 如果文件系统中没有数据，尝试从 localStorage 迁移
        if (loadedProfiles.length === 0) {
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored) {
            logger.info("检测到 localStorage 数据，开始迁移到文件系统");
            try {
              loadedProfiles = JSON.parse(stored);

              // 保存到文件系统
              await configManager.save({ profiles: loadedProfiles });

              // 清除 localStorage 数据
              localStorage.removeItem(STORAGE_KEY);
              logger.info("数据迁移完成", {
                profileCount: loadedProfiles.length,
              });
            } catch (parseError) {
              errorHandler.handle(parseError, {
                userMessage: "解析 localStorage 数据失败",
                showToUser: false,
              });
            }
          }
        }

        profiles.value = loadedProfiles;
        isLoaded.value = true;
        logger.info("OCR 配置加载成功", {
          profileCount: loadedProfiles.length,
        });
      } catch (error) {
        errorHandler.error(error, "加载 OCR 配置失败");
        profiles.value = [];
        isLoaded.value = true;
      } finally {
        loadPromise = null;
      }
    })();

    return loadPromise;
  };

  const writeProfiles = (
    update: (latest: OcrProfile[]) => OcrProfile[],
    expectedRevision?: number
  ) => {
    const task = writeQueue
      .catch(() => {})
      .then(async () => {
        try {
          if (
            expectedRevision !== undefined &&
            expectedRevision !== revision.value
          )
            throw Object.assign(
              new Error("OCR 服务配置已更新，请刷新后重新保存"),
              { code: "OCR_CONFIG_CONFLICT" }
            );
          const next = update(JSON.parse(JSON.stringify(profiles.value)));
          await configManager.save({ profiles: next });
          profiles.value = JSON.parse(JSON.stringify(next));
          revision.value++;
          return { profiles: next, revision: revision.value };
        } catch (error) {
          errorHandler.error(error, "保存 OCR 配置失败");
          throw error;
        }
      });
    writeQueue = task;
    return task;
  };

  const saveProfile = (
    value: OcrProfile,
    options: { expectedRevision?: number } = {}
  ) => {
    const profile: OcrProfile = JSON.parse(JSON.stringify(value));
    const creating =
      !profiles.value.some((item) => item.id === profile.id) &&
      (options.expectedRevision === undefined ||
        options.expectedRevision === revision.value);
    const expectedRevision = creating
      ? undefined
      : (options.expectedRevision ?? revision.value);
    return writeProfiles((latest) => {
      const index = latest.findIndex((item) => item.id === profile.id);
      if (index < 0) latest.push(profile);
      else latest[index] = profile;
      return latest;
    }, expectedRevision).then((saved) => ({
      value: JSON.parse(JSON.stringify(profile)) as OcrProfile,
      revision: saved.revision,
    }));
  };

  const deleteProfile = (id: string) =>
    writeProfiles((latest) => latest.filter((item) => item.id !== id));

  /**
   * 根据 ID 获取配置
   */
  const getProfileById = (id: string): OcrProfile | undefined => {
    return profiles.value.find((p: OcrProfile) => p.id === id);
  };

  /**
   * 获取所有启用的配置
   */
  const enabledProfiles = computed(() => {
    return profiles.value.filter((p: OcrProfile) => p.enabled);
  });

  const toggleProfileEnabled = (id: string) =>
    writeProfiles((latest) => {
      const profile = latest.find((item) => item.id === id);
      if (profile) profile.enabled = !profile.enabled;
      return latest;
    });

  const updateProfilesOrder = (ordered: OcrProfile[]) => {
    const ids = ordered.map((item) => item.id);
    return writeProfiles((latest) => [
      ...ids.flatMap((id) => latest.filter((item) => item.id === id)),
      ...latest.filter((item) => !ids.includes(item.id)),
    ]);
  };

  /**
   * 生成唯一 ID
   */
  const generateId = (): string => {
    return `ocr-profile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  /**
   * 从预设创建配置
   */
  const createFromPreset = (preset: OcrPreset): OcrProfile => {
    return {
      id: generateId(),
      name: preset.name,
      provider: preset.provider,
      endpoint: preset.endpoint,
      credentials: {
        apiKey: "",
        apiSecret: "",
      },
      enabled: true,
      concurrency: 3,
      delay: 0,
    };
  };

  // 如果还未加载，自动加载
  if (!isLoaded.value) {
    loadProfiles();
  }

  return {
    profiles,
    isLoaded,
    revision,
    loadProfiles,
    saveProfile,
    deleteProfile,
    getProfileById,
    enabledProfiles,
    toggleProfileEnabled,
    updateProfilesOrder,
    generateId,
    createFromPreset,
  };
}
