<!-- Copyright 2025-2026 miaotouy(Github@miaotouy) -->
<script setup lang="ts">
import MacroSelector from "@/tools/agent-manager/components/selectors/MacroSelector.vue";
import { useMessageInputStore } from "../../stores/messageInputStore";
import type { MacroDefinition } from "../../macro-engine";
const inputStore = useMessageInputStore();
const emit = defineEmits<{ complete: [] }>();
function insert(macro: MacroDefinition) {
  inputStore.handleInsertMacro(macro);
  emit("complete");
}
</script>
<template><MacroSelector inline @insert="insert" /></template>
