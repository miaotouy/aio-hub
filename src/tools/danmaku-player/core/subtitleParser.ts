// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import type {
  SubtitleCue,
  SubtitleFormat,
  SubtitleStyle,
  SubtitleTrack,
} from "../types";

interface ParseContext {
  fileName: string;
  format: SubtitleFormat;
  warnings: string[];
}

interface CueDraft {
  startTime: number;
  endTime: number;
  lines: string[];
  style?: SubtitleStyle;
}

const GRAPHIC_SUBTITLE_EXTENSIONS = new Set(["sup", "idx"]);
const MICRODVD_DEFAULT_FPS = 25;

function stripBOM(content: string): string {
  if (content.charCodeAt(0) === 0xfeff) {
    return content.slice(1);
  }
  return content;
}

function normalizeContent(content: string): string {
  return stripBOM(content).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function getExtension(fileName: string): string {
  const match = fileName.toLowerCase().match(/\.([^.]+)$/);
  return match?.[1] ?? "";
}

function getFileNameFromPath(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

function formatFromExtension(extension: string): SubtitleFormat {
  switch (extension) {
    case "srt":
      return "srt";
    case "vtt":
      return "vtt";
    case "ass":
      return "ass";
    case "ssa":
      return "ssa";
    case "lrc":
      return "lrc";
    case "sbv":
      return "sbv";
    case "smi":
    case "sami":
      return "sami";
    case "ttml":
    case "dfxp":
    case "xml":
      return "ttml";
    default:
      return "unknown";
  }
}

function parseTimestamp(value: string): number | null {
  const text = value.trim().replace(",", ".");

  const unitMatch = text.match(/^(\d+(?:\.\d+)?)(ms|s)$/i);
  if (unitMatch) {
    const amount = Number(unitMatch[1]);
    return unitMatch[2].toLowerCase() === "ms" ? amount / 1000 : amount;
  }

  const clockMatch = text.match(
    /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/
  );
  if (!clockMatch) return null;

  const hours = Number(clockMatch[1] ?? 0);
  const minutes = Number(clockMatch[2]);
  const seconds = Number(clockMatch[3]);
  const fraction = (clockMatch[4] ?? "").padEnd(3, "0").slice(0, 3);
  const milliseconds = fraction ? Number(fraction) : 0;

  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

function parseLrcTimestamp(value: string): number | null {
  const match = value.match(/^(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?$/);
  if (!match) return null;

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const fraction = (match[3] ?? "").padEnd(3, "0").slice(0, 3);
  const milliseconds = fraction ? Number(fraction) : 0;

  return minutes * 60 + seconds + milliseconds / 1000;
}

function parseAssTime(value: string): number | null {
  const match = value.trim().match(/^(\d+):(\d{2}):(\d{2})(?:[.](\d{1,3}))?$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const fraction = (match[4] ?? "").padEnd(3, "0").slice(0, 3);
  const milliseconds = fraction ? Number(fraction) : 0;

  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    const namedEntities: Record<string, string> = {
      amp: "&",
      apos: "'",
      gt: ">",
      lt: "<",
      nbsp: " ",
      quot: '"',
    };

    const normalized = entity.toLowerCase();
    if (normalized in namedEntities) {
      return namedEntities[normalized];
    }

    if (normalized.startsWith("#x")) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(codePoint)
        ? String.fromCodePoint(codePoint)
        : match;
    }

    if (normalized.startsWith("#")) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(codePoint)
        ? String.fromCodePoint(codePoint)
        : match;
    }

    return match;
  });
}

function cleanSubtitleLine(line: string): string {
  return decodeHtmlEntities(
    line
      .replace(/\\[Nn]/g, "\n")
      .replace(/\\h/g, " ")
      .replace(/\{\\[^}]*\}/g, "")
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\/?(?:i|b|u|font|span|ruby|rt|rp|c|v|lang)[^>]*>/gi, "")
      .replace(/<[^>]+>/g, "")
  ).trim();
}

function normalizeCueLines(lines: string[]): string[] {
  return lines
    .flatMap((line) => cleanSubtitleLine(line).split("\n"))
    .map((line) => line.trim())
    .filter(Boolean);
}

function createCue(index: number, draft: CueDraft): SubtitleCue | null {
  if (!Number.isFinite(draft.startTime) || !Number.isFinite(draft.endTime)) {
    return null;
  }
  if (draft.endTime <= draft.startTime) {
    return null;
  }

  const lines = normalizeCueLines(draft.lines);
  if (lines.length === 0) return null;

  return {
    id: `subtitle-${index}`,
    startTime: draft.startTime,
    endTime: draft.endTime,
    text: lines.join("\n"),
    lines,
    style: draft.style,
  };
}

