<template>
  <div class="tab-scroll-container no-padding">
    <div v-if="manifest.instructions" class="instructions-wrapper">
      <DocumentViewer
        :content="strippedInstructions"
        file-name="SKILL.md"
        file-type-hint="markdown"
      />
    </div>
    <el-empty v-else description="暂无指令说明" :image-size="80" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import DocumentViewer from "@/components/common/DocumentViewer.vue";
import type { SkillManifest } from "../types";

const props = defineProps<{
  manifest: SkillManifest;
}>();

/**
 * 剥离 YAML frontmatter 后的指令内容
 */
const strippedInstructions = computed(() => {
  const content = props.manifest.instructions || "";
  if (!content.trim().startsWith("---")) return content;

  const match = content.match(/^---\s*\n[\s\S]*?\n---\s*/m);
  if (match) {
    const stripped = content.slice(match[0].length);
    return stripped.trim() ? stripped : content;
  }
  return content;
});
</script>

<style scoped>
.tab-scroll-container {
  height: 100%;
  overflow-y: auto;
}

.tab-scroll-container.no-padding {
  padding: 0;
}

.instructions-wrapper {
  padding: 0;
}

/* Scrollbar Customization */
.tab-scroll-container::-webkit-scrollbar {
  width: 6px;
}

.tab-scroll-container::-webkit-scrollbar-thumb {
  background: rgba(var(--el-color-info-rgb), 0.2);
  border-radius: 10px;
}

.tab-scroll-container::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--el-color-info-rgb), 0.3);
}
</style>
