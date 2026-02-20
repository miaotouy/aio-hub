/**
 * 流式控制器 - 平滑化核心
 *
 * 核心设计：
 * 1. 作为 StreamSource 与 StreamProcessor 之间的缓冲调度层
 * 2. 使用 requestAnimationFrame 驱动消费循环
 * 3. 实现自适应步进和语义感知切分
 */

/**
 * StreamController 配置选项
 */
export interface StreamControllerOptions {
  /** 回调函数：当有内容需要处理时调用 */
  onContent: (content: string) => void;
  /** 基础速率：每帧消费的字符数（默认 1-2） */
  baseCharsPerFrame?: number;
  /** 加速阈值：当积压超过此字符数时开始加速（默认 200） */
  accelerationThreshold?: number;
  /** 紧急冲刷阈值：当积压超过此字符数时直接同步处理（默认 1000） */
  emergencyFlushThreshold?: number;
  /** 是否启用平滑化（默认 true） */
  smoothingEnabled?: boolean;
}

/**
 * 流式控制器类
 */
export class StreamController {
  private onContent: (content: string) => void;
  private baseCharsPerFrame: number;
  private accelerationThreshold: number;
  private emergencyFlushThreshold: number;
  private smoothingEnabled: boolean;

  // 双端队列缓冲
  private rawBuffer: string[] = [];
  private displayBuffer: string = "";

  // 状态标志
  private isRunning = false;
  private rafHandle: number | null = null;
  private isInsideCodeBlock = false;

  // 挂载保护队列（用于缓存未挂载时的数据）
  private preBufferQueue: string[] = [];
  private isMounted = false;

  constructor(options: StreamControllerOptions) {
    this.onContent = options.onContent;
    this.baseCharsPerFrame = options.baseCharsPerFrame ?? 2;
    this.accelerationThreshold = options.accelerationThreshold ?? 200;
    this.emergencyFlushThreshold = options.emergencyFlushThreshold ?? 1000;
    this.smoothingEnabled = options.smoothingEnabled ?? true;
  }

  /**
   * 检查当前是否处于代码块内部
   * 使用简单的正则检测 ` ``` ` 标记
   */
  private checkCodeBlockState(text: string): boolean {
    const fenceMatches = text.match(/```/g);
    if (!fenceMatches) {
      return this.isInsideCodeBlock;
    }
    // 如果 fence 数量为奇数，说明当前处于代码块内部
    return fenceMatches.length % 2 !== 0;
  }

  /**
   * 检查字符是否为语义边界（空格、标点、换行）
   */
  private isSemanticBoundary(char: string): boolean {
    return /[\s\p{P}]/u.test(char);
  }

  /**
   * 从 rawBuffer 消费字符到 displayBuffer
   * 应用语义感知切分策略
   */
  private consumeChars(): number {
    if (this.rawBuffer.length === 0) {
      return 0;
    }

    // 检查是否处于代码块模式
    const currentText = this.displayBuffer + this.rawBuffer.join("");
    this.isInsideCodeBlock = this.checkCodeBlockState(currentText);

    // 计算每帧消费数
    let charsPerFrame = this.baseCharsPerFrame;
    
    if (!this.isInsideCodeBlock) {
      // 非代码块模式：应用自适应加速
      const backlog = this.rawBuffer.length;
      if (backlog > this.accelerationThreshold) {
        charsPerFrame = Math.min(10, Math.ceil(backlog / 50));
      }

      // 语义感知切分：在语义边界处停止
      let consumed = 0;
      while (consumed < charsPerFrame && this.rawBuffer.length > 0) {
        const char = this.rawBuffer.shift()!;
        this.displayBuffer += char;
        consumed++;

        // 在语义边界处停止，避免单词中间断开
        if (this.isSemanticBoundary(char) && consumed < charsPerFrame) {
          break;
        }
      }
      return consumed;
    } else {
      // 代码块模式：绝对匀速输出
      let consumed = 0;
      while (consumed < charsPerFrame && this.rawBuffer.length > 0) {
        this.displayBuffer += this.rawBuffer.shift();
        consumed++;
      }
      return consumed;
    }
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
    if (this.rawBuffer.length > this.emergencyFlushThreshold) {
      this.flushAll();
      this.rafHandle = requestAnimationFrame(this.tick);
      return;
    }

    // 消费字符
    this.consumeChars();

    // 如果有消费，触发回调
    if (this.displayBuffer.length > 0) {
      this.onContent(this.displayBuffer);
      this.displayBuffer = "";
    }

    // 继续循环
    this.rafHandle = requestAnimationFrame(this.tick);
  };

  /**
   * 冲刷所有缓冲数据
   */
  private flushAll(): void {
    if (this.rawBuffer.length > 0) {
      this.displayBuffer += this.rawBuffer.join("");
      this.rawBuffer = [];
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

    // 添加到原始缓冲
    this.rawBuffer.push(chunk);
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
        // 快速消费所有数据
        this.rawBuffer.push(...allContent.split(""));
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
  getStatus(): { rawBufferLength: number; isRunning: boolean; isMounted: boolean } {
    return {
      rawBufferLength: this.rawBuffer.length,
      isRunning: this.isRunning,
      isMounted: this.isMounted,
    };
  }

  /**
   * 重置控制器状态
   */
  reset(): void {
    this.stop();
    this.rawBuffer = [];
    this.displayBuffer = "";
    this.preBufferQueue = [];
    this.isInsideCodeBlock = false;
    this.isMounted = false;
  }
}

/**
 * 创建 StreamController 的工厂函数
 */
export function createStreamController(options: StreamControllerOptions): StreamController {
  return new StreamController(options);
}