function toCueList(drafts: CueDraft[]): SubtitleCue[] {
  return drafts
    .sort((a, b) => a.startTime - b.startTime)
    .map((draft, index) => createCue(index + 1, draft))
    .filter((cue): cue is SubtitleCue => cue !== null);
}

function splitBlocks(content: string): string[] {
  return content
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function parseSrt(content: string): CueDraft[] {
  const drafts: CueDraft[] = [];
  const timePattern =
    /(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})/;

  for (const block of splitBlocks(content)) {
    const lines = block.split("\n").map((line) => line.trim());
    const timeLineIndex = lines.findIndex((line) => timePattern.test(line));
    if (timeLineIndex === -1) continue;

    const match = lines[timeLineIndex].match(timePattern);
    if (!match) continue;

    const startTime = parseTimestamp(match[1]);
    const endTime = parseTimestamp(match[2]);
    if (startTime === null || endTime === null) continue;

    drafts.push({
      startTime,
      endTime,
      lines: lines.slice(timeLineIndex + 1),
    });
  }

  return drafts;
}

function parseVtt(content: string): CueDraft[] {
  const withoutHeader = content
    .replace(/^\s*WEBVTT[^\n]*(?:\n|$)/i, "")
    .replace(/\n(?:NOTE|STYLE|REGION)[\s\S]*?(?=\n{2,}|$)/gi, "\n");
  const drafts: CueDraft[] = [];
  const timePattern =
    /((?:\d{1,2}:)?\d{2}:\d{2}\.\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{2}:\d{2}\.\d{1,3})/;

  for (const block of splitBlocks(withoutHeader)) {
    const lines = block.split("\n").map((line) => line.trim());
    const timeLineIndex = lines.findIndex((line) => timePattern.test(line));
    if (timeLineIndex === -1) continue;

    const match = lines[timeLineIndex].match(timePattern);
    if (!match) continue;

    const startTime = parseTimestamp(match[1]);
    const endTime = parseTimestamp(match[2]);
    if (startTime === null || endTime === null) continue;

    drafts.push({
      startTime,
      endTime,
      lines: lines.slice(timeLineIndex + 1),
    });
  }

  return drafts;
}

function parseLrc(content: string): CueDraft[] {
  const entries: Array<{ time: number; line: string }> = [];

  for (const rawLine of content.split("\n")) {
    const matches = [
      ...rawLine.matchAll(/\[(\d{1,3}:\d{2}(?:[.:]\d{1,3})?)\]/g),
    ];
    if (matches.length === 0) continue;

    const text = rawLine.replace(/\[[^\]]+\]/g, "").trim();
    if (!text) continue;

    for (const match of matches) {
      const time = parseLrcTimestamp(match[1]);
      if (time !== null) {
        entries.push({ time, line: text });
      }
    }
  }

  entries.sort((a, b) => a.time - b.time);

  return entries.map((entry, index) => ({
    startTime: entry.time,
    endTime: entries[index + 1]?.time ?? entry.time + 4,
    lines: [entry.line],
  }));
}

function parseSbv(content: string): CueDraft[] {
  const drafts: CueDraft[] = [];
  const timePattern =
    /((?:\d+:)?\d{1,2}:\d{2}\.\d{1,3}),((?:\d+:)?\d{1,2}:\d{2}\.\d{1,3})/;

  for (const block of splitBlocks(content)) {
    const lines = block.split("\n").map((line) => line.trim());
    const match = lines[0]?.match(timePattern);
    if (!match) continue;

    const startTime = parseTimestamp(match[1]);
    const endTime = parseTimestamp(match[2]);
    if (startTime === null || endTime === null) continue;

    drafts.push({
      startTime,
      endTime,
      lines: lines.slice(1),
    });
  }

  return drafts;
}

function parseSubViewer(content: string): CueDraft[] {
  const drafts: CueDraft[] = [];
  const timePattern =
    /(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})\s*,\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})/;

  for (const block of splitBlocks(content)) {
    const lines = block.split("\n").map((line) => line.trim());
    const timeLineIndex = lines.findIndex((line) => timePattern.test(line));
    if (timeLineIndex === -1) continue;

    const match = lines[timeLineIndex].match(timePattern);
    if (!match) continue;

    const startTime = parseTimestamp(match[1]);
    const endTime = parseTimestamp(match[2]);
    if (startTime === null || endTime === null) continue;

    drafts.push({
      startTime,
      endTime,
      lines: lines
        .slice(timeLineIndex + 1)
        .map((line) => line.replace(/\|/g, "\n")),
    });
  }

  return drafts;
}

