<template>
  <span>{{ displayedContent }}</span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { unescapeVcpMarkers } from "../../utils/vcp-utils";

const props = defineProps<{
  nodeId: string;
  content: string;
}>();

const displayedContent = computed(() => unescapeVcpMarkers(props.content));
</script>
