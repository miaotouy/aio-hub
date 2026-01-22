<template>
  <div class="media-info-container">
    <div class="info-header">
      <div class="header-left">
        <el-icon><Info /></el-icon>
        <span class="title">媒体详细信息</span>
      </div>
      <div class="header-actions">
        <el-button-group>
          <el-button :icon="Copy" size="small" @click="copyAsText">复制文本</el-button>
          <el-button :icon="Code" size="small" @click="copyAsJson">复制 JSON</el-button>
        </el-button-group>
      </div>
    </div>

    <div class="info-scroll-area">
      <div class="info-section">
        <div class="section-title">容器信息</div>
        <div class="info-grid">
          <div class="info-item">
            <span class="label">格式</span>
            <span class="value">{{ info.format.format_long_name }}</span>
          </div>
          <div class="info-item">
            <span class="label">大小</span>
            <span class="value">{{ formatSize(info.format.size) }}</span>
          </div>
          <div class="info-item">
            <span class="label">时长</span>
            <span class="value">{{ formatFullDuration(info.format.duration) }}</span>
          </div>
          <div class="info-item">
            <span class="label">总码率</span>
            <span class="value">{{ formatBitrate(info.format.bit_rate) }}</span>
          </div>
        </div>
      </div>

      <div v-for="stream in info.streams" :key="stream.index" class="info-section">
        <div class="section-title">
          {{ stream.codec_type === "video" ? "视频流" : "音频流" }} ({{ stream.index }})
        </div>
        <div class="info-grid">
          <div class="info-item">
            <span class="label">编码</span>
            <span class="value">{{ stream.codec_long_name }}</span>
          </div>
          <div class="info-item" v-if="stream.profile">
            <span class="label">Profile</span>
            <span class="value">{{ stream.profile }}</span>
          </div>
          <template v-if="stream.codec_type === 'video'">
            <div class="info-item">
              <span class="label">分辨率</span>
              <span class="value">{{ stream.width }}x{{ stream.height }}</span>
            </div>
            <div class="info-item" v-if="stream.display_aspect_ratio">
              <span class="label">宽高比</span>
              <span class="value">{{ stream.display_aspect_ratio }}</span>
            </div>
            <div class="info-item">
              <span class="label">帧率</span>
              <span class="value">{{ stream.avg_frame_rate }} fps</span>
            </div>
            <div class="info-item" v-if="stream.pix_fmt">
              <span class="label">像素格式</span>
              <span class="value">{{ stream.pix_fmt }}</span>
            </div>
            <div class="info-item" v-if="stream.bits_per_raw_sample">
              <span class="label">位深度</span>
              <span class="value">{{ stream.bits_per_raw_sample }} bits</span>
            </div>
          </template>
          <template v-else-if="stream.codec_type === 'audio'">
            <div class="info-item">
              <span class="label">采样率</span>
              <span class="value">{{ stream.sample_rate }} Hz</span>
            </div>
            <div class="info-item">
              <span class="label">声道数</span>
              <span class="value">{{ stream.channels }}</span>
            </div>
            <div class="info-item" v-if="stream.channel_layout">
              <span class="label">声道布局</span>
              <span class="value">{{ stream.channel_layout }}</span>
            </div>
          </template>
          <div class="info-item" v-if="stream.bit_rate">
            <span class="label">码率</span>
            <span class="value">{{ formatBitrate(stream.bit_rate) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Info, Copy, Code } from "lucide-vue-next";
import type { FFProbeOutput } from "../types";
import { customMessage } from "@/utils/customMessage";

const props = defineProps<{
  info: FFProbeOutput;
}>();

const formatSize = (bytes?: number | string) => {
  if (!bytes) return "--";
  const b = typeof bytes === "string" ? parseInt(bytes) : bytes;
  if (isNaN(b)) return bytes.toString();
  const mb = b / (1024 * 1024);
  if (mb > 1024) {
    return `${(mb / 1024).toFixed(2)} GiB`;
  }
  return `${mb.toFixed(2)} MiB`;
};

const formatBitrate = (bitrate?: string) => {
  if (!bitrate) return "--";
  const b = parseInt(bitrate);
  if (isNaN(b)) return bitrate;
  return `${(b / 1000).toFixed(0)} Kbps`;
};

const formatFullDuration = (duration?: string) => {
  if (!duration) return "--";
  const totalSeconds = parseFloat(duration);
  if (isNaN(totalSeconds)) return duration;

  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const ms = Math.floor((totalSeconds % 1) * 1000);

  let result = "";
  if (h > 0) result += `${h}h `;
  if (m > 0 || h > 0) result += `${m}mn `;
  result += `${s}s`;
  if (ms > 0) result += ` ${ms}ms`;

  return result;
};

const copyAsText = () => {
  const lines = [
    `文件名: ${props.info.format.filename}`,
    `格式: ${props.info.format.format_long_name}`,
    `大小: ${formatSize(props.info.format.size)}`,
    `时长: ${formatFullDuration(props.info.format.duration)}`,
    `码率: ${formatBitrate(props.info.format.bit_rate)}`,
    "",
    "流详情:",
  ];

  props.info.streams.forEach((s) => {
    lines.push(`- [${s.codec_type}] ${s.codec_long_name}`);
    if (s.codec_type === "video") {
      lines.push(`  分辨率: ${s.width}x${s.height}`);
      lines.push(`  帧率: ${s.avg_frame_rate} fps`);
    } else if (s.codec_type === "audio") {
      lines.push(`  采样率: ${s.sample_rate} Hz`);
      lines.push(`  声道: ${s.channels}`);
    }
  });

  navigator.clipboard.writeText(lines.join("\n"));
  customMessage.success("已复制到剪贴板");
};

const copyAsJson = () => {
  navigator.clipboard.writeText(JSON.stringify(props.info, null, 2));
  customMessage.success("已复制 JSON 到剪贴板");
};
</script>

<style scoped>
.media-info-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--card-bg);
  color: var(--text-color);
}

.info-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
  color: var(--primary-color);
}

.info-scroll-area {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.info-section {
  margin-bottom: 20px;
}

.info-section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color-light);
  margin-bottom: 12px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border-color);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.info-item .label {
  font-size: 11px;
  color: var(--text-color-light);
  opacity: 0.7;
}

.info-item .value {
  font-size: 13px;
  color: var(--text-color);
  word-break: break-all;
}

.info-scroll-area::-webkit-scrollbar {
  width: 6px;
}

.info-scroll-area::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}
</style>
