// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import type { FFmpegParams } from "../types";
import { resolveVideoQuality } from "./executionPlan";
import { hasTrimRange, trimNameTag } from "./trim";

export interface NamingContext {
  inputFileName: string;
  sourceContainer?: string;
  sourceAudioCodec?: string;
  sourceVideoCodec?: string;
}

const AUDIO_CODEC_CONTAINER: Record<string, string> = {
  aac: "m4a",
  mp3: "mp3",
  flac: "flac",
  opus: "ogg",
  vorbis: "ogg",
  pcm_s16le: "wav",
  pcm_s24le: "wav",
  pcm_f32le: "wav",
  alac: "m4a",
  ac3: "ac3",
  eac3: "ac3",
};

const AUDIO_ENCODER_CONTAINER: Record<string, string> = {
  aac: "m4a",
  libmp3lame: "mp3",
  flac: "flac",
  libopus: "ogg",
  pcm_s16le: "wav",
};

const CUSTOM_FORMAT_CONTAINER: Record<string, string> = {
  mp4: "mp4",
  mov: "mp4",
  matroska: "mkv",
  webm: "webm",
  gif: "gif",
  mpegts: "ts",
  mp3: "mp3",
  flac: "flac",
  wav: "wav",
  ogg: "ogg",
  opus: "opus",
  adts: "aac",
  aac: "aac",
};

const MP4_INCOMPATIBLE_AUDIO = new Set(["flac", "libvorbis", "pcm_s16le"]);

const AUDIO_ONLY_CONTAINERS = new Set([
  "mp3",
  "flac",
  "wav",
  "m4a",
  "ogg",
  "aac",
  "opus",
  "ac3",
]);

const MAX_FILE_NAME_LENGTH = 200;

const WEBM_VIDEO_ENCODERS = new Set([
  "libvpx-vp9",
  "libvpx",
  "libaom-av1",
  "copy",
]);

const WEBM_AUDIO_ENCODERS = new Set(["libopus", "libvorbis", "copy"]);

const HEIGHT_LABELS: Record<string, string> = {
  "3840": "4K",
  "2560": "2K",
  "1920": "1080p",
  "1280": "720p",
  "854": "480p",
};

const ILLEGAL_NAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

export function splitFileName(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) {
    return { base: name, ext: "" };
  }

  const base = name.slice(0, dot);
  const ext = name.slice(dot + 1);
  if (!base || !ext) {
    return { base: base || name, ext: "" };
  }

  return { base, ext };
}

export function buildParamsSuffix(params: FFmpegParams): string {
  const tags: string[] = [];

  if (params.mode === "extract_audio" || params.videoEncoder === "none") {
    tags.push("audio_only");
    if (params.audioEncoder && params.audioEncoder !== "none") {
      tags.push(params.audioEncoder.replace("lib", ""));
      if (params.audioBitrate) tags.push(params.audioBitrate);
    }
  } else if (params.mode === "video" || params.mode === "convert") {
    if (params.videoEncoder) {
      tags.push(params.videoEncoder.replace("lib", ""));
    }

    if (params.crf !== undefined) {
      const encoder = params.videoEncoder || "libx264";
      const label = resolveVideoQuality(encoder).label;
      tags.push(`${label}${params.crf}`);
    } else if (params.videoBitrate) {
      tags.push(params.videoBitrate);
    }

    if (params.scale) {
      const scaleMatch = params.scale.match(/scale=(\d+):/);
      if (scaleMatch) {
        const width = scaleMatch[1];
        tags.push(HEIGHT_LABELS[width] || `${width}w`);
      }
    }

    if (params.fps) {
      tags.push(`${params.fps}fps`);
    }

    if (params.audioEncoder === "none") {
      tags.push("muted");
    } else if (params.audioEncoder && params.audioEncoder !== "copy") {
      tags.push(params.audioEncoder.replace("lib", ""));
      if (params.audioBitrate) tags.push(params.audioBitrate);
    }
  }

  if (trimNameTag(params)) {
    tags.push("trim");
  }

  return tags.length > 0 ? `_${tags.join("_")}` : "";
}

