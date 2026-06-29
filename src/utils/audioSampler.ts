/**
 * 音频波形采样工具
 *
 * 使用 Web Audio API (OfflineAudioContext) 在浏览器端离线解码音频文件，
 * 并提取低分辨率的波形采样数据，用于 UI 预览。
 *
 * 核心优势：
 * - 零新增 Rust 依赖，完全利用浏览器原生音频解码能力
 * - 支持 MP3, WAV, FLAC, M4A, OGG 等所有主流音频格式
 * - OfflineAudioContext 不占用播放通道，解码速度极快
 */

import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("audioSampler");
const MAX_CONCURRENT_SAMPLING = 2;
const MAX_SCAN_SAMPLES_PER_POINT = 1000;

let activeSamplingTasks = 0;
const pendingSamplingTasks: Array<() => void> = [];
const inFlightSamples = new Map<string, Promise<number[]>>();

function runWithSamplingLimit<T>(task: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      activeSamplingTasks += 1;
      Promise.resolve()
        .then(task)
        .then(resolve, reject)
        .finally(() => {
          activeSamplingTasks = Math.max(0, activeSamplingTasks - 1);
          pendingSamplingTasks.shift()?.();
        });
    };

    if (activeSamplingTasks < MAX_CONCURRENT_SAMPLING) {
      run();
      return;
    }

    logger.debug("音频采样任务进入队列", {
      active: activeSamplingTasks,
      pending: pendingSamplingTasks.length + 1,
    });
    pendingSamplingTasks.push(run);
  });
}

/**
 * 从音频 URL 中提取波形采样数据
 *
 * @param audioUrl 音频文件的 URL（支持 asset://, http://, blob: 等协议）
 * @param pointsCount 采样点数，默认 100（足够绘制精致的波形预览）
 * @returns 归一化到 0-255 的整数数组，长度为 pointsCount
 */
export async function sampleAudioWaveform(
  audioUrl: string,
  pointsCount = 100
): Promise<number[]> {
  const sampleKey = `${pointsCount}:${audioUrl}`;
  const inFlightSample = inFlightSamples.get(sampleKey);
  if (inFlightSample) return inFlightSample;

  const samplePromise = runWithSamplingLimit(() =>
    sampleAudioWaveformInternal(audioUrl, pointsCount)
  );
  inFlightSamples.set(sampleKey, samplePromise);

  try {
    return await samplePromise;
  } finally {
    if (inFlightSamples.get(sampleKey) === samplePromise) {
      inFlightSamples.delete(sampleKey);
    }
  }
}

async function sampleAudioWaveformInternal(
  audioUrl: string,
  pointsCount: number
): Promise<number[]> {
  try {
    // 1. 获取音频文件的二进制数据
    logger.debug("开始获取音频数据", { url: audioUrl });
    const response = await fetch(audioUrl);
    if (!response.ok) {
      throw new Error(
        `获取音频失败: ${response.status} ${response.statusText}`
      );
    }
    const arrayBuffer = await response.arrayBuffer();

    // 2. 使用 OfflineAudioContext 解码音频
    // 注意：OfflineAudioContext 不会播放音频，只是离线解码
    // 使用 44100 作为 length 缓冲区大小，在各平台 WebView 引擎下拥有更佳的兼容性与鲁棒性
    const audioCtx = new OfflineAudioContext(1, 44100, 44100);
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    // 3. 获取通道数据（取左声道）
    const channelData = audioBuffer.getChannelData(0);
    const totalSamples = channelData.length;

    logger.debug("音频解码成功", {
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
      totalSamples,
    });

    if (totalSamples === 0 || pointsCount <= 0) {
      return [];
    }

    // 4. 下采样：将数十万个采样点压缩为 pointsCount 个点
    const waveform: number[] = [];

    for (let i = 0; i < pointsCount; i++) {
      const startSample = Math.floor((i * totalSamples) / pointsCount);
      const endSample = Math.min(
        totalSamples,
        Math.max(
          startSample + 1,
          Math.floor(((i + 1) * totalSamples) / pointsCount)
        )
      );
      const segmentSize = Math.max(1, endSample - startSample);
      const scanStep = Math.max(
        1,
        Math.ceil(segmentSize / MAX_SCAN_SAMPLES_PER_POINT)
      );

      // 计算该区间内的峰值（绝对值最大值），长音频按固定上限抽样，避免主线程长时间阻塞。
      let peak = 0;
      for (let j = startSample; j < endSample; j += scanStep) {
        const abs = Math.abs(channelData[j]);
        if (abs > peak) peak = abs;
      }

      // 归一化到 0-255
      const normalized = Math.min(255, Math.round(peak * 255));
      waveform.push(normalized);
    }

    logger.debug("波形采样完成", { pointsCount: waveform.length });
    return waveform;
  } catch (error) {
    logger.error("音频波形采样失败", error as Error, {
      url: audioUrl,
      pointsCount,
    });
    // 返回空数组，调用方可以据此判断采样失败
    return [];
  }
}

/**
 * 检查资产是否需要生成波形采样
 */
export function needsWaveformSampling(asset: {
  type: string;
  metadata?: { audioWaveform?: number[] };
}): boolean {
  return (
    asset.type === "audio" &&
    (!asset.metadata?.audioWaveform ||
      asset.metadata.audioWaveform.length === 0)
  );
}
