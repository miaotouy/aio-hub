<template>
  <el-form :model="params" label-position="top" class="params-form">
    <el-form-item label="处理模式" class="mode-select">
      <el-radio-group v-model="params.mode" class="mode-group">
        <el-radio-button value="video">视频</el-radio-button>
        <el-radio-button value="extract_audio">音频</el-radio-button>
        <el-radio-button value="convert">转换</el-radio-button>
        <el-radio-button value="custom">自定义</el-radio-button>
      </el-radio-group>
    </el-form-item>

    <!-- 视频配置区 -->
    <template v-if="params.mode !== 'extract_audio'">
      <el-divider content-position="left">视频配置</el-divider>

      <!-- 简单模式：质量预设 -->
      <template v-if="!isProfessional">
        <div class="form-row">
          <el-form-item label="编码格式" class="flex-1">
            <el-select v-model="params.videoEncoder" placeholder="选择编码器">
              <el-option label="H.264 (兼容性好)" value="libx264" />
              <el-option label="H.265 (体积更小)" value="libx265" />
              <el-option label="流拷贝 (不重编码)" value="copy" />
            </el-select>
          </el-form-item>
          <el-form-item label="输出质量" class="flex-1" v-if="params.videoEncoder !== 'copy'">
            <el-select v-model="qualityPreset" placeholder="选择质量">
              <el-option label="极高 (CRF 18)" value="high" />
              <el-option label="平衡 (CRF 23)" value="medium" />
              <el-option label="紧凑 (CRF 26)" value="low" />
              <el-option label="极小 (CRF 30)" value="lowest" />
            </el-select>
          </el-form-item>
        </div>
        <div class="form-row">
          <el-form-item label="分辨率缩放" class="flex-1">
            <el-select v-model="params.scale" clearable placeholder="保持原始">
              <el-option label="4K (3840p)" value="scale=3840:-2" />
              <el-option label="2K (2560p)" value="scale=2560:-2" />
              <el-option label="1080p (FHD)" value="scale=1920:-2" />
              <el-option label="720p (HD)" value="scale=1280:-2" />
              <el-option label="480p (SD)" value="scale=854:-2" />
            </el-select>
          </el-form-item>
        </div>
      </template>

      <!-- 专业模式：详细视频参数 -->
      <template v-else>
        <div class="form-row">
          <el-form-item label="视频编码器" class="flex-1">
            <el-select v-model="params.videoEncoder" placeholder="自动选择" clearable>
              <el-option label="H.264 (libx264)" value="libx264" />
              <el-option label="H.265 (libx265)" value="libx265" />
              <el-option label="AV1 (libaom-av1)" value="libaom-av1" />
              <el-option label="VP9 (libvpx-vp9)" value="libvpx-vp9" />
              <el-option label="NVIDIA H.264 (NVENC)" value="h264_nvenc" />
              <el-option label="Intel H.264 (QSV)" value="h264_qsv" />
              <el-option label="直接流拷贝 (Copy)" value="copy" />
            </el-select>
          </el-form-item>
          <el-form-item label="编码预设 (Preset)" class="flex-1">
            <el-select v-model="params.preset" placeholder="默认">
              <el-option label="Ultrafast" value="ultrafast" />
              <el-option label="Superfast" value="superfast" />
              <el-option label="Veryfast" value="veryfast" />
              <el-option label="Faster" value="faster" />
              <el-option label="Fast" value="fast" />
              <el-option label="Medium" value="medium" />
              <el-option label="Slow" value="slow" />
              <el-option label="Slower" value="slower" />
              <el-option label="Veryslow" value="veryslow" />
              <el-option label="Placebo" value="placebo" />
            </el-select>
          </el-form-item>
        </div>

        <div class="form-row">
          <el-form-item label="画质控制" class="flex-1">
            <el-radio-group v-model="strategy" size="small">
              <el-radio-button value="crf">CRF</el-radio-button>
              <el-radio-button value="bitrate">码率</el-radio-button>
              <el-radio-button value="size">大小</el-radio-button>
            </el-radio-group>
          </el-form-item>

          <el-form-item v-if="strategy === 'crf'" label="CRF 值 (0-51)" class="flex-1">
            <el-input-number v-model="params.crf" :min="0" :max="51" />
          </el-form-item>
          <el-form-item v-else-if="strategy === 'bitrate'" label="视频码率" class="flex-1">
            <el-input v-model="params.videoBitrate" placeholder="e.g. 4000k" />
          </el-form-item>
          <el-form-item v-else label="目标大小 (MB)" class="flex-1">
            <el-input-number v-model="params.maxSizeMb" :min="1" :precision="1" />
          </el-form-item>
        </div>

        <div class="form-row">
          <el-form-item label="分辨率缩放" class="flex-1">
            <el-select v-model="params.scale" clearable placeholder="保持原始">
              <el-option label="4K (3840p)" value="scale=3840:-2" />
              <el-option label="2K (2560p)" value="scale=2560:-2" />
              <el-option label="1080p (FHD)" value="scale=1920:-2" />
              <el-option label="720p (HD)" value="scale=1280:-2" />
              <el-option label="480p (SD)" value="scale=854:-2" />
            </el-select>
          </el-form-item>
          <el-form-item label="帧率 (FPS)" class="flex-1">
            <el-input-number v-model="params.fps" :min="1" :max="120" placeholder="默认" />
          </el-form-item>
        </div>

        <el-form-item label="像素格式 (Pixel Format)">
          <el-select v-model="params.pixelFormat" clearable placeholder="自动选择">
            <el-option label="yuv420p (兼容性最好)" value="yuv420p" />
            <el-option label="yuv422p" value="yuv422p" />
            <el-option label="yuv444p" value="yuv444p" />
            <el-option label="yuv420p10le (10-bit)" value="yuv420p10le" />
            <el-option label="nv12" value="nv12" />
          </el-select>
        </el-form-item>
      </template>
    </template>

    <!-- 音频配置区 -->
    <el-divider content-position="left">
      {{ params.mode === "extract_audio" ? "音频提取配置" : "音频配置" }}
    </el-divider>

    <!-- 简单音频配置 (非音频模式且非专业模式) -->
    <template v-if="!isProfessional && params.mode !== 'extract_audio'">
      <div class="form-row">
        <el-form-item label="音频编码" class="flex-1">
          <el-select v-model="params.audioEncoder">
            <el-option label="AAC (默认)" value="aac" />
            <el-option label="直接流拷贝 (Copy)" value="copy" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="params.audioEncoder !== 'copy'" label="音频质量" class="flex-1">
          <el-select v-model="params.audioBitrate">
            <el-option label="标准 (128 kbps)" value="128k" />
            <el-option label="高音质 (192 kbps)" value="192k" />
            <el-option label="超高音质 (320 kbps)" value="320k" />
            <el-option label="语音 (64 kbps)" value="64k" />
          </el-select>
        </el-form-item>
      </div>
    </template>

    <!-- 增强音频配置 (音频模式 或 专业模式) -->
    <template v-else>
      <div class="form-row">
        <el-form-item label="音频编码器" class="flex-1">
          <el-select v-model="params.audioEncoder">
            <el-option label="AAC (推荐)" value="aac" />
            <el-option label="MP3" value="libmp3lame" />
            <el-option label="Opus" value="libopus" />
            <el-option label="FLAC (无损)" value="flac" />
            <el-option label="直接流拷贝 (Copy)" value="copy" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="params.audioEncoder !== 'copy'" label="音频比特率" class="flex-1">
          <el-select v-model="params.audioBitrate">
            <el-option label="64 kbps" value="64k" />
            <el-option label="128 kbps" value="128k" />
            <el-option label="192 kbps" value="192k" />
            <el-option label="320 kbps" value="320k" />
          </el-select>
        </el-form-item>
      </div>
      <div class="form-row" v-if="params.audioEncoder !== 'copy'">
        <el-form-item label="采样率" class="flex-1">
          <el-select v-model="params.sampleRate" clearable placeholder="保持原始">
            <el-option label="44100 Hz" value="44100" />
            <el-option label="48000 Hz" value="48000" />
            <el-option label="96000 Hz" value="96000" />
          </el-select>
        </el-form-item>
        <el-form-item label="声道" class="flex-1">
          <el-select v-model="params.audioChannels" clearable placeholder="保持原始">
            <el-option label="单声道 (Mono)" :value="1" />
            <el-option label="双声道 (Stereo)" :value="2" />
            <el-option label="5.1 声道" :value="6" />
          </el-select>
        </el-form-item>
      </div>
    </template>

    <template v-if="isProfessional || params.mode === 'custom'">
      <el-divider content-position="left">高级选项</el-divider>
      <div class="advanced-options">
        <div class="switch-row">
          <span>硬件加速 (解码/编码)</span>
          <el-switch v-model="params.hwaccel" />
        </div>
        <el-form-item label="自定义参数 (Custom Arguments)">
          <el-input
            v-model="customArgsStr"
            type="textarea"
            :rows="2"
            placeholder="例如: -threads 4 -aspect 16:9"
          />
          <div class="help-text">每个参数用空格分隔，将直接传递给 FFmpeg</div>
        </el-form-item>
      </div>
    </template>
  </el-form>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import type { FFmpegParams } from "../types";

