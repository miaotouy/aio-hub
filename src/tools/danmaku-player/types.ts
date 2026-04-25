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

// ============ 外部播放器模式相关类型 ============

/** MPC-BE Web API 返回的播放状态 */
export interface MpcBeStatus {
  file: string;
  state: "Playing" | "Paused" | "Stopped";
  position: number; // 毫秒
  duration: number; // 毫秒
  volumeLevel: number; // 0-100
}

/** 播放器窗口信息（Rust 侧 find_player_windows 返回） */
export interface PlayerWindowInfo {
  hwnd: number;
  title: string;
  className: string;
  isVisible: boolean;
}

/** 窗口矩形信息（Rust 侧 get_player_window_rect 返回） */
export interface WindowRect {
  x: number; // 物理像素 X
  y: number; // 物理像素 Y
  width: number; // 物理像素宽度
  height: number; // 物理像素高度
  scaleFactor: number; // DPI 缩放系数
  isFullscreen: boolean;
}

/** 外部播放器连接配置 */
export interface ExternalPlayerConfig {
  /** 播放器类型 */
  playerType: "mpc-be" | "potplayer";
  /** Web API 端口 */
  webPort: number;
  /** 覆盖区域上边距（像素，窗口化模式） */
  offsetTop: number;
  /** 覆盖区域下边距（像素，窗口化模式） */
  offsetBottom: number;
  /** 全屏模式上边距（默认 0） */
  fullscreenOffsetTop: number;
  /** 全屏模式下边距（默认 0） */
  fullscreenOffsetBottom: number;
  /** 是否开启全屏覆盖增强（强制置顶） */
  enableFullscreenBoost: boolean;
}

/** 覆盖窗口同步状态 */
export interface OverlayState {
  /** 是否已连接到播放器 */
  connected: boolean;
  /** 目标播放器窗口句柄 */
  targetHwnd: number | null;
  /** 覆盖窗口是否已创建 */
  overlayCreated: boolean;
  /** 当前播放状态 */
  playbackState: "Playing" | "Paused" | "Stopped" | "Disconnected";
  /** 当前播放文件名 */
  currentFile: string;
  /** 当前进度（毫秒） */
  currentPosition: number;
  /** 总时长（毫秒） */
  totalDuration: number;
}
