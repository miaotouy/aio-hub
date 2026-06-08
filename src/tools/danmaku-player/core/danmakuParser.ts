import { parseAss } from "./assParser";
import type { AssScriptInfo, DanmakuType, ParsedDanmaku } from "../types";

export type DanmakuSourceFormat = "ass" | "json" | "xml";

export interface DanmakuParseResult {
  info: AssScriptInfo;
  danmakus: ParsedDanmaku[];
  format: DanmakuSourceFormat;
}

interface BilibiliDanmakuElem {
  id?: number | string;
  idStr?: string;
  progress?: number | string;
  mode?: number | string;
  fontsize?: number | string;
  color?: number | string;
  midHash?: string;
  content?: string;
  ctime?: number | string;
  weight?: number | string;
  action?: string;
  pool?: number | string;
  attr?: number | string;
}

interface NormalizedDanmaku {
  id: string;
  progress: number;
  mode: number;
  fontSize: number;
  color: number;
  content: string;
  index: number;
}

interface LaneState {
  availableAt: number;
}

const BILIBILI_SCRIPT_INFO: AssScriptInfo = {
  playResX: 1920,
  playResY: 1080,
};

const SCROLL_DURATION = 6;
const FIXED_DURATION = 4;
const BOTTOM_MARGIN_RATIO = 0.15;
const LANE_GAP = 8;

const FONT_SIZE_MAP = new Map<number, number>([
  [18, 36],
  [25, 52],
  [30, 64],
  [36, 72],
  [45, 90],
]);

function stripBOM(content: string): string {
  if (content.charCodeAt(0) === 0xfeff) {
    return content.slice(1);
  }
  return content;
}

function getExtension(fileName: string): string {
  return fileName.toLowerCase().match(/\.([^.]+)$/)?.[1] ?? "";
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n+/g, " ")
    .replace(/\{/g, "｛")
    .replace(/\}/g, "｝")
    .trim();
}

function decimalColorToRgb(color: number): string {
  const normalized = Math.max(0, Math.min(0xffffff, Math.trunc(color)));
  return `#${normalized.toString(16).padStart(6, "0").toUpperCase()}`;
}

function mapDanmakuType(mode: number): DanmakuType | null {
  switch (mode) {
    case 4:
      return "bottom";
    case 5:
      return "top";
    case 7:
    case 8:
      return null;
    case 1:
    case 2:
    case 3:
    case 6:
    default:
      return "scroll";
  }
}

function mapFontSize(fontSize: number): number {
  return FONT_SIZE_MAP.get(fontSize) ?? FONT_SIZE_MAP.get(25)!;
}

function estimateTextWidth(text: string, fontSize: number): number {
  let width = 0;

  for (const char of text) {
    width += char.charCodeAt(0) <= 0x7f ? fontSize * 0.55 : fontSize;
  }

  return Math.max(fontSize, width);
}

function createLaneAllocator(type: DanmakuType, fontSize: number) {
  const { playResY } = BILIBILI_SCRIPT_INFO;
  const usableHeight =
    type === "bottom" ? playResY : playResY * (1 - BOTTOM_MARGIN_RATIO);
  const lineHeight = Math.max(1, fontSize * 1.15);
  const laneCount = Math.max(1, Math.floor(usableHeight / lineHeight));
  const lanes: LaneState[] = Array.from({ length: laneCount }, () => ({
    availableAt: 0,
  }));

  return {
    lineHeight,
    pick(startTime: number, endTime: number, halfWidth: number) {
      let laneIndex = lanes.findIndex((lane) => lane.availableAt <= startTime);

      if (laneIndex === -1) {
        let earliest = Number.POSITIVE_INFINITY;
        laneIndex = 0;
        for (let index = 0; index < lanes.length; index++) {
          if (lanes[index].availableAt < earliest) {
            earliest = lanes[index].availableAt;
            laneIndex = index;
          }
        }
      }

      const lane = lanes[laneIndex];

      if (type === "scroll") {
        const distance = BILIBILI_SCRIPT_INFO.playResX + halfWidth * 2;
        const releaseOffset =
          SCROLL_DURATION * ((halfWidth * 2 + LANE_GAP) / distance);
        lane.availableAt = Math.min(endTime, startTime + releaseOffset);
      } else {
        lane.availableAt = endTime;
      }

      if (type === "bottom") {
        return playResY - lineHeight / 2 - laneIndex * lineHeight;
      }

      return lineHeight / 2 + laneIndex * lineHeight;
    },
  };
}

