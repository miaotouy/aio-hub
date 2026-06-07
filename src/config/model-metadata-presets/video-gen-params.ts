/**
 * 视频生成参数预设规则
 *
 * 覆盖主流视频生成模型的尺寸、宽高比、分辨率和时长等参数。
 */
import type { ModelMetadataRule } from "../../types/model-metadata";

const commonVideoAspectRatios = [
  { label: "16:9 (横屏)", value: "16:9" },
  { label: "9:16 (竖屏)", value: "9:16" },
  { label: "1:1", value: "1:1" },
  { label: "4:3", value: "4:3" },
  { label: "3:4", value: "3:4" },
];

const commonVideoResolutions = [
  { label: "720p", value: "720p" },
  { label: "1080p", value: "1080p" },
];

export const videoGenParamsRules: ModelMetadataRule[] = [
  // === OpenAI Sora ===
  {
    id: "media-params-sora-video",
    matchType: "modelPrefix",
    matchValue: "sora",
    properties: {
      capabilities: { videoGeneration: true },
      mediaGenParams: {
        size: {
          mode: "preset",
          presets: [
            { label: "横屏 720p (1280x720)", value: "1280x720" },
            { label: "竖屏 720p (720x1280)", value: "720x1280" },
            { label: "横屏 1024p (1792x1024)", value: "1792x1024" },
            { label: "竖屏 1024p (1024x1792)", value: "1024x1792" },
          ],
          default: "1280x720",
        },
        duration: {
          supported: true,
          options: [
            { label: "4s", value: 4 },
            { label: "8s", value: 8 },
            { label: "12s", value: 12 },
          ],
          default: 8,
        },
        negativePrompt: { supported: false },
        seed: { supported: false },
        steps: { supported: false },
        guidanceScale: { supported: false },
        quality: { supported: false },
        style: { supported: false },
        batchSize: { supported: false },
        promptEnhancement: { supported: false },
        generateAudio: { supported: false },
        watermark: { supported: false },
        cameraFixed: { supported: false },
        movementAmplitude: { supported: false },
      },
    },
    priority: 16,
    enabled: true,
    description: "OpenAI Sora 视频生成参数规则",
  },

  // === Google Veo ===
  {
    id: "media-params-veo-video",
    matchType: "modelPrefix",
    matchValue: "veo",
    properties: {
      capabilities: { videoGeneration: true, vision: true },
      mediaGenParams: {
        aspectRatioMode: {
          ratios: [
            { label: "16:9 (横屏)", value: "16:9" },
            { label: "9:16 (竖屏)", value: "9:16" },
          ],
          resolutions: commonVideoResolutions,
          defaultRatio: "16:9",
          defaultResolution: "720p",
        },
        duration: {
          supported: true,
          options: [
            { label: "4s", value: 4 },
            { label: "6s", value: 6 },
            { label: "8s", value: 8 },
          ],
          default: 8,
        },
        negativePrompt: { supported: true },
        seed: { supported: true },
        steps: { supported: false },
        guidanceScale: { supported: false },
        quality: { supported: false },
        style: { supported: false },
        batchSize: { supported: false },
        promptEnhancement: { supported: false },
        generateAudio: { supported: false },
        watermark: { supported: false },
        cameraFixed: { supported: false },
        movementAmplitude: { supported: false },
      },
    },
    priority: 16,
    enabled: true,
    description: "Google Veo 视频生成参数规则",
  },

  // === Kling / 可灵 ===
  {
    id: "media-params-kling-video",
    matchType: "modelPrefix",
    matchValue: "kling",
    properties: {
      capabilities: { videoGeneration: true, vision: true },
      mediaGenParams: {
        aspectRatioMode: {
          ratios: commonVideoAspectRatios,
          resolutions: commonVideoResolutions,
          defaultRatio: "16:9",
          defaultResolution: "720p",
        },
        duration: {
          supported: true,
          options: [
            { label: "5s", value: 5 },
            { label: "10s", value: 10 },
          ],
          default: 5,
        },
        negativePrompt: { supported: true },
        seed: { supported: true, min: 0 },
        guidanceScale: {
          supported: true,
          min: 0,
          max: 1,
          step: 0.1,
          default: 0.5,
        },
        steps: { supported: false },
        quality: { supported: false },
        style: { supported: false },
        batchSize: { supported: false },
        promptEnhancement: { supported: false },
        generateAudio: { supported: false },
        watermark: { supported: false },
        cameraFixed: { supported: false },
        movementAmplitude: { supported: false },
      },
    },
    priority: 16,
    enabled: true,
    description: "Kling / 可灵视频生成参数规则",
  },

  // === MiniMax Hailuo ===
  {
    id: "media-params-hailuo-video",
    matchType: "model",
    matchValue: "hailuo|MiniMax[-_ ]Hailuo",
    useRegex: true,
    properties: {
      capabilities: { videoGeneration: true, vision: true },
      mediaGenParams: {
        aspectRatioMode: {
          ratios: commonVideoAspectRatios,
          resolutions: commonVideoResolutions,
          defaultRatio: "16:9",
          defaultResolution: "1080p",
        },
        duration: {
          supported: true,
          options: [
            { label: "6s", value: 6 },
            { label: "10s", value: 10 },
          ],
          default: 6,
        },
        promptEnhancement: { supported: true, default: true },
        negativePrompt: { supported: false },
        seed: { supported: false },
        steps: { supported: false },
        guidanceScale: { supported: false },
        quality: { supported: false },
        style: { supported: false },
        batchSize: { supported: false },
        generateAudio: { supported: false },
        watermark: { supported: false },
        cameraFixed: { supported: false },
        movementAmplitude: { supported: false },
      },
    },
    priority: 16,
    enabled: true,
    description: "MiniMax Hailuo 视频生成参数规则",
  },

  // === Runway Gen ===
  {
    id: "media-params-runway-video",
    matchType: "modelPrefix",
    matchValue: "runway-gen|gen-3|gen-4",
    useRegex: true,
    properties: {
      capabilities: { videoGeneration: true, vision: true },
      mediaGenParams: {
        aspectRatioMode: {
          ratios: [
            { label: "16:9 (横屏)", value: "16:9" },
            { label: "9:16 (竖屏)", value: "9:16" },
            { label: "1:1", value: "1:1" },
            { label: "4:3", value: "4:3" },
            { label: "3:4", value: "3:4" },
            { label: "21:9", value: "21:9" },
          ],
          defaultRatio: "16:9",
        },
        duration: {
          supported: true,
          options: [
            { label: "5s", value: 5 },
            { label: "10s", value: 10 },
          ],
          default: 5,
        },
        negativePrompt: { supported: false },
        seed: { supported: true },
        steps: { supported: false },
        guidanceScale: { supported: false },
        quality: { supported: false },
        style: { supported: false },
        batchSize: { supported: false },
        promptEnhancement: { supported: false },
        generateAudio: { supported: false },
        watermark: { supported: false },
        cameraFixed: { supported: false },
        movementAmplitude: { supported: false },
      },
    },
    priority: 16,
    enabled: true,
    description: "Runway Gen 视频生成参数规则",
  },

  // === Luma Ray / Dream Machine ===
  {
    id: "media-params-luma-video",
    matchType: "modelPrefix",
    matchValue: "luma-dream-machine|ray-",
    useRegex: true,
    properties: {
      capabilities: { videoGeneration: true, vision: true },
      mediaGenParams: {
        aspectRatioMode: {
          ratios: [
            { label: "16:9 (横屏)", value: "16:9" },
            { label: "9:16 (竖屏)", value: "9:16" },
            { label: "1:1", value: "1:1" },
            { label: "4:3", value: "4:3" },
            { label: "3:4", value: "3:4" },
            { label: "21:9", value: "21:9" },
            { label: "9:21", value: "9:21" },
          ],
          resolutions: commonVideoResolutions,
          defaultRatio: "16:9",
          defaultResolution: "720p",
        },
        duration: {
          supported: true,
          options: [
            { label: "5s", value: 5 },
            { label: "9s", value: 9 },
          ],
          default: 5,
        },
        negativePrompt: { supported: false },
        seed: { supported: false },
        steps: { supported: false },
        guidanceScale: { supported: false },
        quality: { supported: false },
        style: { supported: false },
        batchSize: { supported: false },
        promptEnhancement: { supported: false },
        generateAudio: { supported: false },
        watermark: { supported: false },
        cameraFixed: { supported: false },
        movementAmplitude: { supported: false },
      },
    },
    priority: 16,
    enabled: true,
    description: "Luma Ray / Dream Machine 视频生成参数规则",
  },

  // === Vidu ===
  {
    id: "media-params-vidu-video",
    matchType: "modelPrefix",
    matchValue: "vidu",
    properties: {
      capabilities: { videoGeneration: true, vision: true },
      mediaGenParams: {
        aspectRatioMode: {
          ratios: [
            { label: "16:9 (横屏)", value: "16:9" },
            { label: "9:16 (竖屏)", value: "9:16" },
            { label: "1:1", value: "1:1" },
          ],
          resolutions: commonVideoResolutions,
          defaultRatio: "16:9",
          defaultResolution: "720p",
        },
        duration: {
          supported: true,
          options: [
            { label: "4s", value: 4 },
            { label: "8s", value: 8 },
          ],
          default: 4,
        },
        style: {
          supported: true,
          options: [
            { label: "通用 (General)", value: "general" },
            { label: "动漫 (Anime)", value: "anime" },
          ],
          default: "general",
        },
        movementAmplitude: {
          supported: true,
          options: [
            { label: "自动", value: "auto" },
            { label: "小", value: "small" },
            { label: "中", value: "medium" },
            { label: "大", value: "large" },
          ],
          default: "auto",
        },
        generateAudio: { supported: true, default: false },
        negativePrompt: { supported: false },
        seed: { supported: true },
        steps: { supported: false },
        guidanceScale: { supported: false },
        quality: { supported: false },
        batchSize: { supported: false },
        promptEnhancement: { supported: false },
        watermark: { supported: false },
        cameraFixed: { supported: false },
      },
    },
    priority: 16,
    enabled: true,
    description: "Vidu 视频生成参数规则",
  },

  // === ByteDance Seedance / Doubao ===
  {
    id: "media-params-seedance-video",
    matchType: "modelPrefix",
    matchValue: "seedance|doubao-seedance",
    useRegex: true,
    properties: {
      capabilities: { videoGeneration: true, vision: true },
      mediaGenParams: {
        aspectRatioMode: {
          ratios: [
            { label: "自适应", value: "adaptive" },
            ...commonVideoAspectRatios,
          ],
          resolutions: commonVideoResolutions,
          defaultRatio: "adaptive",
          defaultResolution: "720p",
        },
        duration: {
          supported: true,
          min: 2,
          max: 15,
          step: 1,
          default: 5,
        },
        seed: { supported: true, min: -1 },
        generateAudio: { supported: true, default: false },
        watermark: { supported: true, default: false },
        cameraFixed: { supported: true, default: false },
        promptEnhancement: { supported: false },
        negativePrompt: { supported: false },
        steps: { supported: false },
        guidanceScale: { supported: false },
        quality: { supported: false },
        style: { supported: false },
        batchSize: { supported: false },
        movementAmplitude: { supported: false },
      },
    },
    priority: 16,
    enabled: true,
    description: "ByteDance Seedance / Doubao 视频生成参数规则",
  },

  // === SkyReels / Agnes 等通用视频模型 ===
  {
    id: "media-params-generic-video",
    matchType: "modelPrefix",
    matchValue: "video-gen|txt2vid|happyhorse|skyreels|agnes-video|wan.*video",
    useRegex: true,
    properties: {
      capabilities: { videoGeneration: true, vision: true },
      mediaGenParams: {
        aspectRatioMode: {
          ratios: commonVideoAspectRatios,
          resolutions: commonVideoResolutions,
          defaultRatio: "16:9",
          defaultResolution: "720p",
        },
        duration: {
          supported: true,
          min: 2,
          max: 12,
          step: 1,
          default: 5,
        },
        negativePrompt: { supported: true },
        seed: { supported: true, min: -1 },
        steps: { supported: false },
        guidanceScale: { supported: false },
        quality: { supported: false },
        style: { supported: false },
        batchSize: { supported: false },
        promptEnhancement: { supported: false },
        generateAudio: { supported: false },
        watermark: { supported: false },
        cameraFixed: { supported: false },
        movementAmplitude: { supported: false },
      },
    },
    priority: 12,
    enabled: true,
    description: "通用视频生成参数规则",
  },
];
