// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { releaseNotesRegistry } from "./releaseNotesRegistry";

export interface OpenReleaseNotesInput {
  versions: string[];
  primaryVersion?: string;
}

export const useReleaseNotesViewerStore = defineStore(
  "releaseNotesViewer",
  () => {
    const visible = ref(false);
    const versions = ref<string[]>([]);
    const primaryVersion = ref<string>();

    const manifests = computed(() =>
      versions.value
        .map((version) => releaseNotesRegistry.get(version))
        .filter((manifest) => manifest !== undefined)
    );

    function open(input: OpenReleaseNotesInput) {
      const availableVersions = [...new Set(input.versions)].filter((version) =>
        releaseNotesRegistry.get(version)
      );
      if (availableVersions.length === 0) {
        throw new Error("此构建未包含可显示的本地版本说明");
      }

      versions.value = availableVersions;
      primaryVersion.value =
        input.primaryVersion && availableVersions.includes(input.primaryVersion)
          ? input.primaryVersion
          : availableVersions[0];
      visible.value = true;
    }

    function close() {
      visible.value = false;
    }

    return {
      visible,
      versions,
      primaryVersion,
      manifests,
      open,
      close,
    };
  }
);
