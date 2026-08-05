// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { releaseNotesRegistry } from "../releaseNotesRegistry";
import { useReleaseNotesViewerStore } from "../releaseNotesViewerStore";

beforeEach(() => {
  releaseNotesRegistry.clear();
  releaseNotesRegistry.register({
    version: "1.0.0",
    revision: 1,
    channel: "stable",
    title: "Version 1",
    summary: "Summary",
    publishedAt: "2026-08-05",
    body: "# Version 1",
  });
  setActivePinia(createPinia());
});

describe("release notes viewer", () => {
  it("opens registered notes as read-only UI state", () => {
    const viewer = useReleaseNotesViewerStore();
    viewer.open({ versions: ["1.0.0"], primaryVersion: "1.0.0" });

    expect(viewer.visible).toBe(true);
    expect(viewer.versions).toEqual(["1.0.0"]);
    expect(viewer.manifests).toHaveLength(1);

    viewer.close();
    expect(viewer.visible).toBe(false);
  });

  it("rejects versions that are not bundled in the local registry", () => {
    const viewer = useReleaseNotesViewerStore();
    expect(() => viewer.open({ versions: ["2.0.0"] })).toThrow(
      "此构建未包含可显示的本地版本说明"
    );
  });
});
