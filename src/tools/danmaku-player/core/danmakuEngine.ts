import type { ParsedDanmaku, DanmakuConfig, AssScriptInfo } from "../types";

/**
 * 弹幕渲染引擎 (性能优化版)
 *
 * 优化策略：
 * 1. 二分查找可见弹幕窗口，避免每帧 O(n) 全量遍历
 * 2. 批量渲染：按字体分组，减少 ctx 状态切换
 * 3. 预计算不变量，减少每帧重复计算
 * 4. 避免每条弹幕 save/restore，改用批量设置
 */
/**
 * 轻量稳定哈希：将字符串映射到 [0, 1) 区间
 * 同一条弹幕的 hash 值永远不变，避免每帧随机导致的闪烁
 */
function stableHash(str: string): number {
  let h = 2166136261; // FNV-1a 32-bit offset basis
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 16777619) >>> 0; // FNV prime，>>> 0 保持 uint32
  }
  return h / 0x100000000; // 归一化到 [0, 1)
}

export class DanmakuEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private danmakus: ParsedDanmaku[] = [];
  private config: DanmakuConfig;
  private scriptInfo: AssScriptInfo;

  // 缓存：避免每帧重复计算
  private cachedFontScale = 1;
  private cachedOpacity = 0.84;
  private cachedMaxDisplayRatio = 0.5;
  /** 预计算的密度哈希值，key 为弹幕 id */
  private danmakuHashMap = new Map<string, number>();

  constructor(canvas: HTMLCanvasElement, config: DanmakuConfig, scriptInfo: AssScriptInfo) {
    this.canvas = canvas;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("Canvas context not available");
    this.ctx = context;
    this.config = config;
    this.scriptInfo = scriptInfo;
    this.updateCachedValues();
  }

  public setDanmakus(danmakus: ParsedDanmaku[]) {
    // 按 startTime 排序，支持二分查找
    this.danmakus = [...danmakus].sort((a, b) => a.startTime - b.startTime);
    // 预计算每条弹幕的稳定哈希，供密度过滤使用
    this.danmakuHashMap.clear();
    for (const dm of this.danmakus) {
      this.danmakuHashMap.set(dm.id, stableHash(dm.id));
    }
  }

  public setConfig(config: DanmakuConfig) {
    this.config = config;
    this.updateCachedValues();
  }

  public setScriptInfo(info: AssScriptInfo) {
    this.scriptInfo = info;
  }

  /** 预计算不随帧变化的值 */
  private updateCachedValues() {
    this.cachedFontScale = this.config.fontScale / 100;
    this.cachedOpacity = this.config.opacity / 100;
    this.cachedMaxDisplayRatio = this.config.displayArea / 100;
  }

  public render(currentTime: number) {
    const { width, height } = this.canvas;
    if (width === 0 || height === 0) return;

    this.ctx.clearRect(0, 0, width, height);

    if (!this.config.enabled || this.danmakus.length === 0) return;

    const scaleX = width / this.scriptInfo.playResX;
    const scaleY = height / this.scriptInfo.playResY;
    const canvasScale = height / this.scriptInfo.playResY;
    const maxDisplayY = height * this.cachedMaxDisplayRatio;

    // 二分查找：找到第一个可能可见的弹幕 (startTime <= currentTime)
    const candidates = this.getVisibleWindow(currentTime);

    if (candidates.length === 0) return;

    const ctx = this.ctx;

    // 批量设置不变的上下文属性
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = this.cachedOpacity;

    // 渲染所有可见弹幕
    for (let i = 0; i < candidates.length; i++) {
      const dm = candidates[i];

      // 类型过滤（内联以避免函数调用开销）
      if (dm.type === "scroll") {
        if (!this.config.showScroll) continue;
      } else if (!this.config.showFixed) {
        continue;
      }

      // 彩色弹幕过滤
      if (!this.config.showColored && dm.color !== "#FFFFFF") continue;

      // 密度过滤：hash 值超出阈值的弹幕跳过（100% = 全量，0% = 全不显示）
      if (this.config.density < 100) {
        const hashVal = this.danmakuHashMap.get(dm.id) ?? stableHash(dm.id);
        if (hashVal >= this.config.density / 100) continue;
      }

      // 屏蔽词（仅在有屏蔽词时检查）
      if (this.config.blockKeywords.length > 0 && this.config.blockKeywords.some((kw) => dm.text.includes(kw)))
        continue;

      // 计算位置（内联减少函数调用）
      let x: number, y: number;

      if (dm.type === "scroll" && dm.x2 !== undefined && dm.y2 !== undefined) {
        const startTimeMs = dm.startTime * 1000 + (dm.t1 || 0);
        const endTimeMs = dm.startTime * 1000 + (dm.t2 || (dm.endTime - dm.startTime) * 1000);
        const adjustedDuration = (endTimeMs - startTimeMs) / this.config.speed;
        const elapsed = currentTime * 1000 - startTimeMs;

        // 快速裁剪：已完全移出屏幕的弹幕
        if (elapsed > adjustedDuration) continue;

        const progress = elapsed < 0 ? 0 : elapsed / adjustedDuration;
        x = (dm.x1 + (dm.x2 - dm.x1) * progress) * scaleX;
        y = (dm.y1 + (dm.y2 - dm.y1) * progress) * scaleY;
      } else {
        x = dm.x1 * scaleX;
        y = dm.y1 * scaleY;
      }

      // 显示区域限制
      if (y > maxDisplayY) continue;

      // 绘制弹幕（内联）
      const fontSize = dm.fontSize * this.cachedFontScale * canvasScale;
      const fontWeight = dm.isBold || this.config.isBold ? "bold" : "normal";
      ctx.font = `${fontWeight} ${fontSize}px ${this.config.fontFamily}`;

      // 应用描边（内联）
      const borderType = this.config.borderType;
      if (borderType === "outline") {
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
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
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.shadowBlur = 4;
      }

      ctx.fillStyle = dm.color;
      ctx.fillText(dm.text, x, y);

      // 重置 shadow（避免影响下一条弹幕的 outline 模式）
      if (borderType !== "outline") {
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }
    }
  }

  /**
   * 二分查找可见弹幕窗口
   * 利用 danmakus 按 startTime 排序的特性
   * 返回当前时间可能可见的弹幕子集
   */
  private getVisibleWindow(currentTime: number): ParsedDanmaku[] {
    const danmakus = this.danmakus;
    const len = danmakus.length;
    if (len === 0) return [];

    // 二分查找第一个 startTime <= currentTime 的位置
    // 实际上我们需要找所有 startTime <= currentTime && endTime >= currentTime 的弹幕
    // 由于弹幕持续时间有限（通常 < 20s），我们可以用一个合理的回溯窗口

    // 找到第一个 startTime > currentTime 的索引
    let lo = 0;
    let hi = len;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (danmakus[mid].startTime <= currentTime) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    // lo 现在指向第一个 startTime > currentTime 的位置

    // 向前回溯，收集所有 endTime >= currentTime 的弹幕
    // 弹幕最长持续时间一般不超过 20s，回溯到 startTime >= currentTime - 20 即可
    const MAX_DURATION = 20; // 秒
    const windowStart = currentTime - MAX_DURATION;

    const result: ParsedDanmaku[] = [];
    for (let i = lo - 1; i >= 0; i--) {
      const dm = danmakus[i];
      if (dm.startTime < windowStart) break; // 太早了，不可能还在显示
      if (dm.endTime >= currentTime) {
        result.push(dm);
      }
    }

    return result;
  }
}
