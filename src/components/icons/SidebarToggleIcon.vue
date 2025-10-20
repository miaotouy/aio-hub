<template>
  <svg
    class="icon"
    viewBox="0 0 1024 1024"
    version="1.1"
    xmlns="http://www.w3.org/2000/svg"
    :width="width"
    :height="height"
    :style="style"
  >
    <path
      d="M563.505 969.33300001L413.193 1024l0-1024 150.312 54.66699999a71.86 71.86 0 0 1 47.302 67.53000001L610.807 901.803a71.86 71.86 0 0 1-47.302 67.548z"
      fill="currentColor"
    />
    <path
      d="M563.505 54.66699999a71.86 71.86 0 0 1 47.302 67.53000001L610.807 901.803a71.86 71.86 0 0 1-47.302 67.548L413.193 1024l0-19.097L557.361 952.446a53.895 53.895 0 0 0 35.391-47.24800001l0.09-3.41299999 0-779.60599999a53.895 53.895 0 0 0-32.337-49.40300001l-3.144-1.258-144.16799999-52.403L413.193 0l150.312 54.66699999z"
      fill="currentColor"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps({
  width: {
    type: [Number, String],
    default: 40,
  },
  height: {
    type: [Number, String],
    default: 40,
  },
  flip: {
    type: Boolean,
    default: false,
  },
});

const style = computed(() => ({
  transform: props.flip ? "scaleX(-1)" : undefined,
}));
</script>