export function resolveContainer(
  params: FFmpegParams,
  context: NamingContext
): string {
  const explicit = params.container?.trim();
  if (explicit && explicit.toLowerCase() !== "auto") {
    return explicit.replace(/^\./, "").toLowerCase();
  }

  if (params.mode === "custom") {
    const format = detectCustomFormatArg(params.customArgs);
    if (format) {
      const mapped = CUSTOM_FORMAT_CONTAINER[format.toLowerCase()];
      if (mapped) return mapped;
    }
    return context.sourceContainer || "mp4";
  }

  if (params.mode === "extract_audio") {
    if (params.audioEncoder === "copy") {
      const codec = context.sourceAudioCodec?.toLowerCase();
      const mapped = codec ? AUDIO_CODEC_CONTAINER[codec] : undefined;
      return mapped || context.sourceContainer || "m4a";
    }

    const mapped = params.audioEncoder
      ? AUDIO_ENCODER_CONTAINER[params.audioEncoder]
      : undefined;
    return mapped || "m4a";
  }

  if (
    params.videoEncoder === "copy" ||
    (hasTrimRange(params) && params.trimMode !== "precise")
  ) {
    return context.sourceContainer || "mkv";
  }

  const format = detectCustomFormatArg(params.customArgs);
  if (format?.toLowerCase() === "gif" || params.videoEncoder === "gif") {
    return "gif";
  }

  return "mp4";
}

export function containerCompatibilityWarning(
  params: FFmpegParams,
  container: string
): string | null {
  const ext = container.replace(/^\./, "").toLowerCase();

  if (ext === "mp4" || ext === "mov" || ext === "m4a") {
    if (
      params.audioEncoder &&
      MP4_INCOMPATIBLE_AUDIO.has(params.audioEncoder)
    ) {
      return `音频编码 ${params.audioEncoder} 不是 ${ext.toUpperCase()} 的标准编码，建议改用 MKV 容器。`;
    }
    return null;
  }

  if (ext === "webm") {
    if (params.videoEncoder && !WEBM_VIDEO_ENCODERS.has(params.videoEncoder)) {
      return `WebM 容器不支持视频编码 ${params.videoEncoder}，请使用 VP9、AV1 或流拷贝。`;
    }
    if (params.audioEncoder && !WEBM_AUDIO_ENCODERS.has(params.audioEncoder)) {
      return `WebM 容器不支持音频编码 ${params.audioEncoder}，请使用 Opus、Vorbis 或流拷贝。`;
    }
    return null;
  }

  if (
    params.mode !== "extract_audio" &&
    params.videoEncoder !== "none" &&
    AUDIO_ONLY_CONTAINERS.has(ext)
  ) {
    return `${ext.toUpperCase()} 容器无法承载视频流，请改用 MP4/MKV 或切换为音频提取模式。`;
  }

  if (params.mode === "extract_audio" && ext === "gif") {
    return "GIF 容器无法承载音频流，请选择音频容器。";
  }

  return null;
}

export function detectCustomFormatArg(
  args: string[] | undefined
): string | null {
  if (!args || args.length === 0) return null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-f" && i + 1 < args.length) {
      return args[i + 1];
    }
    if (args[i] === "-c:v" && args[i + 1] === "gif") {
      return "gif";
    }
  }

  return null;
}

export function truncateFileName(
  name: string,
  maxLength = MAX_FILE_NAME_LENGTH
): string {
  if (maxLength <= 0 || name.length <= maxLength) return name;

  const { base, ext } = splitFileName(name);
  const extSuffix = ext ? `.${ext}` : "";
  const baseBudget = maxLength - extSuffix.length;
  if (baseBudget < 1) {
    return name.slice(0, maxLength);
  }

  return `${base.slice(0, baseBudget)}${extSuffix}`;
}

export function buildAutoOutputName(
  params: FFmpegParams,
  context: NamingContext
): string {
  const base = splitFileName(context.inputFileName).base || "output";
  const suffix = params.appendParamsToName
    ? buildParamsSuffix(params)
    : "_processed";
  const ext = resolveContainer(params, context);
  return truncateFileName(`${base}${suffix}.${ext}`);
}

export function sanitizeOutputName(name: string): string {
  const cleaned = name.trim().replace(ILLEGAL_NAME_CHARS, "");
  return truncateFileName(cleaned || "output");
}

export function makeUniqueName(
  name: string,
  exists: (candidate: string) => boolean
): string {
  if (!exists(name)) return name;

  const { base, ext } = splitFileName(name);
  const suffix = ext ? `.${ext}` : "";
  let last = name;

  for (let i = 1; i <= 100; i++) {
    last = `${base}_${i}${suffix}`;
    if (!exists(last)) return last;
  }

  return last;
}