function parseMicroDvd(content: string, context: ParseContext): CueDraft[] {
  const drafts: CueDraft[] = [];
  const linePattern = /^\{(\d+)\}\{(\d+)\}(.*)$/;

  for (const line of content.split("\n")) {
    const match = line.trim().match(linePattern);
    if (!match) continue;

    const startFrame = Number(match[1]);
    const endFrame = Number(match[2]);
    if (!Number.isFinite(startFrame) || !Number.isFinite(endFrame)) continue;

    drafts.push({
      startTime: startFrame / MICRODVD_DEFAULT_FPS,
      endTime: endFrame / MICRODVD_DEFAULT_FPS,
      lines: [match[3].replace(/\|/g, "\n")],
    });
  }

  if (drafts.length > 0) {
    context.warnings.push("MicroDVD 字幕未声明帧率，已按 25fps 解析。");
  }

  return drafts;
}

function assBgrToRgb(color: string): string | undefined {
  const match = color.match(
    /&H(?:[0-9A-Fa-f]{2})?([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})&?/
  );
  if (!match) return undefined;
  return `#${match[3]}${match[2]}${match[1]}`;
}

function splitAssFields(value: string, fieldCount: number): string[] {
  const fields: string[] = [];
  let rest = value;

  for (let index = 0; index < fieldCount - 1; index++) {
    const commaIndex = rest.indexOf(",");
    if (commaIndex === -1) {
      fields.push(rest.trim());
      rest = "";
      continue;
    }
    fields.push(rest.slice(0, commaIndex).trim());
    rest = rest.slice(commaIndex + 1);
  }

  fields.push(rest.trim());
  return fields;
}

/** Effect 字段值中表示特效生成行的关键字 */
const ASS_EFFECT_SKIP_KEYWORDS = [
  "fx",
  "karaoke",
  "banner",
  "scroll up",
  "scroll down",
  "template",
  "code",
];

/**
 * 检测 ASS 文本是否包含绘图模式 (\p1 及以上)。
 * 绘图模式下文本内容是矢量指令而非可读字符。
 */
function isAssDrawingMode(text: string): boolean {
  return /\\p([1-9]\d*)\b/.test(text);
}

/**
 * 检测 ASS 行的首标签块是否将主体文本设为完全透明。
 * 这类行通常是叠加描边/阴影的辅助层，降级后无意义。
 */
function isFullyTransparentPrimary(text: string): boolean {
  // 检查行首覆盖标签块中是否存在 \1a&HFF& 或 \alpha&HFF&
  const leadingTag = text.match(/^\{([^}]*)\}/);
  if (!leadingTag) return false;
  const block = leadingTag[1];
  // \1a&HFF& 主体完全透明
  if (/\\1a&HFF&/i.test(block)) return true;
  // \alpha&HFF& 所有图层完全透明（且没有后续覆盖）
  if (
    /\\alpha&HFF&/i.test(block) &&
    !/\\[1234]a&H(?!FF)[0-9A-Fa-f]{2}&/i.test(block)
  )
    return true;
  return false;
}

