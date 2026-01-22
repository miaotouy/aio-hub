export type ProcessingMode = "video" | "extract_audio" | "convert" | "custom";

export interface FFmpegProgress {
  percent: number; // 0-100
  currentTime: number; // 处理进度(秒)
  speed: string; // 如 "1.5x"
  bitrate: string;
}

export interface FFmpegTask {
  id: string;
  logs?: string[];
  name: string;
  inputPath: string;
  outputPath: string;
  mode: ProcessingMode;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  progress: FFmpegProgress;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export interface FFmpegConfig {
  ffmpegPath: string;
  defaultWorkDir: string;
  maxConcurrentTasks: number;
  hardwareAcceleration: boolean;
  autoCleanup: boolean;
}

export interface MediaMetadata {
  duration?: number;
  fps?: number;
  width?: number;
  height?: number;
  hasAudio: boolean;
  size?: number;
  format?: string;
}

export interface FFProbeStream {
  index: number;
  codec_name?: string;
  codec_long_name?: string;
  profile?: string;
  codec_type: "video" | "audio" | string;
  width?: number;
  height?: number;
  display_aspect_ratio?: string;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  bit_rate?: string;
  bits_per_raw_sample?: string;
  pix_fmt?: string;
  color_range?: string;
  color_space?: string;
  color_primaries?: string;
  color_transfer?: string;
  sample_rate?: string;
  channels?: number;
  channel_layout?: string;
  duration?: string;
  nb_frames?: string;
}

export interface FFProbeFormat {
  filename: string;
  nb_streams: number;
  format_name: string;
  format_long_name: string;
  duration: string;
  size: string;
  bit_rate: string;
}

export interface FFProbeOutput {
  streams: FFProbeStream[];
  format: FFProbeFormat;
}

export interface FFmpegParams {
  mode: ProcessingMode;
  inputPath: string;
  outputPath: string;
  ffmpegPath: string;
  hwaccel: boolean;

  // 视频参数
  videoEncoder?: string; // libx264, libx265, h264_nvenc, etc.
  preset?: string; // ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow, placebo
  crf?: number;
  videoBitrate?: string;
  scale?: string; // e.g. "1920:-2"
  fps?: number;
  pixelFormat?: string; // yuv420p, yuv422p, etc.

  // 音频参数
  audioEncoder?: string; // aac, libmp3lame, opus, flac, copy
  audioBitrate?: string;
  sampleRate?: string;
  audioChannels?: number;

  // 其他
  customArgs?: string[];
  maxSizeMb?: number; // 仍然保留用于自动计算
}