function normalizeElements(
  elements: BilibiliDanmakuElem[]
): NormalizedDanmaku[] {
  return elements
    .map((element, index) => {
      const id = String(
        element.idStr ??
          element.id ??
          `${toNumber(element.progress, 0)}-${index}`
      );
      return {
        id,
        progress: toNumber(element.progress, 0),
        mode: toNumber(element.mode, 1),
        fontSize: toNumber(element.fontsize, 25),
        color: toNumber(element.color, 16777215),
        content: normalizeText(element.content),
        index,
      };
    })
    .filter((element) => element.content.length > 0)
    .sort((a, b) => a.progress - b.progress || a.index - b.index);
}

function convertBilibiliElements(
  elements: BilibiliDanmakuElem[]
): ParsedDanmaku[] {
  const normalized = normalizeElements(elements);
  const laneAllocators = new Map<
    string,
    ReturnType<typeof createLaneAllocator>
  >();
  const danmakus: ParsedDanmaku[] = [];

  for (const element of normalized) {
    const type = mapDanmakuType(element.mode);
    if (type === null) continue;

    const startTime = element.progress / 1000;
    const duration = type === "scroll" ? SCROLL_DURATION : FIXED_DURATION;
    const endTime = startTime + duration;
    const fontSize = mapFontSize(element.fontSize);
    const halfWidth = estimateTextWidth(element.content, fontSize) / 2;
    const laneKey = `${type}:${fontSize}`;
    let allocator = laneAllocators.get(laneKey);

    if (!allocator) {
      allocator = createLaneAllocator(type, fontSize);
      laneAllocators.set(laneKey, allocator);
    }

    const y = allocator.pick(startTime, endTime, halfWidth);
    const parsed: ParsedDanmaku = {
      id: element.id,
      startTime,
      endTime,
      text: element.content,
      type,
      color: decimalColorToRgb(element.color),
      fontSize,
      isBold: false,
      x1:
        type === "scroll"
          ? BILIBILI_SCRIPT_INFO.playResX + halfWidth
          : BILIBILI_SCRIPT_INFO.playResX / 2,
      y1: y,
    };

    if (type === "scroll") {
      parsed.x2 = -halfWidth;
      parsed.y2 = y;
      parsed.t1 = 0;
      parsed.t2 = duration * 1000;
    }

    danmakus.push(parsed);
  }

  return danmakus;
}

function extractJsonElements(parsed: unknown): BilibiliDanmakuElem[] {
  if (Array.isArray(parsed)) {
    return parsed as BilibiliDanmakuElem[];
  }

  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    const candidates = [record.elems, record.danmakus, record.jsonDanmakus];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate as BilibiliDanmakuElem[];
      }
    }
  }

  return [];
}

function parseJsonDanmaku(content: string): DanmakuParseResult {
  const parsed = JSON.parse(stripBOM(content)) as unknown;
  const elements = extractJsonElements(parsed);
  const danmakus = convertBilibiliElements(elements);

  if (danmakus.length === 0) {
    throw new Error("JSON 中没有可用的 B 站弹幕。");
  }

  return {
    info: BILIBILI_SCRIPT_INFO,
    danmakus,
    format: "json",
  };
}

function parseXmlDanmaku(content: string): DanmakuParseResult {
  const document = new DOMParser().parseFromString(
    stripBOM(content),
    "application/xml"
  );

  if (document.querySelector("parsererror")) {
    throw new Error("XML 弹幕文件解析失败。");
  }

  const elements = [...document.querySelectorAll("d[p]")].map((element) => {
    const p = element.getAttribute("p") ?? "";
    const [time, mode, fontSize, color, ctime, pool, midHash, idStr] =
      p.split(",");

    return {
      idStr,
      progress: toNumber(time, 0) * 1000,
      mode,
      fontsize: fontSize,
      color,
      ctime,
      pool,
      midHash,
      content: element.textContent ?? "",
    };
  });

  const danmakus = convertBilibiliElements(elements);

  if (danmakus.length === 0) {
    throw new Error("XML 中没有可用的 B 站弹幕。");
  }

  return {
    info: BILIBILI_SCRIPT_INFO,
    danmakus,
    format: "xml",
  };
}

export function parseDanmaku(
  content: string,
  fileName: string
): DanmakuParseResult {
  const extension = getExtension(fileName);

  if (extension === "ass" || extension === "ssa") {
    return {
      ...parseAss(content),
      format: "ass",
    };
  }

  if (extension === "json") {
    return parseJsonDanmaku(content);
  }

  if (extension === "xml") {
    return parseXmlDanmaku(content);
  }

  throw new Error("弹幕文件仅支持 ASS、JSON 或 B 站 XML 格式。");
}