function parseAss(content: string): CueDraft[] {
  const drafts: CueDraft[] = [];
  const styles: Record<string, SubtitleStyle> = {};
  let currentSection = "";
  let eventFormat = [
    "Layer",
    "Start",
    "End",
    "Style",
    "Name",
    "MarginL",
    "MarginR",
    "MarginV",
    "Effect",
    "Text",
  ];
  let styleFormat = [
    "Name",
    "Fontname",
    "Fontsize",
    "PrimaryColour",
    "SecondaryColour",
    "OutlineColour",
    "BackColour",
    "Bold",
    "Italic",
  ];

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith(";")) continue;

    if (line.startsWith("[") && line.endsWith("]")) {
      currentSection = line.slice(1, -1);
      continue;
    }

    if (currentSection === "V4+ Styles" || currentSection === "V4 Styles") {
      if (line.startsWith("Format:")) {
        styleFormat = line
          .slice("Format:".length)
          .split(",")
          .map((field) => field.trim());
      } else if (line.startsWith("Style:")) {
        const fields = splitAssFields(
          line.slice("Style:".length),
          styleFormat.length
        );
        const getStyleField = (name: string) => {
          const index = styleFormat.findIndex(
            (field) => field.toLowerCase() === name.toLowerCase()
          );
          return index === -1 ? undefined : fields[index];
        };
        const name = getStyleField("Name");
        if (!name) continue;
        const fontSize = Number(getStyleField("Fontsize"));
        const bold = getStyleField("Bold");
        const italic = getStyleField("Italic");
        const color = getStyleField("PrimaryColour");
        styles[name] = {
          color: color ? assBgrToRgb(color) : undefined,
          fontSize: Number.isFinite(fontSize) ? fontSize : undefined,
          isBold: bold === "-1" || bold === "1",
          isItalic: italic === "-1" || italic === "1",
        };
      }
    } else if (currentSection === "Events") {
      if (line.startsWith("Format:")) {
        eventFormat = line
          .slice("Format:".length)
          .split(",")
          .map((field) => field.trim());
      } else if (line.startsWith("Dialogue:")) {
        const fields = splitAssFields(
          line.slice("Dialogue:".length),
          eventFormat.length
        );
        const getEventField = (name: string) => {
          const index = eventFormat.findIndex(
            (field) => field.toLowerCase() === name.toLowerCase()
          );
          return index === -1 ? undefined : fields[index];
        };

        // --- 特效字幕降级过滤 ---

        // 1. 跳过 Effect 字段包含特效关键字的行（卡拉OK模板生成行等）
        const effect = (getEventField("Effect") ?? "").toLowerCase().trim();
        if (
          effect &&
          ASS_EFFECT_SKIP_KEYWORDS.some((kw) => effect.includes(kw))
        ) {
          continue;
        }

        const startTime = parseAssTime(getEventField("Start") ?? "");
        const endTime = parseAssTime(getEventField("End") ?? "");
        const text = getEventField("Text");
        if (startTime === null || endTime === null || !text) continue;

        // 2. 跳过绘图模式行（矢量绘图指令，不是可读文本）
        if (isAssDrawingMode(text)) continue;

        // 3. 跳过主体完全透明的辅助层（仅做描边/阴影叠加用）
        if (isFullyTransparentPrimary(text)) continue;

        const styleName = getEventField("Style") ?? "Default";
        const tagColor = text.match(/\\c&H[0-9A-Fa-f]{6}&/);

        drafts.push({
          startTime,
          endTime,
          lines: [text],
          style: {
            ...styles[styleName],
            color: tagColor
              ? assBgrToRgb(tagColor[0])
              : styles[styleName]?.color,
          },
        });
      }
    }
  }

  // 4. 去重：同一时间段、清除标签后文本相同的多层行只保留一条
  return deduplicateAssDrafts(drafts);
}

/**
 * 对 ASS 解析结果做去重：同一时间区间内文本相同的多层行合并为一条。
 * 典型场景：标题用多层 Dialogue 叠加描边/阴影/正文，降级后文字重复。
 */
