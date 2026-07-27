<script setup lang="ts">
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  RotateCcw,
  X,
} from "lucide-vue-next";
import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  watch,
} from "vue";
import MediaAudioPlayer from "./MediaAudioPlayer.vue";
import MediaImageViewer from "./MediaImageViewer.vue";
import MediaVideoPlayer from "./MediaVideoPlayer.vue";
import type { MediaItem, MediaPreviewMode } from "./types";
import { useManagedMediaPreview } from "./useManagedMediaPreview";

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    item: MediaItem;
    items?: MediaItem[];
    initialIndex?: number;
    mode?: MediaPreviewMode;
    /** Optional caller-owned selector for the inline image element. */
    imageTestId?: string;
  }>(),
  {
    items: undefined,
    initialIndex: 0,
    mode: "inline",
  }
);

const emit = defineEmits<{
  "update:modelValue": [visible: boolean];
  "index-change": [index: number];
  "play-state-change": [playing: boolean];
  error: [assetId: string, code: string];
}>();

const managed = useManagedMediaPreview();
const immersive = ref(false);
const currentIndex = ref(props.initialIndex);
const audioRef = ref<InstanceType<typeof MediaAudioPlayer> | null>(null);
const videoRef = ref<InstanceType<typeof MediaVideoPlayer> | null>(null);
let sourceFocus: HTMLElement | null = null;
let previousBodyOverflow = "";
let historyEntryActive = false;
let wasDeactivated = false;

const mediaItems = computed(() =>
  props.items?.length ? props.items : [props.item]
);
const currentItem = computed(
  () => mediaItems.value[currentIndex.value] ?? props.item
);
const errorMessage = computed(() => {
  switch (managed.errorCode.value) {
    case "asset-unavailable":
      return "原件不可用或已被清理";
    case "expired":
      return "预览已过期，请重试";
    case "range-unsupported":
      return "当前资源不支持分段播放";
    case "unsupported-format":
      return "当前设备无法解码此媒体格式";
    default:
      return "无法加载媒体预览";
  }
});

function setImmersive(value: boolean) {
  if (immersive.value === value) return;
  immersive.value = value;
  if (value) {
    audioRef.value?.pause();
    videoRef.value?.pause();
    sourceFocus = document.activeElement as HTMLElement | null;
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!historyEntryActive) {
      window.history.pushState({ mediaPreview: true }, "");
      historyEntryActive = true;
    }
  } else {
    document.body.style.overflow = previousBodyOverflow;
    void nextTick(() => sourceFocus?.focus());
  }
}

async function closeImmersive() {
  audioRef.value?.pause();
  videoRef.value?.pause();
  if (document.fullscreenElement)
    await document.exitFullscreen().catch(() => undefined);
  setImmersive(false);
}

async function requestClose() {
  if (immersive.value || document.fullscreenElement) {
    if (historyEntryActive) {
      window.history.back();
    } else {
      await closeImmersive();
    }
    return;
  }
  emit("update:modelValue", false);
}

async function onPopState() {
  if (!immersive.value) return;
  historyEntryActive = false;
  await closeImmersive();
  if (props.mode !== "inline") emit("update:modelValue", false);
}

async function suspendPreview() {
  audioRef.value?.pause();
  videoRef.value?.pause();
  // A route navigation already owns history movement. Do not call history.back()
  // from a deactivated keep-alive view, otherwise it can undo the route change.
  historyEntryActive = false;
  await closeImmersive();
  await managed.close();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape" || !props.modelValue) return;
  event.preventDefault();
  void requestClose();
}

async function openCurrent() {
  await managed.open(currentItem.value);
}

async function changeIndex(offset: number) {
  const nextIndex = currentIndex.value + offset;
  if (nextIndex < 0 || nextIndex >= mediaItems.value.length) return;
  const previousIndex = currentIndex.value;
  currentIndex.value = nextIndex;
  await openCurrent();
  if (managed.state.value === "error") {
    currentIndex.value = previousIndex;
    await openCurrent();
    return;
  }
  emit("index-change", nextIndex);
}

