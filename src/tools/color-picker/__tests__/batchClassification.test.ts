import { describe, expect, it } from "vitest";
import { effectScope, ref } from "vue";
import {
  classifyHsl,
  createDefaultColorRules,
  validateColorRules,
  UNCLASSIFIED,
} from "../colorFamilyRules";
import {
  applyBatchAnalysisResults,
  createArchiveItems,
  createDefaultBatchOrganizerConfig,
  makeCsv,
  mergeBatchOrganizerConfig,
  useBatchClassification,
  type BatchAnalysisItem,
  type BatchFilterState,
} from "../batchColorOrganizer";

// Protect editable classification boundaries, persisted settings and the archive write boundary.
describe("editable color rules", () => {
  it("preserves default boundary ownership and wrapped red hue", () => {
    const rules = createDefaultColorRules();
    const name = (h: number, s = 1, l = 0.5) =>
      classifyHsl([h, s, l], rules).name;
    expect(name(0)).toBe("红");
    expect(name(359)).toBe("红");
    expect(name(15)).toBe("橙");
    expect(name(42)).toBe("黄");
    expect(name(200, 0.119)).toBe("灰");
    expect(name(200, 0.12)).toBe("蓝");
    expect(name(25, 1, 0.349)).toBe("棕");
    expect(name(25, 1, 0.35)).toBe("橙");
    expect(name(200, 1, 1)).toBe("蓝");
  });
  it("uses first matching rule and explicit unmatched fallback", () => {
    const first = createDefaultColorRules()[0];
    first.saturation = [0, 1];
    expect(
      classifyHsl([200, 1, 1], [first, ...createDefaultColorRules()]).id
    ).toBe(first.id);
    expect(classifyHsl([200, 1, 1], [])).toEqual(UNCLASSIFIED);
    const blue = createDefaultColorRules().find((rule) => rule.id === "blue")!;
    expect(classifyHsl([0, 1, 0.5], [blue])).toEqual(UNCLASSIFIED);
  });
  it("rejects ambiguous ranges and unsafe or colliding directory names", () => {
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
      "a\u0000b",
      "red.",
      "CON",
      "nul.txt",
      "COM1",
      "LPT²",
      "未分类",
    ]) {
      const rule = createDefaultColorRules()[0];
      rule.name = name;
      expect(validateColorRules([rule]).error, name).toBeTruthy();
    }
    const rules = createDefaultColorRules().slice(0, 2);
    rules[0].name = " Blue ";
    rules[1].name = "blue";
    expect(validateColorRules(rules).error).toBeTruthy();
    rules[1].name = "Brown";
    expect(validateColorRules(rules).rules?.[0].name).toBe("Blue");
    rules[0].hue = { all: false, start: 0, end: 0 };
    expect(validateColorRules(rules).error).toBeTruthy();
    rules[0].hue.all = true;
    expect(validateColorRules(rules).rules).toBeDefined();
    rules[0].lightness = [0.5, 0.5];
    expect(validateColorRules(rules).error).toBeTruthy();
  });
  it("migrates old preferences, repairs corrupt rules, and preserves an empty list", () => {
    const defaults = createDefaultBatchOrganizerConfig();
    const old = {
      version: "1.0.0",
      directoryPath: "C:/images",
      thresholds: [0.1, 0.3, 0.5, 0.7] as [number, number, number, number],
      archiveMode: "symlink" as const,
    };
    const migrated = mergeBatchOrganizerConfig(defaults, old);
    expect(migrated).toMatchObject({ ...old, version: "2.0.0" });
    expect(migrated.colorRules).toEqual(createDefaultColorRules());
    expect(
      mergeBatchOrganizerConfig(defaults, { colorRules: [] }).colorRules
    ).toEqual([]);
    const broken = createDefaultColorRules();
    broken[0].saturation = [NaN, 1];
    expect(
      mergeBatchOrganizerConfig(defaults, { colorRules: broken }).colorRules
    ).toEqual(createDefaultColorRules());
    const thresholds = mergeBatchOrganizerConfig(defaults, {
      thresholds: [0.99, 0.99] as unknown as [number, number, number, number],
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
      const rules = ref(createDefaultColorRules());
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
