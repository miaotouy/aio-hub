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
 * 工作区与暂存区更改内容/文件名搜索 Composable
 *
 * 类似目录搜索体验：
 * - 同时匹配文件名与 diff 变更内容
 * - 单个文件展示前 3 个内容匹配行（一行只算一个高亮），超出部分提示剩余结果
 * - 支持内存缓存与防抖并发检索
 */
import { ref, computed, watch, type Ref } from "vue";
import { useDebounceFn } from "@vueuse/core";

import {
  getFileName,
  getFileDir,
  highlightTextParts,
  searchContentMatches,
  type HighlightPart,
  type FileDiffSearchResult,
} from "../utils";
import {
  loadFileDiff,
  openDiffTab,
  openFileTab,
} from "./useGitCommitterRunner";
import { currentStatus, fileSearchKeyword } from "./useGitCommitterState";
import type { FileStatus } from "../types";

export interface GitSearchResultFileItem {
  path: string;
  status: string;
  isStaged: boolean;
  fileName: string;
  fileDir: string;
  fileNameParts: HighlightPart[];
  dirParts: HighlightPart[];
  hasFileNameMatch: boolean;
  contentResult: FileDiffSearchResult;
}

/** Diff 文本内容内存缓存：repoPath:isStaged:filePath -> text */
const diffContentCache = new Map<string, string>();

/** 清空指定仓库或全部的缓存 */
export function clearDiffContentCache(repoPath?: string): void {
  if (!repoPath) {
    diffContentCache.clear();
    return;
  }
  for (const key of Array.from(diffContentCache.keys())) {
    if (key.startsWith(`${repoPath}:`)) {
      diffContentCache.delete(key);
    }
  }
}

export function useGitWorkspaceSearch(repoPathRef: Ref<string>) {
  const isSearching = ref(false);
  const searchResults = ref<GitSearchResultFileItem[]>([]);
  let currentSearchToken = 0;

  // 当仓库状态刷新时，清空当前仓库的缓存以确保内容最新
  watch(
    currentStatus,
    () => {
      if (repoPathRef.value) {
        clearDiffContentCache(repoPathRef.value);
      }
      triggerSearch();
    },
    { deep: false }
  );

  /** 加载或从缓存中获取文件的检索文本 */
  const getFileSearchContent = async (
    repoPath: string,
    filePath: string,
    isStaged: boolean
  ): Promise<string> => {
    const cacheKey = `${repoPath}:${isStaged ? "1" : "0"}:${filePath}`;
    if (diffContentCache.has(cacheKey)) {
      return diffContentCache.get(cacheKey) || "";
    }

    const diff = await loadFileDiff(repoPath, filePath, isStaged);
    if (!diff || diff.isBinary) {
      diffContentCache.set(cacheKey, "");
      return "";
    }

    // deleted 文件取 original，其余文件取 modified 变更后代码
    const content = diff.modified || diff.original || "";
    diffContentCache.set(cacheKey, content);
    return content;
  };

  /** 执行实际的检索逻辑 */
  const executeSearch = async () => {
    const keyword = fileSearchKeyword.value.trim();
    const repoPath = repoPathRef.value;

    if (!keyword || !repoPath || repoPath === "__panorama__") {
      searchResults.value = [];
      isSearching.value = false;
      return;
    }

    const searchToken = ++currentSearchToken;
    isSearching.value = true;

    try {
      const stagedList = currentStatus.value?.staged || [];
      const unstagedList = currentStatus.value?.unstaged || [];

      interface Candidate {
        file: FileStatus;
        isStaged: boolean;
      }

      const candidates: Candidate[] = [
        ...stagedList.map((f) => ({ file: f, isStaged: true })),
        ...unstagedList.map((f) => ({ file: f, isStaged: false })),
      ];

      const results: GitSearchResultFileItem[] = [];

      // 并发检索各候选文件
      await Promise.all(
        candidates.map(async ({ file, isStaged }) => {
          if (searchToken !== currentSearchToken) return;

          const fileName = getFileName(file.path);
          const fileDir = getFileDir(file.path);
          const lowerKw = keyword.toLowerCase();
          const hasFileNameMatch =
            fileName.toLowerCase().includes(lowerKw) ||
            fileDir.toLowerCase().includes(lowerKw);

          const fileNameParts = highlightTextParts(fileName, keyword);
          const dirParts = highlightTextParts(fileDir, keyword);

          // 获取文本内容并检索匹配行
          let contentResult: FileDiffSearchResult = {
            matches: [],
            totalMatches: 0,
            remainingCount: 0,
          };

          if (!file.isBinary) {
            const content = await getFileSearchContent(
              repoPath,
              file.path,
              isStaged
            );
            if (searchToken !== currentSearchToken) return;
            if (content) {
              contentResult = searchContentMatches(content, keyword, 3);
            }
          }

          // 只要文件名或内容有匹配就纳入结果
          if (hasFileNameMatch || contentResult.totalMatches > 0) {
            results.push({
              path: file.path,
              status: file.status,
              isStaged,
              fileName,
              fileDir,
              fileNameParts,
              dirParts,
              hasFileNameMatch,
              contentResult,
            });
          }
        })
      );

      if (searchToken === currentSearchToken) {
        // 排序规则：先按是否有内容匹配/匹配数降序，再按文件名
        results.sort((a, b) => {
          if (b.contentResult.totalMatches !== a.contentResult.totalMatches) {
            return b.contentResult.totalMatches - a.contentResult.totalMatches;
          }
          return a.path.localeCompare(b.path);
        });

        searchResults.value = results;
      }
    } finally {
      if (searchToken === currentSearchToken) {
        isSearching.value = false;
      }
    }
  };

  const triggerSearch = useDebounceFn(executeSearch, 150);

  // 监听关键词变化
  watch(fileSearchKeyword, () => {
    triggerSearch();
  });

  // 监听仓库切换
  watch(repoPathRef, () => {
    searchResults.value = [];
    isSearching.value = false;
    triggerSearch();
  });

  const totalMatchedFiles = computed(() => searchResults.value.length);
  const totalMatchedLines = computed(() =>
    searchResults.value.reduce(
      (sum, item) => sum + item.contentResult.totalMatches,
      0
    )
  );

  /** 打开目标文件 */
  const openSearchResult = (item: GitSearchResultFileItem) => {
    if (item.status === "A" && !item.isStaged) {
      openFileTab(item.path, item.isStaged);
    } else {
      openDiffTab(item.path, item.isStaged);
    }
  };

  return {
    isSearching,
    searchResults,
    totalMatchedFiles,
    totalMatchedLines,
    openSearchResult,
  };
}