watch(
  () => props.modelValue,
  async (visible) => {
    if (!visible) {
      if (historyEntryActive) {
        historyEntryActive = false;
        window.history.back();
      }
      await closeImmersive();
      await managed.close();
      return;
    }
    currentIndex.value = Math.min(
      Math.max(0, props.initialIndex),
      mediaItems.value.length - 1
    );
    if (props.mode !== "inline") setImmersive(true);
    await openCurrent();
  },
  { immediate: true }
);

watch(
  () => managed.errorCode.value,
  (code) => {
    if (code && managed.item.value)
      emit("error", managed.item.value.assetId, code);
  }
);

watch(
  () =>
    `${props.item.assetId}:${props.items?.map((item) => item.assetId).join("|") ?? ""}`,
  async () => {
    if (props.modelValue) {
      currentIndex.value = Math.min(
        currentIndex.value,
        mediaItems.value.length - 1
      );
      await openCurrent();
    }
  }
);

onMounted(() => {
  window.addEventListener("popstate", onPopState);
  window.addEventListener("keydown", onKeydown);
});

onActivated(() => {
  if (!wasDeactivated) return;
  wasDeactivated = false;
  if (props.modelValue) void openCurrent();
});

onDeactivated(() => {
  wasDeactivated = true;
  void suspendPreview();
});

onBeforeUnmount(() => {
  window.removeEventListener("popstate", onPopState);
  window.removeEventListener("keydown", onKeydown);
  void suspendPreview();
});
</script>

<template>
  <div
    v-if="modelValue"
    class="media-preview-host"
    :class="`mode-${mode}`"
    :data-state="managed.state.value"
  >
    <div
      v-if="
        managed.state.value === 'opening' || managed.state.value === 'loading'
      "
      class="media-status"
      data-testid="media-preview-loading"
    >
      <LoaderCircle class="spin" :size="24" />
      <span>正在准备预览</span>
    </div>

    <div
      v-if="managed.state.value === 'error'"
      class="media-status media-error"
      data-testid="media-preview-error"
    >
      <AlertCircle :size="24" />
      <span>{{ errorMessage }}</span>
      <button type="button" @click="managed.retry">
        <RotateCcw :size="17" />
        重试
      </button>
    </div>

    <div v-if="managed.source.value" class="media-inline-stage">
      <MediaImageViewer
        v-if="currentItem.kind === 'image'"
        :src="managed.source.value.url"
        :alt="currentItem.displayName"
        :image-test-id="imageTestId"
        @ready="managed.markReady"
        @error="managed.markMediaError"
        @open="setImmersive(true)"
      />
      <MediaVideoPlayer
        v-else-if="currentItem.kind === 'video'"
        :src="managed.source.value.url"
        :title="currentItem.displayName"
        @ready="managed.markReady"
        @error="managed.markMediaError"
        @expand="setImmersive(true)"
        @play-state-change="emit('play-state-change', $event)"
      />
      <MediaAudioPlayer
        v-else
        ref="audioRef"
        :src="managed.source.value.url"
        :title="currentItem.displayName"
        @ready="managed.markReady"
        @error="managed.markMediaError"
        @expand="setImmersive(true)"
        @play-state-change="emit('play-state-change', $event)"
      />
    </div>

    <Teleport to="body">
      <section
        v-if="immersive && managed.source.value"
        class="media-immersive-layer"
        role="dialog"
        aria-modal="true"
        :aria-label="`预览 ${currentItem.displayName}`"
        data-testid="media-preview-immersive"
      >
        <header class="immersive-header">
          <button type="button" aria-label="关闭媒体预览" @click="requestClose">
            <X :size="22" />
          </button>
          <strong>{{ currentItem.displayName }}</strong>
          <span v-if="mediaItems.length > 1">
            {{ currentIndex + 1 }} / {{ mediaItems.length }}
          </span>
        </header>

        <MediaImageViewer
          v-if="currentItem.kind === 'image'"
          :src="managed.source.value.url"
          :alt="currentItem.displayName"
          immersive
          @ready="managed.markReady"
          @error="managed.markMediaError"
          @close="requestClose"
        />
        <MediaVideoPlayer
          v-else-if="currentItem.kind === 'video'"
          ref="videoRef"
          :src="managed.source.value.url"
          :title="currentItem.displayName"
          immersive
          @ready="managed.markReady"
          @error="managed.markMediaError"
          @play-state-change="emit('play-state-change', $event)"
        />
        <div v-else class="audio-sheet">
          <MediaAudioPlayer
            ref="audioRef"
            :src="managed.source.value.url"
            :title="currentItem.displayName"
            expanded
            @ready="managed.markReady"
            @error="managed.markMediaError"
            @play-state-change="emit('play-state-change', $event)"
          />
        </div>

        <template v-if="mediaItems.length > 1 && currentItem.kind === 'image'">
          <button
            class="gallery-button gallery-previous"
            type="button"
            aria-label="上一项"
            :disabled="currentIndex === 0"
            @click="changeIndex(-1)"
          >
            <ChevronLeft :size="24" />
          </button>
          <button
            class="gallery-button gallery-next"
            type="button"
            aria-label="下一项"
            :disabled="currentIndex === mediaItems.length - 1"
            @click="changeIndex(1)"
          >
            <ChevronRight :size="24" />
          </button>
        </template>
      </section>
    </Teleport>
  </div>
