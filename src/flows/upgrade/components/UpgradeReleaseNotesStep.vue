<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->
<script setup lang="ts">
import { computed } from "vue";
import RichTextRenderer from "@/tools/rich-text-renderer/RichTextRenderer.vue";
import { RendererVersion } from "@/tools/rich-text-renderer/types";
import { releaseNotesRegistry } from "../releaseNotesRegistry";
import type { UpgradeFlowContext } from "../types";

const props = defineProps<{ context: UpgradeFlowContext }>();

const manifests = computed(() =>
  props.context.releaseVersions
    .map((version) => releaseNotesRegistry.get(version))
    .filter((manifest) => manifest !== undefined)
    .sort((left, right) => {
      if (left.version === props.context.primaryReleaseVersion) return -1;
      if (right.version === props.context.primaryReleaseVersion) return 1;
      return 0;
    })
);
const primary = computed(
  () =>
    releaseNotesRegistry.get(props.context.primaryReleaseVersion) ??
    manifests.value[0]
);
const history = computed(() =>
  manifests.value.filter(
    (manifest) => manifest.version !== primary.value?.version
  )
);
</script>

<template>
  <div class="release-notes-step">
    <div v-if="primary" class="release-heading">
      <div>
        <span class="release-version">v{{ primary.version }}</span>
        <h3>{{ primary.title }}</h3>
        <p>{{ primary.summary }}</p>
      </div>
      <time :datetime="primary.publishedAt">{{ primary.publishedAt }}</time>
    </div>

    <div v-if="primary" class="release-body">
      <RichTextRenderer
        :content="primary.body"
        :version="RendererVersion.V2_CUSTOM_PARSER"
        :enable-enter-animation="false"
      />
    </div>

    <el-collapse v-if="history.length" class="history-notes">
      <el-collapse-item
        v-for="manifest in history"
        :key="manifest.version"
        :title="`v${manifest.version} · ${manifest.title}`"
        :name="manifest.version"
      >
        <RichTextRenderer
          :content="manifest.body"
          :version="RendererVersion.V2_CUSTOM_PARSER"
          :enable-enter-animation="false"
        />
      </el-collapse-item>
    </el-collapse>

    <el-empty
      v-if="!primary"
      description="此构建未包含可显示的本地版本说明"
      :image-size="72"
    />
  </div>
</template>

<style scoped>
.release-notes-step {
  display: grid;
  gap: 18px;
}

.release-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
}

.release-version {
  color: var(--el-color-primary);
  font-size: 13px;
  font-weight: 700;
}

h3 {
  margin: 5px 0 7px;
  color: var(--text-color);
  font-size: 20px;
}

p,
time {
  margin: 0;
  color: var(--text-color-secondary);
  font-size: 13px;
  line-height: 1.6;
}

time {
  flex: none;
}

.release-body {
  min-width: 0;
}

.history-notes {
  border-top: 1px solid var(--border-color);
}
</style>
