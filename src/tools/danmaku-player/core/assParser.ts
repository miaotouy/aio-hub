import type { ParsedDanmaku, AssScriptInfo, DanmakuType } from "../types";

/**
 * 解析 ASS 时间戳 (H:MM:SS.CC) 为秒
 */
function parseAssTime(timeStr: string): number {
  const parts = timeStr.split(":");
  if (parts.length !== 3) return 0;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const s = parseFloat(parts[2]);
  return h * 3600 + m * 60 + s;
}

/**
 * BGR 颜色转换为 RGB (#RRGGBB)
 */
function assBgrToRgb(color: string): string {
  // \c&HBBGGRR& -> #RRGGBB
  const match = color.match(/&H([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})&/);
  if (!match) return "#FFFFFF";
  return `#${match[3]}${match[2]}${match[1]}`;
}

/**
 * 剥离 UTF-8 BOM
 */
function stripBOM(content: string): string {
  if (content.charCodeAt(0) === 0xfeff) {
    return content.slice(1);
  }
  return content;
}

export function parseAss(content: string): {
  info: AssScriptInfo;
  danmakus: ParsedDanmaku[];
} {
  const lines = stripBOM(content).split(/\r?\n/);
  const info: AssScriptInfo = { playResX: 1836, playResY: 1032 }; // 默认值
  const danmakus: ParsedDanmaku[] = [];

  let currentSection = "";
  const styles: Record<string, { fontSize: number; isBold: boolean }> = {};

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith(";")) continue;

    if (line.startsWith("[") && line.endsWith("]")) {
      currentSection = line.slice(1, -1);
      continue;
    }

    if (currentSection === "Script Info") {
      if (line.startsWith("PlayResX:")) {
        info.playResX = parseInt(line.split(":")[1].trim(), 10);
      } else if (line.startsWith("PlayResY:")) {
        info.playResY = parseInt(line.split(":")[1].trim(), 10);
      }
    } else if (currentSection === "V4+ Styles") {
      if (line.startsWith("Style:")) {
        const parts = line.split(":")[1].split(",");
        const name = parts[0].trim();
        const fontSize = parseFloat(parts[2]);
        const isBold = parts[7].trim() === "-1" || parts[7].trim() === "1";
        styles[name] = { fontSize, isBold };
      }
    } else if (currentSection === "Events") {
      if (line.startsWith("Dialogue:")) {
        const parts = line.split(",");
        if (parts.length < 10) continue;

        const startTime = parseAssTime(parts[1].trim());
        const endTime = parseAssTime(parts[2].trim());
        const styleName = parts[3].trim();
        const style = styles[styleName] || { fontSize: 52, isBold: true };

        // 合并剩余部分作为内容，因为文本中可能包含逗号
        const contentPart = parts.slice(9).join(",");

        // 匹配指令块 {...}
        const tagMatch = contentPart.match(/\{([^}]+)\}/);
        const tags = tagMatch ? tagMatch[1] : "";
        const text = contentPart.replace(/\{[^}]+\}/g, "").trim();

        if (!text) continue;

        // 识别隐藏弹幕
        if (tags.includes("\\pos(0,-999)")) continue;

        let type: DanmakuType = "scroll";
        let x1 = 0,
          y1 = 0,
          x2: number | undefined,
          y2: number | undefined;
        let t1: number | undefined, t2: number | undefined;

        // 解析 \move(x1,y1,x2,y2,t1,t2)
        const moveMatch = tags.match(/\\move\(([^,]+),([^,]+),([^,]+),([^,]+)(?:,([^,]+),([^,]+))?\)/);
        if (moveMatch) {
          type = "scroll";
          x1 = parseFloat(moveMatch[1]);
          y1 = parseFloat(moveMatch[2]);
          x2 = parseFloat(moveMatch[3]);
          y2 = parseFloat(moveMatch[4]);
          t1 = moveMatch[5] ? parseFloat(moveMatch[5]) : 0;
          t2 = moveMatch[6] ? parseFloat(moveMatch[6]) : (endTime - startTime) * 1000;
        } else {
          // 解析 \pos(x,y)
          const posMatch = tags.match(/\\pos\(([^,]+),([^,]+)\)/);
          if (posMatch) {
            x1 = parseFloat(posMatch[1]);
            y1 = parseFloat(posMatch[2]);
            type = y1 < info.playResY / 2 ? "top" : "bottom";
          }
        }

        // 解析颜色 \c&HBBGGRR&
        const colorMatch = tags.match(/\\c&H[0-9A-Fa-f]{6}&/);
        const color = colorMatch ? assBgrToRgb(colorMatch[0]) : "#FFFFFF";

        danmakus.push({
          id: Math.random().toString(36).slice(2, 9),
          startTime,
          endTime,
          text,
          type,
          color,
          fontSize: style.fontSize,
          isBold: style.isBold,
          x1,
          y1,
          x2,
          y2,
          t1,
          t2,
        });
      }
    }
  }

  return { info, danmakus };
}
