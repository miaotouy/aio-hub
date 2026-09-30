// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { compareVersions, validate } from "compare-versions";
import { normalizeAppVersion, releaseNotesRegistry } from "./releaseNotesRegistry";

export interface OpenReleaseNotesInput {
  versions: string[];
  primaryVersion?: string;
}

/**
 * 解析应标记为「当前版本」的条目：
 * - 请求版本精确命中已注册版本时直接采用；
 * - 否则退回到不高于请求版本的最新一条（运行时版本可能领先于最近一条说明，
 *   例如 `0.7.0-alpha.6.build.*` 对应最近说明 `0.7.0-alpha.5`）；
 * - 无法比较时回退到列表首项。
 */
function resolvePrimaryVersion(
  requested: string | undefined,
  availableVersions: string[]
): string {
  if (!requested) return availableVersions[0];

  const normalized = normalizeAppVersion(requested);
  if (availableVersions.includes(normalized)) return normalized;
  if (!validate(normalized)) return availableVersions[0];

  let fallback: string | undefined;
  for (const version of availableVersions) {
    if (!validate(version)) continue;
    if (compareVersions(version, normalized) > 0) continue;
    if (!fallback || compareVersions(version, fallback) > 0) {
      fallback = version;
    }
  }
  return fallback ?? availableVersions[0];
}

export const useReleaseNotesViewerStore = defineStore(
  "releaseNotesViewer",
  () => {
    const visible = ref(false);
    const versions = ref<string[]>([]);
    const primaryVersion = ref<string>();
    const selectedVersion = ref<string>();

    const manifests = computed(() =>
      versions.value
        .map((version) => releaseNotesRegistry.get(version))
        .filter((manifest) => manifest !== undefined)
    );

    const history = computed(() => releaseNotesRegistry.getAll());

    function open(input: OpenReleaseNotesInput) {
      const availableVersions = [
        ...new Set(
          input.versions
            .map((version) => releaseNotesRegistry.get(version)?.version)
            .filter((version): version is string => version !== undefined)
        ),
      ];
      if (availableVersions.length === 0) {
        throw new Error("此构建未包含可显示的本地版本说明");
      }

      versions.value = availableVersions;
      primaryVersion.value = resolvePrimaryVersion(
        input.primaryVersion,
        availableVersions
      );
      selectedVersion.value = primaryVersion.value;
      visible.value = true;
    }

    function select(version: string) {
      if (!releaseNotesRegistry.get(version)) return;
      selectedVersion.value = version;
    }

    function close() {
      visible.value = false;
    }

    return {
      visible,
      versions,
      primaryVersion,
      selectedVersion,
      manifests,
      history,
      open,
      select,
      close,
    };
  }
);
