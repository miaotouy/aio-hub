import { describe, expect, it } from "vitest";
import { effectScope, ref } from "vue";
import {
  classifyColorCoordinate,
  colorCoordinate,
  prepareColorPoints,
  colorFamilyCells,
  createDefaultColorPoints,
  createColorFamilyPreset,
  validateColorPoints,
  UNCLASSIFIED,
  type ColorFamilyPoint,
} from "../colorFamilyPoints";
import {
  applyBatchAnalysisResults,
  createArchiveItems,
  createDefaultBatchOrganizerConfig,
  makeCsv,
  mergeBatchOrganizerConfig,
  useBatchClassification,
  rgbToHsl,
  type BatchAnalysisItem,
  type BatchFilterState,
} from "../batchColorOrganizer";

const classify = (h: number, s: number, points = createDefaultColorPoints()) =>
  classifyColorCoordinate(colorCoordinate(h, s), prepareColorPoints(points));

// Protect nearest-site geometry, persisted settings and the archive write boundary.
describe("color family points", () => {
  it("wraps hue, treats gray as an ordinary site and assigns every valid color", () => {
    expect(classify(359, 1).id).toBe("red");
    expect(classify(1, 1).id).toBe("red");
    expect(classify(230, 0.1).id).toBe("gray");
    const gray = createDefaultColorPoints()[0];
    expect(classify(0, 1, [gray]).id).toBe("gray");
    expect(classify(0, 1, []).id).toBe(UNCLASSIFIED.id);
    const points = createDefaultColorPoints().filter((p) => p.id !== "gray");
    expect(classify(100, 0, points).id).not.toBe(UNCLASSIFIED.id);
  });
  it.each(["common", "basic"] as const)(
    "keeps near-neutral colors gray without swallowing muted hues in %s",
    (preset) => {
      const points = createColorFamilyPreset(preset);
      for (const point of points.filter((point) => point.id !== "gray")) {
        expect(classify(point.hue, 0.15, points).id).toBe("gray");
        expect(classify(point.hue, 0.35, points).id).toBe(point.id);
      }
    }
  );
  it("uses stable IDs for exact ties independent of list order", () => {
    const points: ColorFamilyPoint[] = [
      { id: "z", name: "红", hue: 0, saturation: 0.8 },
      { id: "a", name: "青", hue: 180, saturation: 0.8 },
    ];
    expect(classify(0, 0, points).id).toBe("a");
    expect(classify(0, 0, [...points].reverse()).id).toBe("a");
    expect(classify(0, 0.1, points).id).toBe("z");
  });
  it("does not use lightness to separate orange and brown", () => {
    for (const rgb of [
      [100, 50, 0],
      [200, 100, 0],
    ]) {
      const [h, s] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
      expect(classify(h, s).id).toBe("orange");
    }
  });
  it("keeps rendered cell interiors consistent with the nearest-site classifier", () => {
    for (const points of [
      createDefaultColorPoints(),
      createColorFamilyPreset("basic"),
      [
        { id: "a", name: "一", hue: 359, saturation: 0.98 },
        { id: "b", name: "二", hue: 140, saturation: 0.15 },
        { id: "c", name: "三", hue: 230, saturation: 0.7 },
      ],
    ]) {
      const sites = prepareColorPoints(points);
      const cells = colorFamilyCells(points);
      let checked = 0;
      for (let x = -0.97; x < 1; x += 0.09)
        for (let y = -0.97; y < 1; y += 0.09) {
          if (Math.hypot(x, y) >= 1) continue;
          const interiors = cells.filter((cell) =>
            cell.polygon.every((a, i, polygon) => {
              const b = polygon[(i + 1) % polygon.length];
              return (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) > 1e-9;
            })
          );
          if (interiors.length !== 1) continue;
          expect(classifyColorCoordinate({ x, y }, sites).id).toBe(
            interiors[0].id
          );
          checked++;
        }
      expect(checked).toBeGreaterThan(250);
    }
  });
  it("rejects unsafe or duplicate names, bad IDs and invalid coordinates", () => {
    for (const name of [
      "",
      "../red",
      "a/b",
      "a\\b",
      "a:b",
      "a*b",
      "a?b",
      'a"b',
      "a<b",
      "a>b",
      "a|b",
      "red.",
      "CON",
      "nul.txt",
      "COM1",
      "LPT²",
      "未分类",
    ]) {
      const point = { ...createDefaultColorPoints()[0], name };
      expect(validateColorPoints([point]).error, name).toBeTruthy();
    }
    for (const patch of [
      { id: "" },
      { id: "unclassified" },
      { hue: NaN },
      { hue: Infinity },
      { hue: -1 },
      { hue: 361 },
      { hue: "0" },
      { saturation: NaN },
      { saturation: -0.1 },
      { saturation: 1.1 },
    ]) {
      expect(
        validateColorPoints([{ ...createDefaultColorPoints()[0], ...patch }])
          .error
      ).toBeTruthy();
    }
    const points = createDefaultColorPoints().slice(0, 2);
    points[0].name = " Blue ";
    points[1].name = "blue";
    expect(validateColorPoints(points).error).toBeTruthy();
    points[1].name = "Red";
    expect(validateColorPoints(points).points?.[0].name).toBe("Blue");
    points[1].id = points[0].id;
    expect(validateColorPoints(points).error).toBeTruthy();
  });
  it("normalizes 360 and rejects overlap, including near-overlap and achromatic hues", () => {
    const point = { id: "red", name: "红", hue: 360, saturation: 1 };
    expect(validateColorPoints([point]).points?.[0].hue).toBe(0);
    expect(
      validateColorPoints([
        point,
        { ...point, id: "other", name: "其他", hue: 0 },
      ]).error
    ).toBeTruthy();
    expect(
      validateColorPoints([
        { ...point, saturation: 0 },
        { ...point, id: "other", name: "其他", hue: 120, saturation: 0 },
      ]).error
    ).toBeTruthy();
    expect(
      validateColorPoints([
        point,
        { ...point, id: "other", name: "其他", saturation: 1 - 0.5e-6 },
      ]).error
    ).toBeTruthy();
    expect(
      validateColorPoints([
        point,
        { ...point, id: "other", name: "其他", saturation: 1 - 2e-6 },
      ]).points
    ).toHaveLength(2);
  });
  it("round-trips new points, resets old rules, preserves preferences and an explicit empty list", () => {
    const defaults = createDefaultBatchOrganizerConfig();
    const old = {
      version: "2.0.0",
      directoryPath: "D:/photos",
      thresholds: [0.1, 0.3, 0.5, 0.7] as [number, number, number, number],
      archiveMode: "symlink" as const,
      colorRules: [],
    };
    const migrated = mergeBatchOrganizerConfig(defaults, old);
    expect(migrated).toMatchObject({
      version: "3.0.0",
      directoryPath: old.directoryPath,
      thresholds: old.thresholds,
      archiveMode: old.archiveMode,
      colorPoints: createDefaultColorPoints(),
    });
    expect(
      mergeBatchOrganizerConfig(defaults, { colorPoints: [] }).colorPoints
    ).toEqual([]);
    const custom = {
      ...defaults,
      colorPoints: createColorFamilyPreset("basic"),
    };
    expect(
      mergeBatchOrganizerConfig(defaults, JSON.parse(JSON.stringify(custom)))
    ).toEqual(custom);
    expect(
      mergeBatchOrganizerConfig(defaults, {
        colorPoints: [{ ...custom.colorPoints[0], saturation: NaN }],
      }).colorPoints
    ).toEqual(createDefaultColorPoints());
    const thresholds = mergeBatchOrganizerConfig(defaults, {
      thresholds: [NaN, 0, 1, 0.3],
    }).thresholds;
    expect(
      thresholds.every(
        (v, i) => v > 0 && v < 1 && (i === 0 || v > thresholds[i - 1])
      )
    ).toBe(true);
  });
});