</template>

<style scoped>
.media-preview-host {
  position: relative;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  min-height: 112px;
  overflow: hidden;
  background: #101214;
  border-radius: var(--app-radius-md);
  box-sizing: border-box;
}

.media-status {
  position: absolute;
  z-index: 2;
  inset: 0;
  min-height: 112px;
  padding: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  color: #fff;
  background: #101214;
  box-sizing: border-box;
}

.media-error {
  flex-direction: column;
  color: var(--text-color);
  background: var(--input-bg);
  text-align: center;
}

.media-error button {
  min-height: 44px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--primary-color);
  background: transparent;
  border: 1px solid var(--primary-color);
  border-radius: var(--app-radius-md);
}

.media-inline-stage {
  min-width: 0;
  max-width: 100%;
  min-height: 112px;
}

.media-immersive-layer {
  position: fixed;
  z-index: 1400;
  inset: 0;
  display: grid;
  grid-template-rows: 1fr;
  color: #fff;
  background: #090a0b;
  isolation: isolate;
}

.immersive-header {
  position: absolute;
  z-index: 3;
  top: 0;
  right: 0;
  left: 0;
  min-height: calc(58px + env(safe-area-inset-top));
  padding: env(safe-area-inset-top) 12px 0;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  background: rgb(9 10 11 / 78%);
  box-sizing: border-box;
}

.immersive-header button,
.gallery-button {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  color: #fff;
  background: rgb(20 22 24 / 72%);
  border: 1px solid rgb(255 255 255 / 18%);
  border-radius: var(--app-radius-md);
}

.immersive-header strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: 0;
}

.immersive-header span {
  min-width: 48px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.audio-sheet {
  align-self: end;
  color: var(--text-color);
  background: var(--overlay-bg);
  border-radius: var(--app-radius-xl) var(--app-radius-xl) 0 0;
}

.gallery-button {
  position: absolute;
  z-index: 3;
  top: 50%;
  transform: translateY(-50%);
}

.gallery-button:disabled {
  opacity: 0.35;
}

.gallery-previous {
  left: 10px;
}

.gallery-next {
  right: 10px;
}

.spin {
  animation: spin 800ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
