<template>
  <div v-if="activeCues.length > 0" class="subtitle-overlay">
    <div
      v-for="cue in activeCues"
      :key="cue.id"
      class="subtitle-cue"
      :style="getCueStyle(cue)"
    >
      <span v-for="(line, index) in cue.lines" :key="index">
        {{ line }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CSSProperties } from "vue";
import type { SubtitleCue, SubtitleTrack } from "../types";

const props = defineProps<{
  track: SubtitleTrack | null;
  currentTime: number;
}>();

const activeCues = computed(() => {
  if (!props.track?.enabled) return [];

  return props.track.cues.filter(
    (cue) =>
      cue.startTime <= props.currentTime && cue.endTime > props.currentTime
  );
});

function getCueStyle(cue: SubtitleCue): CSSProperties {
  const style: CSSProperties = {};

  if (cue.style?.color) {
    style.color = cue.style.color;
  }
  if (cue.style?.isBold) {
    style.fontWeight = "700";
  }
  if (cue.style?.isItalic) {
    style.fontStyle = "italic";
  }
  if (
    cue.style?.fontSize &&
    cue.style.fontSize >= 12 &&
    cue.style.fontSize <= 72
  ) {
    style.fontSize = `${cue.style.fontSize}px`;
  }

  return style;
}
</script>

<style scoped>
.subtitle-overlay {
  position: absolute;
  left: 50%;
  right: auto;
  bottom: 88px;
  z-index: 16;
  width: min(86%, 1100px);
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  pointer-events: none;
  contain: layout style paint;
}

.subtitle-cue {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  max-width: 100%;
  color: #fff;
  font-size: 26px;
  font-weight: 650;
  line-height: 1.28;
  text-align: center;
  overflow-wrap: anywhere;
  text-wrap: balance;
  text-shadow:
    0 2px 3px rgba(0, 0, 0, 0.95),
    0 0 3px rgba(0, 0, 0, 0.95),
    1px 1px 1px rgba(0, 0, 0, 0.95),
    -1px -1px 1px rgba(0, 0, 0, 0.95);
}

.subtitle-cue span {
  max-width: 100%;
}

@media (max-height: 520px) {
  .subtitle-overlay {
    bottom: 72px;
  }

  .subtitle-cue {
    font-size: 22px;
  }
}

@media (max-width: 640px) {
  .subtitle-overlay {
    width: 92%;
  }

  .subtitle-cue {
    font-size: 22px;
  }
}
</style>
