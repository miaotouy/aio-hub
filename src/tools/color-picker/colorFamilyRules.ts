export interface ColorFamilyRule {
  id: string;
  name: string;
  displayColor: string;
  hue: { all: boolean; start: number; end: number };
  saturation: [number, number];
  lightness: [number, number];
}

export const UNCLASSIFIED = {
  id: "unclassified",
  name: "未分类",
  displayColor: "#808080",
} as const;

export function createDefaultColorRules(): ColorFamilyRule[] {
  const rule = (
    id: string,
    name: string,
    displayColor: string,
    start: number,
    end: number
  ): ColorFamilyRule => ({
    id,
    name,
    displayColor,
    hue: { all: false, start, end },
    saturation: [0, 1],
    lightness: [0, 1],
  });
  return [
    {
      ...rule("gray", "灰", "#9ca3af", 0, 360),
      hue: { all: true, start: 0, end: 360 },
      saturation: [0, 0.12],
    },
    { ...rule("brown", "棕", "#a16207", 15, 42), lightness: [0, 0.35] },
    rule("red", "红", "#ef4444", 345, 15),
    rule("orange", "橙", "#f97316", 15, 42),
    rule("yellow", "黄", "#eab308", 42, 68),
    rule("green", "绿", "#22c55e", 68, 165),
    rule("cyan", "青", "#06b6d4", 165, 195),
    rule("blue", "蓝", "#3b82f6", 195, 255),
    rule("purple", "紫", "#a855f7", 255, 315),
    rule("pink", "粉", "#ec4899", 315, 345),
  ];
}

export function isSafeColorFamilyName(name: string): boolean {
  return (
    name.length > 0 &&
    !name.endsWith(".") &&
    !/[\\/:*?"<>|\x00-\x1f\x7f-\x9f]/.test(name) &&
    !/^(CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|COM[1-9¹²³]|LPT[1-9¹²³])(\..*)?$/i.test(
      name
    )
  );
}

export function validateColorRules(value: unknown): {
  rules?: ColorFamilyRule[];
  error?: string;
} {
  if (!Array.isArray(value)) return { error: "色系配置必须为列表" };
  const ids = new Set<string>();
  const names = new Set<string>([UNCLASSIFIED.name]);
  const rules: ColorFamilyRule[] = [];
  const validRange = (range: unknown): range is [number, number] =>
    Array.isArray(range) &&
    range.length === 2 &&
    range.every((v) => typeof v === "number" && Number.isFinite(v)) &&
    range[0] >= 0 &&
    range[1] <= 1 &&
    range[0] < range[1];
  for (const entry of value) {
    if (!entry || typeof entry !== "object")
      return { error: "色系规则格式无效" };
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    if (!isSafeColorFamilyName(name))
      return {
        error:
          "色系名称不能为空，或包含 Windows 不允许的目录名、字符、末尾点号",
      };
    if (names.has(name.toLowerCase()))
      return { error: `色系名称不能重复或使用“未分类”：${name}` };
    if (
      typeof entry.id !== "string" ||
      !entry.id.trim() ||
      entry.id === UNCLASSIFIED.id ||
      ids.has(entry.id)
    )
      return { error: "色系 ID 缺失或重复" };
    if (
      typeof entry.displayColor !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(entry.displayColor)
    )
      return { error: `${name}：请选择有效的展示色` };
    const hue = entry.hue;
    if (
      !hue ||
      typeof hue.all !== "boolean" ||
      !Number.isFinite(hue.start) ||
      !Number.isFinite(hue.end) ||
      hue.start < 0 ||
      hue.start >= 360 ||
      hue.end < 0 ||
      hue.end > 360 ||
      (!hue.all && hue.start === hue.end)
    )
      return { error: `${name}：色相范围无效，全部色相请使用开关` };
    if (!validRange(entry.saturation) || !validRange(entry.lightness))
      return {
        error: `${name}：饱和度和明度范围必须在 0–100% 内，且下限小于上限`,
      };
    ids.add(entry.id);
    names.add(name.toLowerCase());
    rules.push({
      id: entry.id,
      name,
      displayColor: entry.displayColor,
      hue: { all: hue.all, start: hue.start, end: hue.end },
      saturation: [entry.saturation[0], entry.saturation[1]],
      lightness: [entry.lightness[0], entry.lightness[1]],
    });
  }
  return { rules };
}

export function classifyHsl(
  hsl: readonly [number, number, number],
  rules: readonly ColorFamilyRule[]
) {
  const [h, s, l] = hsl;
  const inRange = (value: number, [min, max]: readonly number[]) =>
    value >= min && (value < max || (max === 1 && value === 1));
  return (
    rules.find((rule) => {
      const { all, start, end } = rule.hue;
      const hueMatches =
        all || (start < end ? h >= start && h < end : h >= start || h < end);
      return (
        hueMatches && inRange(s, rule.saturation) && inRange(l, rule.lightness)
      );
    }) ?? UNCLASSIFIED
  );
}
