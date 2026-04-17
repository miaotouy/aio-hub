/**
 * 流式控制器 - 平滑化核心
 *
 * 核心设计：
 * 1. 作为 StreamSource 与 StreamProcessor 之间的缓冲调度层
 * 2. 使用 requestAnimationFrame 驱动消费循环
 * 3. 节奏感知配速：追踪上游投喂间隔，将库存匀速铺满到下一个 chunk 预计到达前
 * 4. 语义感知切分：按中文词/英文单词/标点为最小输出单元，避免单字蹦出
 */

/**
 * StreamController 配置选项
 */
export interface StreamControllerOptions {
  /** 回调函数：当有内容需要处理时调用 */
  onContent: (content: string) => void;
  /** 基础速率：每帧消费的字符数（默认 2） */
  baseCharsPerFrame?: number;
  /** 加速阈值：当积压超过此字符数时开始加速（默认 200） */
  accelerationThreshold?: number;
  /** 紧急冲刷阈值：当积压超过此字符数时直接同步处理（默认 1000） */
  emergencyFlushThreshold?: number;
  /** 是否启用平滑化（默认 true） */
  smoothingEnabled?: boolean;
  /** 是否启用高级调试日志（默认 false，开启后每帧/每 chunk 都会打印，会刷屏） */
  verboseLogging?: boolean;
}

// 帧间隔常量（60fps ≈ 16.67ms）
const FRAME_INTERVAL = 16.67;

/**
 * 流式控制器类
 */
export class StreamController {
  private onContent: (content: string) => void;
  private accelerationThreshold: number;
  private emergencyFlushThreshold: number;
  private smoothingEnabled: boolean;
  private verboseLogging: boolean;

  // 语义块队列（最小输出单位）
  private semanticQueue: string[] = [];
  private displayBuffer: string = "";

  // 状态标志
  private isRunning = false;
  private rafHandle: number | null = null;
  private isInsideCodeBlock = false;
  // 用于增量检测代码块状态的上下文
  private fenceBacklog = "";

  // ========= 节奏感知相关 =========
  /** 上游 chunk 到达时间戳记录（滑动窗口） */
  private chunkArrivalTimes: number[] = [];
  /** 滑动窗口大小 */
  private readonly ARRIVAL_WINDOW_SIZE = 8;
  /** 估算的上游投喂间隔（ms），初始值 100ms（典型 SSE 间隔） */
  private estimatedChunkInterval = 100;
  /** 目标 emit 间隔（ms），控制多久出一次字，默认 40ms ≈ 每 2.4 帧 */
  private targetEmitIntervalMs = 40;
  /** 每次 emit 的语义块数 */
  private blocksPerEmit = 2;

  // 调试日志相关
  private lastEmitTime = 0;
  private totalEmittedChars = 0;
  private chunkCount = 0;

  // 挂载保护队列（用于缓存未挂载时的数据）
  private preBufferQueue: string[] = [];
  private isMounted = false;

  constructor(options: StreamControllerOptions) {
    this.onContent = options.onContent;
    this.accelerationThreshold = options.accelerationThreshold ?? 200;
    this.emergencyFlushThreshold = options.emergencyFlushThreshold ?? 1000;
    this.smoothingEnabled = options.smoothingEnabled ?? true;
    this.verboseLogging = options.verboseLogging ?? false;
  }

  /**
   * 增量更新代码块状态
   * 监听 ``` 标记的出现
   */
  private updateCodeBlockState(char: string): void {
    // 维护一个小的缓冲区来检测 ```
    this.fenceBacklog += char;
    if (this.fenceBacklog.length > 3) {
      this.fenceBacklog = this.fenceBacklog.slice(-3);
    }

    if (this.fenceBacklog === "```") {
      this.isInsideCodeBlock = !this.isInsideCodeBlock;
      // 匹配到后清空，防止连续检测
      this.fenceBacklog = "";
    }
  }