const props = defineProps<{
  params: FFmpegParams;
  isProfessional: boolean;
}>();

const strategy = ref<"crf" | "bitrate" | "size">("crf");
const customArgsStr = ref("");
const qualityPreset = ref("medium");

const qualityMap: Record<string, number> = {
  high: 18,
  medium: 23,
  low: 26,
  lowest: 30,
};

// 监听质量预设变化
watch(qualityPreset, (val) => {
  if (!props.isProfessional) {
    props.params.crf = qualityMap[val];
  }
});

// 监听专业模式切换，如果在简单模式，强制使用 CRF 策略
watch(
  () => props.isProfessional,
  (isPro) => {
    if (!isPro) {
      strategy.value = "crf";
      props.params.crf = qualityMap[qualityPreset.value];
      props.params.videoBitrate = undefined;
      props.params.maxSizeMb = undefined;
    }
  },
  { immediate: true }
);

// 监听策略变化，清除互斥参数
watch(strategy, (s) => {
  if (s === "crf") {
    props.params.maxSizeMb = undefined;
    props.params.videoBitrate = undefined;
    if (props.params.crf === undefined) props.params.crf = qualityMap[qualityPreset.value] || 23;
  } else if (s === "bitrate") {
    props.params.maxSizeMb = undefined;
    props.params.crf = undefined;
    if (!props.params.videoBitrate) props.params.videoBitrate = "4000k";
  } else {
    props.params.crf = undefined;
    props.params.videoBitrate = undefined;
    if (!props.params.maxSizeMb) props.params.maxSizeMb = 50;
  }
});

