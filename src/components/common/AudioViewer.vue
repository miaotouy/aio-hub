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
        :title="displayTitle"
        :autoplay="true"
        :poster="poster"
        :artist="artist"
      />
    </div>
  </BaseDialog>
</template>

<script setup lang="ts">
import { computed } from "vue";
import BaseDialog from "./BaseDialog.vue";
import AudioPlayer from "./AudioPlayer.vue";

const props = defineProps<{
  visible: boolean;
  src: string;
  title?: string;
  poster?: string;
  artist?: string;
}>();

const emit = defineEmits<{
  (e: "update:visible", value: boolean): void;
  (e: "close"): void;
}>();

const displayTitle = computed(() => {
  if (props.title) return props.title;
  if (!props.src) return "音频预览";
  try {
    const urlParts = props.src.split(/[/\\]/);
    let name = urlParts.pop() || "";
    name = name.split("?")[0];
    return decodeURIComponent(name) || "音频预览";
  } catch {
    return "音频预览";
  }
});
</script>

<style scoped>
</style>
