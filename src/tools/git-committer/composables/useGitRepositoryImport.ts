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

import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { addRepository } from "./useGitCommitterState";
import { refreshStatus } from "./useGitCommitterRunner";

interface DiscoveredRepository {
  path: string;
  name: string;
}

interface RepositoryScanResult {
  repositories: DiscoveredRepository[];
  invalidPaths: string[];
  scanLimitReached: boolean;
}

export interface RepositoryImportResult {
  discoveredCount: number;
  addedPaths: string[];
  duplicateCount: number;
}

const errorHandler = createModuleErrorHandler(
  "git-committer/repository-import"
);

export const isImportingRepositories = ref(false);

export async function importRepositories(
  paths: string[],
  alias = ""
): Promise<RepositoryImportResult | null> {
  const uniquePaths = [
    ...new Set(paths.map((path) => path.trim()).filter(Boolean)),
  ];
  if (uniquePaths.length === 0 || isImportingRepositories.value) return null;

  isImportingRepositories.value = true;
  try {
    const result = await invoke<RepositoryScanResult>("git_scan_repositories", {
      paths: uniquePaths,
    });

    if (result.repositories.length === 0) {
      customMessage.warning(
        result.invalidPaths.length > 0
          ? "所选路径不存在或不是目录"
          : "未在所选目录中发现 Git 仓库"
      );
      return {
        discoveredCount: 0,
        addedPaths: [],
        duplicateCount: 0,
      };
    }

    const addedPaths: string[] = [];
    const useAlias = result.repositories.length === 1 ? alias.trim() : "";
    for (const repository of result.repositories) {
      if (addRepository({ ...repository, alias: useAlias })) {
        addedPaths.push(repository.path);
      }
    }

    const duplicateCount = result.repositories.length - addedPaths.length;
    if (addedPaths.length > 0) {
      const duplicateSuffix =
        duplicateCount > 0 ? `，跳过 ${duplicateCount} 个已存在项` : "";
      customMessage.success(
        `已添加 ${addedPaths.length} 个 Git 仓库${duplicateSuffix}`
      );
      await Promise.all(addedPaths.map((path) => refreshStatus(path)));
    } else {
      customMessage.info(`发现的 ${duplicateCount} 个仓库已在列表中`);
    }

    if (result.scanLimitReached) {
      customMessage.warning(
        "目录规模较大，扫描已达到上限；可拖入更具体的目录继续扫描"
      );
    }

    return {
      discoveredCount: result.repositories.length,
      addedPaths,
      duplicateCount,
    };
  } catch (error) {
    errorHandler.error(error, "扫描 Git 仓库失败");
    return null;
  } finally {
    isImportingRepositories.value = false;
  }
}
