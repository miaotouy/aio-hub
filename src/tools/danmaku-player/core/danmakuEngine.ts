import type { ParsedDanmaku, DanmakuConfig, AssScriptInfo } from "../types";

export class DanmakuEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private danmakus: ParsedDanmaku[] = [];
  private config: DanmakuConfig;
  private scriptInfo: AssScriptInfo;

  constructor(canvas: HTMLCanvasElement, config: DanmakuConfig, scriptInfo: AssScriptInfo) {
    this.canvas = canvas;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas context not available");
    this.ctx = context;
    this.config = config;
    this.scriptInfo = scriptInfo;
  }

  public setDanmakus(danmakus: ParsedDanmaku[]) {
    this.danmakus = danmakus;
  }

  public setConfig(config: DanmakuConfig) {
    this.config = config;
  }

  public setScriptInfo(info: AssScriptInfo) {
    this.scriptInfo = info;
  }

  public render(currentTime: number) {
    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);

    if (!this.config.enabled) return;

    // 筛选当前可见的弹幕
    const visibleDanmakus = this.danmakus.filter((dm) => {
      // 这里的 currentTime 是视频时间（秒）
      // 弹幕显示时间范围：[startTime, endTime]
      return currentTime >= dm.startTime && currentTime <= dm.endTime;
    });

    for (const dm of visibleDanmakus) {
      if (!this.shouldShow(dm)) continue;

      const pos = this.calculatePosition(dm, currentTime);

      // 检查显示区域限制 (0-100%)
      const maxDisplayY = (height * this.config.displayArea) / 100;
      if (pos.y > maxDisplayY) continue;

      this.drawDanmaku(dm, pos.x, pos.y);
    }
  }

  private shouldShow(dm: ParsedDanmaku): boolean {
    if (dm.type === "scroll" && !this.config.showScroll) return false;
    if ((dm.type === "top" || dm.type === "bottom") && !this.config.showFixed) return false;

    const isWhite = dm.color.toUpperCase() === "#FFFFFF";
    if (!isWhite && !this.config.showColored) return false;

    // 屏蔽词过滤
    if (this.config.blockKeywords.some((kw) => dm.text.includes(kw))) return false;

    return true;
  }

  private calculatePosition(dm: ParsedDanmaku, currentTime: number): { x: number; y: number } {
    const { width, height } = this.canvas;
    const scaleX = width / this.scriptInfo.playResX;
    const scaleY = height / this.scriptInfo.playResY;

    if (dm.type === "scroll" && dm.x2 !== undefined && dm.y2 !== undefined) {
      // 滚动弹幕使用 \move
      const startTimeMs = dm.startTime * 1000 + (dm.t1 || 0);
      const endTimeMs = dm.startTime * 1000 + (dm.t2 || (dm.endTime - dm.startTime) * 1000);

      // 考虑速度倍率：缩放动画持续时间
      const originalDuration = endTimeMs - startTimeMs;
      const adjustedDuration = originalDuration / this.config.speed;

      const progress = Math.min(Math.max((currentTime * 1000 - startTimeMs) / adjustedDuration, 0), 1);

      const x = dm.x1 + (dm.x2 - dm.x1) * progress;
      const y = dm.y1 + (dm.y2 - dm.y1) * progress;

      return { x: x * scaleX, y: y * scaleY };
    } else {
      // 固定弹幕使用 \pos
      return { x: dm.x1 * scaleX, y: dm.y1 * scaleY };
    }
  }

  private drawDanmaku(dm: ParsedDanmaku, x: number, y: number) {
    const ctx = this.ctx;
    const { height } = this.canvas;
    const fontScale = this.config.fontScale / 100;
    // 字体大小也需要按 PlayRes → 实际画布的比例缩放
    const canvasScale = height / this.scriptInfo.playResY;
    const fontSize = dm.fontSize * fontScale * canvasScale;
    const opacity = this.config.opacity / 100;

    ctx.save();

    // 设置字体
    const fontWeight = dm.isBold || this.config.isBold ? "bold" : "normal";
    ctx.font = `${fontWeight} ${fontSize}px ${this.config.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = opacity;

    // 应用描边样式
    this.applyBorderStyle(dm, fontSize, x, y);

    // 绘制文字
    ctx.fillStyle = dm.color;
    ctx.fillText(dm.text, x, y);

    ctx.restore();
  }

  private applyBorderStyle(dm: ParsedDanmaku, fontSize: number, x: number, y: number) {
    const ctx = this.ctx;
    const borderType = this.config.borderType;

    if (borderType === "outline") {
      ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
      ctx.lineWidth = Math.max(1, fontSize / 15);
      ctx.strokeText(dm.text, x, y);
    } else if (borderType === "shadow") {
      ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      ctx.shadowBlur = 2;
    } else if (borderType === "glow") {
      ctx.shadowColor = dm.color;
      ctx.shadowBlur = 4;
    }
  }
}
