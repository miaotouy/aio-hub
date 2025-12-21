<template>
  <BaseDialog
    :model-value="visible"
    @update:model-value="emit('update:visible', $event)"
    :title="displayTitle"
    width="90%"
    max-width="1200px"
    content-class="audio-viewer-content"
    @close="emit('close')"
  >
    <div class="player-wrapper">
      <AudioPlayer
        v-if="visible"
        :src="src"
        :title="title || displayTitle"
        :autoplay="true"
        :poster="poster"
        :artist="artist"
        :playlist="playlist"
        :initial-index="initialIndex"
      />
    </div>
  </BaseDialog>
</template>

<script setup lang="ts">
import { computed } from "vue";
import BaseDialog from "./BaseDialog.vue";
import AudioPlayer, { type AudioItem } from "./AudioPlayer.vue";

const props = defineProps<{
  visible: boolean;
  src?: string;
  title?: string;
  poster?: string;
  artist?: string;
  playlist?: AudioItem[];
  initialIndex?: number;
}>();

const emit = defineEmits<{
  (e: "update:visible", value: boolean): void;
  (e: "close"): void;
}>();

const displayTitle = computed(() => {
  if (props.title) return props.title;
  if (!props.src && (!props.playlist || props.playlist.length === 0)) return "音频预览";

  const targetSrc = props.src || (props.playlist && props.playlist[props.initialIndex || 0]?.src);
  if (!targetSrc) return "音频预览";

  try {
    const urlParts = targetSrc.split(/[/\\]/);
    let name = urlParts.pop() || "";
    name = name.split("?")[0];
    return decodeURIComponent(name) || "音频预览";
  } catch {
    return "音频预览";
  }
});
</script>

<style scoped>
.audio-viewer-content {
  padding: 0;
  display: flex;
  flex-direction: column;
}
.player-wrapper {
  flex: 1;
  display: flex;
  overflow: hidden;
}
</style>
