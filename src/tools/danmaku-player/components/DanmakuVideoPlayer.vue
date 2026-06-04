<template>
  <div class="danmaku-video-player">
    <VideoPlayer
      ref="playerRef"
      :src="src"
      :title="title"
      :autoplay="autoplay"
      @play="handlePlay"
      @pause="handlePause"
      @timeupdate="handleTimeUpdate"
      @seeked="handleSeeked"
    >
      <!-- 弹幕层：无弹幕时彻底卸载 canvas，减少一个 GPU 合成层 -->
      <template #overlay>
        <DanmakuCanvas v-if="hasDanmakus" ref="canvasComponentRef" />
        <!-- ASS/SSA 使用 JASSUB 高保真渲染，其他格式使用 DOM 渲染 -->
        <SubtitleOverlay
          v-if="hasSubtitles && !useJassub"
          :track="subtitleTrack"
          :current-time="subtitleCurrentTime"
        />
        <!-- JASSUB canvas 模式：放在 overlay slot 内，与弹幕 canvas 同层，不影响 video 合成 -->
        <JassubRenderer
          v-if="useJassub && videoElement"
          :video="videoElement"
          :raw-content="subtitleTrack!.rawContent!"
          :enabled="subtitleTrack!.enabled"
          @error="useJassubFallback = true"
        />
      </template>

      <!-- 控制栏扩展：弹幕开关与设置 -->
      <template #controls-extra>
        <div class="danmaku-controls">
          <!-- 弹幕开关 -->
          <button
            class="control-btn danmaku-toggle"
            :class="{ 'is-active': config.enabled }"
            :title="config.enabled ? '关闭弹幕 (d)' : '开启弹幕 (d)'"
            @click="config.enabled = !config.enabled"
          >
            <div class="danmaku-icon-wrapper">
              <Tv :size="20" />
              <div v-if="config.enabled" class="active-badge">
                <Check :size="10" stroke-width="4" />
              </div>
            </div>
          </button>

          <!-- 字幕开关 -->
          <button
            v-if="subtitleTrack"
            class="control-btn subtitle-toggle"
            :class="{ 'is-active': subtitleTrack.enabled }"
            :title="subtitleTrack.enabled ? '关闭字幕' : '开启字幕'"
            @click="subtitleTrack.enabled = !subtitleTrack.enabled"
          >
            <Captions :size="20" />
          </button>

          <!-- 弹幕设置 -->
          <el-popover
            placement="top"
            :width="280"
            trigger="click"
            popper-class="danmaku-settings-popper"
          >
            <template #reference>
              <button class="control-btn settings-toggle" title="弹幕设置">
                <Settings2 :size="20" />
              </button>
            </template>
            <DanmakuSettingsPanel :config="config" />
          </el-popover>
        </div>
      </template>
    </VideoPlayer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { Captions, Tv, Settings2, Check } from "lucide-vue-next";
import VideoPlayer from "@/components/common/VideoPlayer.vue";
import DanmakuCanvas from "./DanmakuCanvas.vue";
import SubtitleOverlay from "./SubtitleOverlay.vue";
import JassubRenderer from "./JassubRenderer.vue";
import DanmakuSettingsPanel from "./DanmakuSettingsPanel.vue";
import { useDanmakuRenderer } from "../composables/useDanmakuRenderer";
import type {
  ParsedDanmaku,
  DanmakuConfig,
  AssScriptInfo,
  SubtitleTrack,
} from "../types";

const props = defineProps<{
  src: string;
  title?: string;
  autoplay?: boolean;
  danmakus: ParsedDanmaku[];
  scriptInfo: AssScriptInfo;
  config: DanmakuConfig;
  subtitleTrack: SubtitleTrack | null;
}>();

const playerRef = ref<any>(null);
const canvasComponentRef = ref<any>(null);
const subtitleCurrentTime = ref(0);
const isPlaying = ref(false);
const useJassubFallback = ref(false);
let subtitleAnimationId: number | null = null;

const hasDanmakus = computed(() => props.danmakus.length > 0);
const hasSubtitles = computed(
  () => (props.subtitleTrack?.cues.length ?? 0) > 0
);

/** 是否使用 JASSUB 渲染（ASS/SSA 且有原始内容，且未降级） */
const useJassub = computed(() => {
  if (useJassubFallback.value) return false;
  const track = props.subtitleTrack;
  if (!track) return false;
  return (
    (track.format === "ass" || track.format === "ssa") && !!track.rawContent
  );
});