// 监听自定义参数字符串
watch(customArgsStr, (val) => {
  if (!val.trim()) {
    props.params.customArgs = undefined;
  } else {
    props.params.customArgs = val.trim().split(/\s+/);
  }
});

// 监听模式变化，自动设置一些默认值
watch(
  () => props.params.mode,
  (mode) => {
    if (mode === "convert") {
      props.params.videoEncoder = "copy";
      props.params.audioEncoder = "copy";
    } else if (mode === "extract_audio") {
      props.params.videoEncoder = undefined;
      props.params.audioEncoder = "aac";
    } else {
      // video 模式
      props.params.videoEncoder = undefined;
      // 保持之前的音频选择，如果是从 convert 切换过来，默认给 aac
      if (props.params.audioEncoder === "copy" && mode === "video") {
        // 允许在视频模式下使用 copy，所以这里不强制改
      } else {
        props.params.audioEncoder = "aac";
      }
    }
  }
);

// 监听音频编码器变化，如果是 copy，清除比特率
watch(
  () => props.params.audioEncoder,
  (enc) => {
    if (enc === "copy") {
      props.params.audioBitrate = undefined;
      props.params.sampleRate = undefined;
      props.params.audioChannels = undefined;
    } else if (!props.params.audioBitrate) {
      props.params.audioBitrate = "128k";
    }
  }
);
</script>

<style scoped>
.params-form {
  padding: 4px;
}

.mode-select {
  margin-bottom: 16px;
}

.mode-group {
  width: 100%;
  display: flex;
}

.mode-group :deep(.el-radio-button) {
  flex: 1;
}

.mode-group :deep(.el-radio-button__inner) {
  width: 100%;
}

.form-row {
  display: flex;
  gap: 16px;
}

.flex-1 {
  flex: 1;
}

.advanced-options {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.switch-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  color: var(--text-color);
  padding: 8px 0;
}

.help-text {
  font-size: 12px;
  color: var(--text-color-light);
  line-height: 1.4;
  margin-top: 4px;
}

:deep(.el-divider--horizontal) {
  margin: 24px 0 16px 0;
}

:deep(.el-form-item__label) {
  font-weight: 600;
  padding-bottom: 4px !important;
}
</style>
