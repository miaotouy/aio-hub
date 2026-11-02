<!-- Copyright 2025-2026 miaotouy(Github@miaotouy) -->
<!-- SPDX-License-Identifier: Apache-2.0 -->
<script setup lang="ts">
import LazyPanelHost from "@/components/common/LazyPanelHost.vue";
import { useBackgroundTaskSync } from "../composables/useBackgroundTaskSync";
import { useCompanionSession } from "../composables/useCompanionSession";

// Restoration and cross-window actions stay available while the view is closed.
useBackgroundTaskSync();
const { isOpen, closeCompanion } = useCompanionSession();
const loadView = () => import("./CompanionSessionSheet.vue");
</script>

<template>
  <LazyPanelHost
    :open="isOpen"
    :loader="loadView"
    title="伴随会话"
    @close="closeCompanion"
  />
</template>
