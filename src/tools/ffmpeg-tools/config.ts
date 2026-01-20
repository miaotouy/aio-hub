import type { FFmpegConfig } from "./types";

export const DEFAULT_FFMPEG_CONFIG: FFmpegConfig = {
  ffmpegPath: "ffmpeg",
  defaultWorkDir: "",
  maxConcurrentTasks: 2,
  hardwareAcceleration: true,
  autoCleanup: false,
};