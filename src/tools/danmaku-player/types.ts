export type DanmakuType = "scroll" | "top" | "bottom";

export interface ParsedDanmaku {
  id: string;
  startTime: number; // 秒
  endTime: number; // 秒
  text: string;
  type: DanmakuType;
  color: string; // #RRGGBB
  fontSize: number;
  isBold: boolean;

  // 坐标相关 (基于 PlayResX/PlayResY)
  x1: number;
  y1: number;
  x2?: number; // 仅 move 有
  y2?: number; // 仅 move 有
  t1?: number; // move 开始相对偏移 (ms)
  t2?: number; // move 结束相对偏移 (ms)
}

export interface AssScriptInfo {
  playResX: number;
  playResY: number;
}

export interface DanmakuConfig {
  version: string;
  enabled: boolean;

  // 类型过滤
  showScroll: boolean;
  showFixed: boolean;
  showColored: boolean;

  // 显示调整
  displayArea: number; // 0-100
  opacity: number; // 0-100
  fontScale: number; // 50-200
  speed: number; // 0.5-2.0

  // 防挡
  preventSubtitleOverlap: boolean;

  // 高级设置
  fontFamily: string;
  isBold: boolean;
  borderType: "glow" | "outline" | "shadow";

  // 屏蔽词
  blockKeywords: string[];
}
