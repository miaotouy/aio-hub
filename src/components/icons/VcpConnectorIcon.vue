<template>
  <Waypoints v-bind="$attrs" />
</template>

<script setup lang="ts">
import { Waypoints } from "lucide-vue-next";

defineOptions({
  name: "VcpConnectorIcon",
  inheritAttrs: false,
});
</script>
