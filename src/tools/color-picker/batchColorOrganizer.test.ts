import { describe, expect, it } from "vitest";

import {
  calculateLuminance,
  classifyBrightness,
  classifyColor,
  matchesBatchFilter,
  BATCH_ARCHIVE_STRUCTURE_OPTIONS,
  createDefaultBatchOrganizerConfig,
  batchOrganizerConfigManager,
  type BatchImageItem,
} from "./batchColorOrganizer";

describe("batch color organizer rules", () => {
  it("keeps red hues on both sides of the 0/360 boundary", () => {
    expect(classifyColor(255, 8, 0)).toBe("红");
    expect(classifyColor(255, 0, 32)).toBe("红");
  });

  it("routes low saturation colors to gray", () => {
    expect(classifyColor(128, 132, 130)).toBe("灰");
  });

  it("separates dark orange into brown", () => {
    expect(classifyColor(92, 42, 18)).toBe("棕");
    expect(classifyColor(255, 128, 0)).toBe("橙");
  });

  it("uses the four brightness thresholds", () => {
    expect(classifyBrightness(0.1)).toBe("极暗");
    expect(classifyBrightness(0.3)).toBe("偏暗");
    expect(classifyBrightness(0.5)).toBe("中等");
    expect(classifyBrightness(0.7)).toBe("偏亮");
    expect(classifyBrightness(0.9)).toBe("明亮");
  });

  it("ignores fully transparent pixels at the sampling boundary", () => {
    expect(calculateLuminance(0, 0, 0)).toBe(0);
    expect(calculateLuminance(255, 255, 255)).toBe(1);
  });

  it("combines dimensions with AND and values within a dimension with OR", () => {
    const item = {
      path: "C:/photo.png",
      fileName: "photo.png",
      extension: "png",
      size: 1,
      isNetwork: false,
      status: "success",
      selected: false,
      colorFamily: "蓝",
      brightnessLevel: "偏暗",
    } satisfies BatchImageItem;

    expect(
      matchesBatchFilter(item, {
        colorFamilies: ["蓝", "紫"],
        brightnessLevels: ["偏暗", "中等"],
      })
    ).toBe(true);
    expect(
      matchesBatchFilter(item, {
        colorFamilies: ["蓝"],
        brightnessLevels: ["明亮"],
      })
    ).toBe(false);
  });

  it("provides valid archive structure options", () => {
    expect(BATCH_ARCHIVE_STRUCTURE_OPTIONS).toHaveLength(4);
    const values = BATCH_ARCHIVE_STRUCTURE_OPTIONS.map((opt) => opt.value);
    expect(values).toContain("color_and_brightness");
    expect(values).toContain("brightness_only");
    expect(values).toContain("color_only");
    expect(values).toContain("brightness_and_color");
  });

  it("provides valid default config and config manager for batch color organizer", async () => {
    const defaultConfig = createDefaultBatchOrganizerConfig();
    expect(defaultConfig.version).toBe("1.0.0");
    expect(defaultConfig.maxDepth).toBe(3);
    expect(defaultConfig.thresholds).toEqual([0.2, 0.4, 0.6, 0.8]);
    expect(defaultConfig.archiveMode).toBe("copy");
    expect(defaultConfig.archiveStructure).toBe("color_and_brightness");

    const loaded = await batchOrganizerConfigManager.load();
    expect(loaded).toBeDefined();
    expect(loaded.version).toBe("1.0.0");
  });
});