function deduplicateAssDrafts(drafts: CueDraft[]): CueDraft[] {
  const seen = new Set<string>();
  const result: CueDraft[] = [];

  for (const draft of drafts) {
    // 用清除标签后的纯文本 + 时间区间作为去重 key
    const cleanText = draft.lines
      .map((l) => cleanSubtitleLine(l))
      .join("\n")
      .trim();
    if (!cleanText) continue;

    const key = `${draft.startTime.toFixed(3)}|${draft.endTime.toFixed(3)}|${cleanText}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(draft);
  }

  return result;
}

function parseSami(content: string): CueDraft[] {
  const syncPattern =
    /<sync\s+start\s*=\s*"?(\d+)"?[^>]*>([\s\S]*?)(?=<sync\s+start\s*=|<\/body>|<\/sami>|$)/gi;
  const syncs = [...content.matchAll(syncPattern)].map((match) => ({
    startTime: Number(match[1]) / 1000,
    body: match[2],
  }));

  return syncs.map((sync, index) => ({
    startTime: sync.startTime,
    endTime: syncs[index + 1]?.startTime ?? sync.startTime + 4,
    lines: [sync.body.replace(/&nbsp;/gi, " ")],
  }));
}

function parseTtmlTime(value: string): number | null {
  const frameMatch = value.match(/^(\d+):(\d{2}):(\d{2}):(\d{2})$/);
  if (frameMatch) {
    const hours = Number(frameMatch[1]);
    const minutes = Number(frameMatch[2]);
    const seconds = Number(frameMatch[3]);
    const frames = Number(frameMatch[4]);
    return hours * 3600 + minutes * 60 + seconds + frames / 25;
  }

  return parseTimestamp(value);
}

function parseTtml(content: string): CueDraft[] {
  const drafts: CueDraft[] = [];
  const pPattern = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;

  for (const match of content.matchAll(pPattern)) {
    const attrs = match[1];
    const body = match[2];
    const getAttr = (name: string) => {
      const attrMatch = attrs.match(
        new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i")
      );
      return attrMatch?.[1];
    };

    const begin = getAttr("begin");
    const end = getAttr("end");
    const dur = getAttr("dur");
    if (!begin) continue;

    const startTime = parseTtmlTime(begin);
    const endTime =
      end !== undefined
        ? parseTtmlTime(end)
        : dur !== undefined && startTime !== null
          ? startTime + (parseTtmlTime(dur) ?? 0)
          : null;

    if (startTime === null || endTime === null) continue;

    drafts.push({
      startTime,
      endTime,
      lines: [body],
    });
  }

  return drafts;
}

function parseSub(content: string, context: ParseContext): CueDraft[] {
  const subViewer = parseSubViewer(content);
  if (subViewer.length > 0) {
    context.format = "subviewer";
    return subViewer;
  }

  const microDvd = parseMicroDvd(content, context);
  if (microDvd.length > 0) {
    context.format = "microdvd";
    return microDvd;
  }

  return [];
}

function parseByFormat(content: string, context: ParseContext): CueDraft[] {
  switch (context.format) {
    case "srt":
      return parseSrt(content);
    case "vtt":
      return parseVtt(content);
    case "ass":
    case "ssa":
      return parseAss(content);
    case "lrc":
      return parseLrc(content);
    case "sbv":
      return parseSbv(content);
    case "sami":
      return parseSami(content);
    case "ttml":
      return parseTtml(content);
    case "subviewer":
    case "microdvd":
      return parseSub(content, context);
    case "unknown":
      return [];
  }
}

function autodetect(content: string, context: ParseContext): CueDraft[] {
  const detectors: Array<{
    format: SubtitleFormat;
    parse: () => CueDraft[];
  }> = [
    { format: "vtt", parse: () => parseVtt(content) },
    { format: "srt", parse: () => parseSrt(content) },
    { format: "ass", parse: () => parseAss(content) },
    { format: "lrc", parse: () => parseLrc(content) },
    { format: "sbv", parse: () => parseSbv(content) },
    { format: "sami", parse: () => parseSami(content) },
    { format: "ttml", parse: () => parseTtml(content) },
    { format: "subviewer", parse: () => parseSubViewer(content) },
    { format: "microdvd", parse: () => parseMicroDvd(content, context) },
  ];

  for (const detector of detectors) {
    const drafts = detector.parse();
    if (drafts.length > 0) {
      context.format = detector.format;
      return drafts;
    }
  }

  return [];
}

export function parseSubtitle(
  content: string,
  fileName: string
): { track: SubtitleTrack; warnings: string[] } {
  const normalizedFileName = getFileNameFromPath(fileName);
  const extension = getExtension(normalizedFileName);
  if (GRAPHIC_SUBTITLE_EXTENSIONS.has(extension)) {
    throw new Error("图形字幕暂不支持，请加载文本外挂字幕文件。");
  }

  const normalized = normalizeContent(content);
  if (!normalized.trim()) {
    throw new Error("字幕文件为空。");
  }
  if (normalized.includes("\0")) {
    throw new Error("该文件看起来不是文本字幕，图形字幕暂不支持。");
  }

  const context: ParseContext = {
    fileName: normalizedFileName,
    format: extension === "sub" ? "subviewer" : formatFromExtension(extension),
    warnings: [],
  };

  const drafts =
    context.format === "unknown"
      ? autodetect(normalized, context)
      : parseByFormat(normalized, context);
  const cues = toCueList(drafts);

  if (cues.length === 0) {
    throw new Error("不支持该字幕时间轴格式，或文件中没有可用字幕。");
  }

  // 对于 ASS/SSA 格式，保存原始内容供 JASSUB 高保真渲染
  const isAssFormat = context.format === "ass" || context.format === "ssa";

  return {
    track: {
      id: `subtitle-track-${Date.now().toString(36)}`,
      fileName: normalizedFileName,
      format: context.format,
      cues,
      enabled: true,
      rawContent: isAssFormat ? normalized : undefined,
    },
    warnings: context.warnings,
  };
}