/** 获取底层 video 元素 */
const videoElement = computed<HTMLVideoElement | null>(
  () => playerRef.value?.videoRef ?? null
);

const {
  initEngine,
  setDanmakus,
  updateConfig,
  updateScriptInfo,
  startRender,
  stopRender,
  clearCanvas,
} = useDanmakuRenderer();

onMounted(() => {
  tryInitEngine();
  window.addEventListener("keydown", handleGlobalKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleGlobalKeydown);
  stopSubtitleClock();
});

/**
 * 处理全局快捷键
 */
function handleGlobalKeydown(e: KeyboardEvent) {
  // 如果用户正在输入，则忽略
  if (
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLTextAreaElement
  )
    return;

  if (e.key.toLowerCase() === "d") {
    e.preventDefault();
    props.config.enabled = !props.config.enabled;
  }
}

function tryInitEngine() {
  const canvas = canvasComponentRef.value?.canvasRef;
  if (!canvas) {
    // 如果 canvas 还没挂载，可能是 v-if 延迟，尝试在 nextTick 后再试一次
    return;
  }
  initEngine(canvas, props.config, props.scriptInfo);
  setDanmakus(props.danmakus);

  // 如果初始就在播放（autoplay），启动渲染
  if (playerRef.value?.isPlaying) {
    handlePlay();
  }
}

// 监听数据变化
watch(
  () => props.danmakus,
  (newVal) => {
    setDanmakus(newVal);
  },
  { deep: true }
);

// 当弹幕数据从无到有时，canvas 刚挂载，需要重新初始化引擎
watch(hasDanmakus, (val) => {
  if (val) {
    // canvas 通过 v-if 刚挂载，nextTick 后才能拿到 DOM
    setTimeout(() => tryInitEngine(), 0);
  }
});

watch(
  () => props.config,
  (newVal) => {
    updateConfig(newVal);
  },
  { deep: true }
);

watch(
  () => props.scriptInfo,
  (newVal) => {
    updateScriptInfo(newVal);
  },
  { deep: true }
);

// 同步播放状态
function handlePlay() {
  isPlaying.value = true;
  syncSubtitleTime();
  startSubtitleClock();
  startRender(() => playerRef.value?.currentTime || 0);
}

function handlePause() {
  isPlaying.value = false;
  syncSubtitleTime();
  stopSubtitleClock();
  stopRender();
}

function handleTimeUpdate() {
  syncSubtitleTime();
}

function handleSeeked() {
  syncSubtitleTime();
  // seek 后清除画布，防止残影，下一帧会自动渲染新位置的弹幕
  clearCanvas();
}

function syncSubtitleTime() {
  subtitleCurrentTime.value = playerRef.value?.currentTime || 0;
}

function startSubtitleClock() {
  if (subtitleAnimationId !== null || !hasSubtitles.value) return;

  const loop = () => {
    syncSubtitleTime();
    subtitleAnimationId = requestAnimationFrame(loop);
  };
  subtitleAnimationId = requestAnimationFrame(loop);
}

function stopSubtitleClock() {
  if (subtitleAnimationId === null) return;
  cancelAnimationFrame(subtitleAnimationId);
  subtitleAnimationId = null;
}

watch(hasSubtitles, (value) => {
  if (value && isPlaying.value) {
    startSubtitleClock();
  } else if (!value) {
    stopSubtitleClock();
  }
});
</script>

<style scoped>
.danmaku-video-player {
  width: 100%;
  height: 100%;
  position: relative;
}

.danmaku-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-right: 8px;
}

.danmaku-icon-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.active-badge {
  position: absolute;
  bottom: -4px;
  right: -4px;
  background: var(--el-color-primary);
  color: white;
  border-radius: 4px;
  width: 12px;
  height: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid #000;
}

.danmaku-toggle.is-active {
  color: var(--el-color-primary);
}

.subtitle-toggle.is-active {
  color: var(--el-color-primary);
}

/* 复用 VideoPlayer 的按钮样式 */
.control-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.control-btn:hover {
  color: white;
  background: rgba(255, 255, 255, 0.1);
}
</style>

<style>
.danmaku-settings-popper {
  padding: 12px !important;
  background: rgba(28, 28, 30, 0.9) !important;
  backdrop-filter: blur(12px) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
}
</style>
