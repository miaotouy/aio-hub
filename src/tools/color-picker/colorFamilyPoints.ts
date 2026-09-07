import { hslToRgb, rgbToHex } from "./composables/useColorConverter";

export interface ColorFamilyPoint {
  id: string;
  name: string;
  hue: number;
  saturation: number;
}
export interface ColorCoordinate {
  x: number;
  y: number;
}
export type ColorFamilyPreset = "common" | "basic";
export const COLOR_FAMILY_PRESETS = [
  { id: "common", name: "常用九色" },
  { id: "basic", name: "基础七色" },
] as const;
export const UNCLASSIFIED = {
  id: "unclassified",
  name: "未分类",
  displayColor: "#808080",
} as const;

export function createColorFamilyPreset(
  preset: ColorFamilyPreset
): ColorFamilyPoint[] {
  const point = (id: string, name: string, hue: number): ColorFamilyPoint => ({
    id,
    name,
    hue,
    saturation: 0.5,
  });
  const gray = { id: "gray", name: "灰", hue: 0, saturation: 0 };
  const red = point("red", "红", 0);
  const yellow = point("yellow", "黄", 60);
  const green = point("green", "绿", 120);
  const cyan = point("cyan", "青", 180);
  const blue = point("blue", "蓝", 240);
  return preset === "basic"
    ? [gray, red, yellow, green, cyan, blue, point("magenta", "品红", 300)]
    : [
        gray,
        red,
        point("orange", "橙", 30),
        yellow,
        green,
        cyan,
        blue,
        point("purple", "紫", 270),
        point("rose", "玫红", 330),
      ];
}
export const createDefaultColorPoints = () => createColorFamilyPreset("common");

export function colorCoordinate(
  hue: number,
  saturation: number
): ColorCoordinate {
  const angle = (hue * Math.PI) / 180;
  return { x: saturation * Math.cos(angle), y: saturation * Math.sin(angle) };
}
export function coordinateToColor({ x, y }: ColorCoordinate) {
  const saturation = Math.min(1, Math.hypot(x, y));
  return {
    hue:
      saturation === 0 ? 0 : ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360,
    saturation,
  };
}
export function colorPointDisplayColor(
  point: Pick<ColorFamilyPoint, "hue" | "saturation">
): string {
  const { r, g, b } = hslToRgb(point.hue, point.saturation * 100, 50);
  return rgbToHex(r, g, b);
}
export function prepareColorPoints(points: readonly ColorFamilyPoint[]) {
  return points.map((point) => ({
    ...point,
    ...colorCoordinate(point.hue, point.saturation),
  }));
}
export function classifyColorCoordinate(
  coordinate: ColorCoordinate,
  points: readonly (ColorFamilyPoint & ColorCoordinate)[]
) {
  let nearest: ColorFamilyPoint | undefined;
  let distance = Infinity;
  for (const point of points) {
    const next = (coordinate.x - point.x) ** 2 + (coordinate.y - point.y) ** 2;
    // A tiny tolerance absorbs trigonometric rounding at exact bisectors.
    if (
      next < distance - 1e-14 ||
      (Math.abs(next - distance) <= 1e-14 &&
        (!nearest || point.id < nearest.id))
    ) {
      nearest = point;
      distance = next;
    }
  }
  return nearest ?? UNCLASSIFIED;
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

export function validateColorPoints(value: unknown): {
  points?: ColorFamilyPoint[];
  error?: string;
} {
  if (!Array.isArray(value)) return { error: "色系配置必须为列表" };
  const ids = new Set<string>();
  const names = new Set<string>([UNCLASSIFIED.name]);
  const points: ColorFamilyPoint[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object")
      return { error: "色系点位格式无效" };
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
      typeof entry.hue !== "number" ||
      !Number.isFinite(entry.hue) ||
      entry.hue < 0 ||
      entry.hue > 360
    )
      return { error: `${name}：色相必须在 0–360° 内` };
    if (
      typeof entry.saturation !== "number" ||
      !Number.isFinite(entry.saturation) ||
      entry.saturation < 0 ||
      entry.saturation > 1
    )
      return { error: `${name}：饱和度必须在 0–100% 内` };
    const point = {
      id: entry.id,
      name,
      hue: entry.hue % 360,
      saturation: entry.saturation,
    };
    const position = colorCoordinate(point.hue, point.saturation);
    if (
      points.some((other) => {
        const p = colorCoordinate(other.hue, other.saturation);
        return Math.hypot(p.x - position.x, p.y - position.y) < 1e-6;
      })
    )
      return { error: `${name}：点位与其他色系重合，请调整位置` };
    ids.add(point.id);
    names.add(name.toLowerCase());
    points.push(point);
  }
  return { points };
}

// Clip each Voronoi cell to a bounding square; the renderer applies an exact
// circular SVG clip. Keeping bisectors straight avoids raster/classifier drift.
export function colorFamilyCells(points: readonly ColorFamilyPoint[]) {
  const sites = prepareColorPoints(points);
  return sites.map((site) => {
    let polygon: ColorCoordinate[] = [
      { x: -1, y: -1 },
      { x: 1, y: -1 },
      { x: 1, y: 1 },
      { x: -1, y: 1 },
    ];
    for (const other of sites) {
      if (other.id === site.id) continue;
      const nx = other.x - site.x,
        ny = other.y - site.y;
      const limit =
        (other.x ** 2 + other.y ** 2 - site.x ** 2 - site.y ** 2) / 2;
      const signed = (p: ColorCoordinate) => nx * p.x + ny * p.y - limit;
      const clipped: ColorCoordinate[] = [];
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i],
          b = polygon[(i + 1) % polygon.length];
        const da = signed(a),
          db = signed(b);
        if (da <= 0) clipped.push(a);
        if (da <= 0 !== db <= 0) {
          const t = da / (da - db);
          clipped.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
        }
      }
      polygon = clipped;
      if (!polygon.length) break;
    }
    return { id: site.id, polygon };
  });
}
