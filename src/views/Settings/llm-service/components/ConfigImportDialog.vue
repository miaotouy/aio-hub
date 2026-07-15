<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
-->

<script setup lang="ts">
import type { LlmProfile } from "@/types/llm-profiles";
import type { ParsedLlmProfileDraft } from "@/utils/llm-config-import";
import ConfigImportPanel from "./ConfigImportPanel.vue";

interface Props {
  visible: boolean;
  existingProfiles?: LlmProfile[];
}

withDefaults(defineProps<Props>(), {
  existingProfiles: () => [],
});
const emit = defineEmits<{
  (e: "update:visible", value: boolean): void;
  (e: "import", profile: ParsedLlmProfileDraft): void;
}>();

const handleImport = (profiles: ParsedLlmProfileDraft[]) => {
  if (!profiles[0]) return;
  emit("import", profiles[0]);
  emit("update:visible", false);
};
</script>

<template>
  <BaseDialog
    :model-value="visible"
    title="导入渠道配置"
    width="88%"
    height="78vh"
    @update:model-value="(value: boolean) => emit('update:visible', value)"
  >
    <template #content>
      <ConfigImportPanel
        v-if="visible"
        mode="edit"
        :existing-profiles="existingProfiles"
        @import="handleImport"
      />
    </template>
  </BaseDialog>
</template>