describe("analysis/classification separation", () => {
  it("reprojects streaming, final and retried data without reanalysis; reports and archive use current classification", () => {
    const scope = effectScope();
    scope.run(() => {
      const source = ref<BatchAnalysisItem[]>(
        ["one", "two"].map((path) => ({
          path,
          fileName: `${path}.png`,
          extension: "png",
          size: 20,
          isNetwork: false,
          status: "pending",
        }))
      );
      const rules = ref(createDefaultColorPoints());
      const thresholds = ref<[number, number, number, number]>([
        0.2, 0.4, 0.6, 0.8,
      ]);
      const filter = ref<BatchFilterState>({
        colorFamilies: [],
        brightnessLevels: [],
      });
      const state = useBatchClassification(source, rules, thresholds, filter);
      const index = new Map(source.value.map((item) => [item.path, item]));
      const result = {
        path: "one",
        status: "success" as const,
        averageColor: "#0000ff",
        luminance: 0.3,
      };
      applyBatchAnalysisResults(index, [result]);
      const firstProjection = state.classifiedItems.value[0];
      state.setSelected(firstProjection, true);
      const groupBeforeSelection = state.groups.value;
      state.setSelected(firstProjection, false);
      expect(state.groups.value).toBe(groupBeforeSelection);
      state.setSelected(firstProjection, true);
      thresholds.value = [0.05, 0.1, 0.15, 0.2];
      const blue = rules.value.find((rule) => rule.id === "blue")!;
      filter.value = { colorFamilies: [blue.id], brightnessLevels: [] };
      blue.name = "海蓝";
      expect(state.selectedItems.value.map((item) => item.path)).toEqual([
        "one",
      ]);
      expect(state.groups.value[0]).toMatchObject({
        colorFamily: "海蓝",
        brightnessLevel: "明亮",
      });
      expect(makeCsv(state.classifiedItems.value)).toContain('"海蓝","明亮"');
      const archive = createArchiveItems(state.selectedItems.value);
      expect(archive[0]).toMatchObject({
        sourcePath: "one",
        colorFamily: "海蓝",
        brightnessLevel: "明亮",
      });
      blue.name = "深蓝";
      applyBatchAnalysisResults(index, [
        result,
        {
          path: "two",
          status: "failed",
          averageColor: null,
          luminance: null,
          error: "cancelled",
        },
      ]);
      expect(state.classifiedItems.value[0].colorFamily).toBe("深蓝");
      expect(archive[0].colorFamily).toBe("海蓝");
      applyBatchAnalysisResults(index, [{ ...result, path: "two" }]);
      expect(state.filteredItems.value).toHaveLength(2);
      expect(state.classifiedItems.value[1].error).toBeUndefined();
      expect(source.value[0]).not.toHaveProperty("colorFamily");
      filter.value = { colorFamilies: ["red"], brightnessLevels: [] };
      expect(state.selectedPaths.size).toBe(0);
      filter.value = { colorFamilies: ["blue"], brightnessLevels: [] };
      expect(state.selectedItems.value).toEqual([]);
      state.setSelected(state.classifiedItems.value[0], true);
      rules.value = [];
      expect(filter.value.colorFamilies).toEqual([]);
      expect(state.groups.value[0].colorFamily).toBe("未分类");
      expect(state.selectedItems.value).toHaveLength(1);
    });
    scope.stop();
  });
});
