<template>
  <div class="search-panel">
    <SearchInput
      v-model:pattern="pattern"
      v-model:replacement="replacement"
      v-model:is-regex="isRegex"
      v-model:case-sensitive="caseSensitive"
      v-model:whole-word="wholeWord"
      v-model:include-globs="includeGlobs"
      v-model:exclude-globs="excludeGlobs"
      v-model:use-gitignore="useGitignore"
      v-model:show-replace="showReplace"
      @search="$emit('search')"
      @replace-all="$emit('replaceAll')"
    />
    <ResultsTree
      :results="results"
      :expanded-files="expandedFiles"
      :is-searching="isSearching"
      :summary="summary"
      :progress="progress"
      :selected-file-path="selectedFilePath"
      @toggle-file="$emit('toggleFile', $event)"
      @expand-all="$emit('expandAll')"
      @collapse-all="$emit('collapseAll')"
      @cancel="$emit('cancel')"
      @select-match="(fp, m) => $emit('selectMatch', fp, m)"
    />
  </div>
</template>

<script setup lang="ts">
import SearchInput from "./SearchInput.vue";
import ResultsTree from "./ResultsTree.vue";
import type { FileSearchResult, SearchMatch, SearchProgress, SearchSummary } from "../types";

defineProps<{
  results: FileSearchResult[];
  expandedFiles: Set<string>;
  isSearching: boolean;
  summary: SearchSummary | null;
  progress: SearchProgress | null;
  selectedFilePath: string | null;
}>();

const pattern = defineModel<string>("pattern", { required: true });
const replacement = defineModel<string>("replacement", { required: true });
const isRegex = defineModel<boolean>("isRegex", { required: true });
const caseSensitive = defineModel<boolean>("caseSensitive", { required: true });
const wholeWord = defineModel<boolean>("wholeWord", { required: true });
const includeGlobs = defineModel<string>("includeGlobs", { required: true });
const excludeGlobs = defineModel<string>("excludeGlobs", { required: true });
const useGitignore = defineModel<boolean>("useGitignore", { required: true });
const showReplace = defineModel<boolean>("showReplace", { required: true });

defineEmits<{
  search: [];
  replaceAll: [];
  toggleFile: [filePath: string];
  expandAll: [];
  collapseAll: [];
  cancel: [];
  selectMatch: [filePath: string, match: SearchMatch];
}>();
</script>

<style scoped>
.search-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
</style>
