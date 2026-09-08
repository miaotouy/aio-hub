import { describe, it, expect, vi } from "vitest";
import { effectScope, ref } from "vue";
import {
  brightnessLevelsFor,
  clampThresholds,
  insertBrightnessThreshold,
  BRIGHTNESS_PRESETS,
} from "../brightnessThresholds";
import {
  clonePresetValue,
  defaultPresetState,
  normalizePresetState,
  presetNameError,
  suggestPresetName,
} from "../classificationPresets";
import {
  batchOrganizerConfigManager,
  createDefaultBatchOrganizerConfig,
  classifyBrightness,
  useBatchClassification,
  createDefaultColorPoints,
  createArchiveItems,
  makeCsv,
  type BatchAnalysisItem,
  type BatchFilterState,
} from "../batchColorOrganizer";

describe("variable brightness classification", () => {
  it.each(BRIGHTNESS_PRESETS)(
    "uses every interval and sends exact boundaries to the brighter band: $name",
    (preset) => {
      const levels = brightnessLevelsFor(preset.thresholds.length);
      expect(classifyBrightness(0, preset.thresholds)).toBe(levels[0]);
      expect(classifyBrightness(1, preset.thresholds)).toBe(
        levels[levels.length - 1]
      );
      preset.thresholds.forEach((threshold, index) => {
        expect(classifyBrightness(threshold - 0.001, preset.thresholds)).toBe(
          levels[index]
        );
        expect(classifyBrightness(threshold, preset.thresholds)).toBe(
          levels[index + 1]
        );
      });
    }
  );
  it("retains valid counts, separates colliding handles and inserts into the darkest widest interval", () => {
    expect(clampThresholds([0.8, 0.2])).toEqual([0.2, 0.8]);
    expect(clampThresholds([1, 1, 1, 1])).toEqual([0.96, 0.97, 0.98, 0.99]);
    expect(clampThresholds([-1, -1])).toEqual([0.01, 0.02]);
    expect(clampThresholds([])).toEqual([0.2, 0.4, 0.6, 0.8]);
    expect(clampThresholds([NaN])).toEqual([0.2, 0.4, 0.6, 0.8]);
    expect(insertBrightnessThreshold([0.5])).toEqual({
      values: [0.25, 0.5],
      index: 0,
    });
    expect(insertBrightnessThreshold([0.2, 0.4, 0.6, 0.8]).index).toBe(-1);
  });
  it("removes obsolete brightness filters and reprojects archive/report data without modifying analysis", () => {
    const scope = effectScope();
    scope.run(() => {
      const source = ref<BatchAnalysisItem[]>([
        {
          path: "one",
          fileName: "one.png",
          extension: "png",
          size: 10,
          isNetwork: false,
          status: "success",
          averageColor: "#888888",
          luminance: 0.5,
        },
      ]);
      const thresholds = ref([0.2, 0.4, 0.6, 0.8]);
      const filter = ref<BatchFilterState>({
        colorSource: "average",
        colorFamilies: [],
        brightnessLevels: ["中等"],
      });
      const state = useBatchClassification(
        source,
        ref(createDefaultColorPoints()),
        thresholds,
        filter
      );
      state.setSelected(state.classifiedItems.value[0], true);
      thresholds.value = [0.5];
      expect(filter.value.brightnessLevels).toEqual([]);
      expect(state.classifiedItems.value[0].brightnessLevel).toBe("明亮");
      expect(
        createArchiveItems(state.classifiedItems.value)[0].brightnessLevel
      ).toBe("明亮");
      expect(makeCsv(state.classifiedItems.value)).toContain("明亮");
      expect(source.value[0]).not.toHaveProperty("brightnessLevel");
      filter.value.brightnessLevels = ["偏暗"];
      expect(state.selectedPaths.size).toBe(0);
    });
    scope.stop();
  });
});
describe("preset persistence boundaries", () => {
  it("does not let a queued autosave overwrite an explicit preset save", async () => {
    vi.useFakeTimers();
    try {
      const config = createDefaultBatchOrganizerConfig();
      batchOrganizerConfigManager.saveDebounced(config);
      config.brightnessPresets = [
        { id: "custom:latest", name: "最新", thresholds: [0.5] },
      ];
      await batchOrganizerConfigManager.save(config);
      await vi.advanceTimersByTimeAsync(600);
      expect(
        (await batchOrganizerConfigManager.load()).brightnessPresets[0].id
      ).toBe("custom:latest");
      await batchOrganizerConfigManager.save(
        createDefaultBatchOrganizerConfig()
      );
    } finally {
      vi.useRealTimers();
    }
  });
  it("restores saved presets, selected identities and independent unsaved edits", async () => {
    const config = createDefaultBatchOrganizerConfig();
    config.brightnessPresets = [
      { id: "custom:test", name: "测试", thresholds: [0.5] },
    ];
    config.selectedBrightnessPreset = "custom:test";
    config.thresholds = [0.35];
    config.colorPresets = [
      {
        id: "custom:color",
        name: "色系测试",
        colorPoints: clonePresetValue(config.colorPoints),
      },
    ];
    config.selectedColorPreset = "custom:color";
    config.colorPoints[0].name = "中性";
    await batchOrganizerConfigManager.save(config);
    const restored = await batchOrganizerConfigManager.load();
    expect(restored.thresholds).toEqual([0.35]);
    expect(restored.brightnessPresets[0].thresholds).toEqual([0.5]);
    expect(restored.selectedBrightnessPreset).toBe("custom:test");
    expect(restored.colorPoints[0].name).toBe("中性");
    expect(restored.colorPresets[0].colorPoints[0].name).toBe("灰");
    restored.colorPoints[0].name = "改变";
    expect(restored.colorPresets[0].colorPoints[0].name).toBe("灰");
    await batchOrganizerConfigManager.save(createDefaultBatchOrganizerConfig());
  });
  it("rejects invalid records and resolves missing references without fabricating a preset", () => {
    const state = normalizePresetState({
      ...defaultPresetState(),
      brightnessPresets: [
        { id: "builtin:five", name: "覆盖内置", thresholds: [0.5] },
        { id: "custom:bad", name: "损坏", thresholds: [] },
        { id: "custom:ok", name: " 正常 ", thresholds: [0.5] },
      ],
      selectedBrightnessPreset: "custom:missing",
    });
    expect(state.brightnessPresets).toEqual([
      { id: "custom:ok", name: "正常", thresholds: [0.5] },
    ]);
    expect(state.selectedBrightnessPreset).toBeNull();
    expect(presetNameError("  ", [])).not.toBe("");
    expect(presetNameError(" 正常 ", ["正常"])).not.toBe("");
    expect(suggestPresetName("副本", ["副本", "副本 2"])).toBe("副本 3");
  });
});
