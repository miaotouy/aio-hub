import { ref } from "vue";

/**
 * 虚拟时钟 + 偏差校准
 *
 * 弹幕引擎自身的渲染循环（rAF，~30fps）是连续的时间轴。
 * 虚拟时钟基于帧增量累加，轮询只做偏差校准，不做时间驱动。
 *
 * 原理：
 * - 渲染器内部维护 virtualTime，基于帧增量累加（每帧 ~33ms）
 * - 轮询从 MPC-BE 获取真实时间，与虚拟时钟对比（每 200ms）
 * - 仅当偏差超过阈值时，才修正虚拟时钟（按需触发）
 *
 * "弹幕自己跑自己的时间轴，轮询只是偶尔看一眼手表对时。"
 */
export function useVirtualClock() {
  /** 当前虚拟时间（秒） */
  const virtualTime = ref(0);

  /** 播放/暂停状态 */
  const isPlaying = ref(false);

  /** 播放速率 */
  const playbackRate = ref(1.0);

  /** 上一帧的时间戳 */
  let lastFrameTimestamp = 0;

  /**
   * 偏差校准阈值（秒）
   * 500ms 以内的偏差不做校准，避免微小抖动导致弹幕跳帧
   */
  const CALIBRATION_THRESHOLD = 0.5;

  /**
   * 每帧调用（在 rAF 循环中）
   * 基于帧时间增量推进虚拟时钟
   *
   * @param frameTime - performance.now() 或 rAF 回调的时间戳
   * @returns 当前虚拟时间（秒）
   */
  function tick(frameTime: DOMHighResTimeStamp): number {
    if (lastFrameTimestamp === 0) {
      lastFrameTimestamp = frameTime;
      return virtualTime.value;
    }

    if (isPlaying.value) {
      const delta = ((frameTime - lastFrameTimestamp) / 1000) * playbackRate.value;
      virtualTime.value += delta;
    }

    lastFrameTimestamp = frameTime;
    return virtualTime.value;
  }

  /**
   * 校准虚拟时钟
   * 收到轮询结果后调用，检测偏差并按需修正
   *
   * @param serverPositionMs - MPC-BE 返回的播放位置（毫秒）
   * @param state - 播放状态字符串
   */
  function calibrate(serverPositionMs: number, state: string): void {
    const serverTime = serverPositionMs / 1000;
    const playing = state === "Playing";

    // 状态从暂停 → 播放：强制校准
    // （防止暂停期间用户手动拖动进度条导致时间不同步）
    if (!isPlaying.value && playing) {
      virtualTime.value = serverTime;
      isPlaying.value = true;
      lastFrameTimestamp = 0;
      return;
    }

    // 更新播放状态
    isPlaying.value = playing;

    // 偏差检测
    const deviation = serverTime - virtualTime.value;

    if (Math.abs(deviation) > CALIBRATION_THRESHOLD) {
      // 偏差超过阈值 → 校准
      // 可能原因：用户拖动进度条、卡顿恢复、倍速变化等
      virtualTime.value = serverTime;
      lastFrameTimestamp = 0;
    }
    // 偏差在阈值内 → 不做任何事，虚拟时钟保持连续
  }

  /**
   * 强制设置时间（用于 seek 跳转等场景）
   */
  function seekTo(timeInSeconds: number): void {
    virtualTime.value = timeInSeconds;
    lastFrameTimestamp = 0;
  }

  /**
   * 设置播放状态
   */
  function setPlaying(playing: boolean): void {
    if (!isPlaying.value && playing) {
      // 从暂停恢复播放，重置帧时间戳
      lastFrameTimestamp = 0;
    }
    isPlaying.value = playing;
  }

  /**
   * 重置时钟
   */
  function reset(): void {
    virtualTime.value = 0;
    isPlaying.value = false;
    playbackRate.value = 1.0;
    lastFrameTimestamp = 0;
  }

  return {
    virtualTime,
    isPlaying,
    playbackRate,
    tick,
    calibrate,
    seekTo,
    setPlaying,
    reset,
  };
}