  /**
   * 更新上游投喂节奏估算
   * 记录最近 N 次 chunk 到达间隔，计算加权移动平均
   */
  private updateChunkTiming(): void {
    const now = performance.now();
    this.chunkArrivalTimes.push(now);

    // 保持滑动窗口大小
    if (this.chunkArrivalTimes.length > this.ARRIVAL_WINDOW_SIZE) {
      this.chunkArrivalTimes.shift();
    }

    // 至少需要 2 个时间点才能计算间隔
    if (this.chunkArrivalTimes.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < this.chunkArrivalTimes.length; i++) {
        intervals.push(this.chunkArrivalTimes[i] - this.chunkArrivalTimes[i - 1]);
      }

      // 加权平均：最近的间隔权重更高（指数加权）
      let weightedSum = 0;
      let weightTotal = 0;
      for (let i = 0; i < intervals.length; i++) {
        const weight = Math.pow(1.5, i); // 越新的权重越大
        weightedSum += intervals[i] * weight;
        weightTotal += weight;
      }

      this.estimatedChunkInterval = Math.max(20, weightedSum / weightTotal);
    }
  }

  /**
   * 重新计算 emit 参数（间隔 + 每次块数）
   *
   * 核心思路：
   * - 不再每帧都出字，而是每隔 targetEmitIntervalMs 出一次
   * - 每次出 blocksPerEmit 个语义块（约 2-6 字符）
   * - 根据上游节奏和积压量动态调整这两个参数
   */
  private recalculateEmitParams(): void {
    const backlog = this.semanticQueue.reduce((acc, c) => acc + c.length, 0);

    if (backlog === 0) return;

    // 紧急加速：积压严重时每帧都出，且多出几块
    if (backlog > this.accelerationThreshold) {
      this.targetEmitIntervalMs = FRAME_INTERVAL;
      this.blocksPerEmit = Math.min(8, Math.ceil(backlog / 20));
      return;
    }

    // 节奏感知配速：
    // 目标：在 estimatedChunkInterval 内，将当前积压的 85% 均匀分配出去
    // 每次 emit 固定 blocksPerEmit 个块，计算需要多少次 emit，再算间隔
    const avgBlockSize = backlog / Math.max(1, this.semanticQueue.length);
    // 每次 emit 2 个块
    const charsPerEmit = 2 * avgBlockSize;
    const emitsNeeded = Math.max(1, (backlog * 0.85) / charsPerEmit);
    const rawInterval = this.estimatedChunkInterval / emitsNeeded;

    // 钳位：最快 25ms（40次/秒），最慢 120ms（8次/秒）
    // 25ms ≈ 每 1.5 帧，120ms ≈ 每 7 帧
    this.targetEmitIntervalMs = Math.max(25, Math.min(120, rawInterval));
    this.blocksPerEmit = 2;
  }

  /**
   * 智能语义分块
   * 将文本拆分为：连续中文字符组（2-3个一组）、英文单词、标点、空白
   * 这些块是最小输出单位，保证每次吐出的都是有意义的片段
   */
  private splitIntoSemanticChunks(text: string): string[] {
    // 先按基础语义切分
    const regex = /[\u4e00-\u9fa5]+|[a-zA-Z0-9]+|\s+|./gu;
    const rawChunks = text.match(regex) || [];

    const result: string[] = [];
    for (const chunk of rawChunks) {
      // 对连续中文进一步拆分为 2-3 字一组（模拟词组输出节奏）
      if (/^[\u4e00-\u9fa5]+$/.test(chunk) && chunk.length > 3) {
        for (let i = 0; i < chunk.length; i += 2) {
          result.push(chunk.slice(i, Math.min(i + 2, chunk.length)));
        }
      } else {
        result.push(chunk);
      }
    }

    return result;
  }

  /**
   * 从 semanticQueue 消费内容到 displayBuffer
   * 按 blocksPerEmit 个语义块消费，不再按字符数配额
   */
  private consumeChars(): number {
    if (this.semanticQueue.length === 0) return 0;

    let consumed = 0;
    let blocksConsumed = 0;

    while (this.semanticQueue.length > 0 && blocksConsumed < this.blocksPerEmit) {
      const chunk = this.semanticQueue[0];

      if (!this.isInsideCodeBlock) {
        this.semanticQueue.shift();
        this.displayBuffer += chunk;
        consumed += chunk.length;
        blocksConsumed++;

        for (const char of chunk) {
          this.updateCodeBlockState(char);
        }
      } else {
        // 代码块内：拆回单字符，保持结构稳定
        if (chunk.length > 1) {
          const char = chunk[0];
          this.semanticQueue[0] = chunk.slice(1);
          this.displayBuffer += char;
          this.updateCodeBlockState(char);
          consumed++;
          blocksConsumed++;
        } else {
          this.semanticQueue.shift();
          this.displayBuffer += chunk;
          this.updateCodeBlockState(chunk);
          consumed++;
          blocksConsumed++;
        }
      }
    }

    return consumed;
  }

  /**
   * rAF 驱动的消费循环
   */
  private tick = (): void => {
    if (!this.isRunning) {
      this.rafHandle = null;
      return;
    }

    // 紧急冲刷：如果积压过多，直接处理所有数据
    const totalBacklog = this.semanticQueue.reduce((acc, c) => acc + c.length, 0);
    if (totalBacklog > this.emergencyFlushThreshold) {
      this.flushAll();
      this.rafHandle = requestAnimationFrame(this.tick);
      return;
    }

    // 重新计算 emit 参数（间隔 + 块数）
    this.recalculateEmitParams();

    // 时间控制：只有达到目标间隔才 emit
    const now = performance.now();
    const timeSinceLastEmit = this.lastEmitTime ? now - this.lastEmitTime : Infinity;

    if (timeSinceLastEmit >= this.targetEmitIntervalMs) {
      this.consumeChars();

      if (this.displayBuffer.length > 0) {
        const interval = this.lastEmitTime ? (now - this.lastEmitTime).toFixed(1) : 0;
        const emitLen = this.displayBuffer.length;
        this.totalEmittedChars += emitLen;

        if (this.verboseLogging) {
          console.debug(
            `[StreamController] Emit: "${this.displayBuffer.replace(/\n/g, "\\n")}" (+${emitLen}) | Interval: ${interval}ms | EmitEvery: ${this.targetEmitIntervalMs.toFixed(0)}ms | ChunkInterval: ${this.estimatedChunkInterval.toFixed(0)}ms | Backlog: ${this.semanticQueue.length} chunks`
          );
        }

        this.onContent(this.displayBuffer);
        this.displayBuffer = "";
        this.lastEmitTime = now;
      }
    }

    // 继续循环
    this.rafHandle = requestAnimationFrame(this.tick);
  };

  /**
   * 冲刷所有缓冲数据
   */
  private flushAll(): void {
    if (this.semanticQueue.length > 0) {
      this.displayBuffer += this.semanticQueue.join("");
      this.semanticQueue = [];
    }
    if (this.displayBuffer.length > 0) {
      this.onContent(this.displayBuffer);
      this.displayBuffer = "";
    }
  }
  /**
   * 启动控制器
   */
  start(): void {
    if (this.isRunning) return;
    if (!this.smoothingEnabled) return; // 非平滑模式下 push() 直接回调，无需启动循环
    this.isRunning = true;
    this.rafHandle = requestAnimationFrame(this.tick);
  }

  /**
   * 停止控制器
   */
  stop(): void {
    this.isRunning = false;
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }

  /**
   * 冲刷剩余数据并停止
   */
  flushAndStop(): void {
    this.flushAll();
    this.stop();
  }

  /**
   * 添加原始数据到缓冲区
   */
  push(chunk: string): void {
    if (!chunk) return;

    this.chunkCount++;
    if (this.verboseLogging) {
      console.debug(`[StreamController] Chunk #${this.chunkCount} received: ${chunk.length} chars`);
    }

    if (!this.smoothingEnabled) {
      // 不启用平滑化，直接回调
      this.onContent(chunk);
      return;
    }

    // 如果未挂载，存入预缓冲队列
    if (!this.isMounted) {
      this.preBufferQueue.push(chunk);
      return;
    }

    // 更新上游投喂节奏估算，并将 chunk 拆分为语义块后入队
    this.updateChunkTiming();
    const chunks = this.splitIntoSemanticChunks(chunk);
    this.semanticQueue.push(...chunks);
  }

  /**
   * 标记组件已挂载
   * 从预缓冲队列中以高倍速回放数据
   */
  markMounted(): void {
    this.isMounted = true;

    // 回放预缓冲的数据（高倍速）
    if (this.preBufferQueue.length > 0) {
      // 一次性处理所有预缓冲数据
      const allContent = this.preBufferQueue.join("");
      this.preBufferQueue = [];

      if (this.smoothingEnabled) {
        // 拆分为语义块后入队
        const chunks = this.splitIntoSemanticChunks(allContent);
        this.semanticQueue.push(...chunks);

        // 如果预缓冲非常多，先同步输出一批，避免首屏空白
        const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
        if (totalLen > this.accelerationThreshold) {
          const targetInitial = Math.min(totalLen, 500);
          let initialContent = "";
          while (this.semanticQueue.length > 0 && initialContent.length < targetInitial) {
            initialContent += this.semanticQueue.shift()!;
          }
          for (const char of initialContent) {
            this.updateCodeBlockState(char);
          }
          this.onContent(initialContent);
        }
      } else {
        this.onContent(allContent);
      }
    }
  }

  /**
   * 标记组件已卸载
   */
  markUnmounted(): void {
    this.isMounted = false;
  }

  /**
   * 获取当前缓冲状态（用于调试）
   */
  getStatus(): {
    semanticQueueLength: number;
    isRunning: boolean;
    isMounted: boolean;
    estimatedChunkInterval: number;
    targetEmitIntervalMs: number;
  } {
    return {
      semanticQueueLength: this.semanticQueue.length,
      isRunning: this.isRunning,
      isMounted: this.isMounted,
      estimatedChunkInterval: this.estimatedChunkInterval,
      targetEmitIntervalMs: this.targetEmitIntervalMs,
    };
  }

  /**
   * 重置控制器状态
   */
  reset(): void {
    this.stop();
    this.semanticQueue = [];
    this.displayBuffer = "";
    this.preBufferQueue = [];
    this.isInsideCodeBlock = false;
    this.isMounted = false;
    this.fenceBacklog = "";
    this.chunkArrivalTimes = [];
    this.estimatedChunkInterval = 100;
    this.targetEmitIntervalMs = 40;
    this.blocksPerEmit = 2;
    this.totalEmittedChars = 0;
    this.chunkCount = 0;
    this.lastEmitTime = 0;
  }
}

/**
 * 创建 StreamController 的工厂函数
 */
export function createStreamController(options: StreamControllerOptions): StreamController {
  return new StreamController(options);
}
