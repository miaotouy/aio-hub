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

<template>
  <div class="tab-scroll-container">
    <!-- 特征属性胶囊栏 -->
    <div class="capability-bar" v-if="hasCapabilityChips">
      <div class="cap-chip" v-if="manifest.license">
        <ShieldCheck :size="12" />
        <span>{{ manifest.license }}</span>
      </div>
      <div class="cap-chip" v-if="manifest.compatibility">
        <Cpu :size="12" />
        <span>{{ manifest.compatibility }}</span>
      </div>
      <div class="cap-chip" v-if="manifest.scripts.length > 0">
        <Terminal :size="12" />
        <span>{{ manifest.scripts.length }} 个脚本</span>
      </div>
      <div class="cap-chip" v-if="manifest.files.length > 0">
        <Files :size="12" />
        <span>{{ manifest.files.length }} 个资源文件</span>
      </div>
      <div
        class="cap-chip"
        v-if="manifest.allowedTools && manifest.allowedTools.length > 0"
      >
        <Wrench :size="12" />
        <span>{{ manifest.allowedTools.length }} 个工具权限</span>
      </div>
    </div>

    <!-- 说明书主体：剥离 frontmatter 后的 SKILL.md 正文 -->
    <div v-if="strippedInstructions" class="instruction-wrapper">
      <DocumentViewer
        :content="strippedInstructions"
        file-name="SKILL.md"
        file-type-hint="markdown"
      />
    </div>
    <el-empty
      v-else
      description="该技能没有说明书正文（SKILL.md 指令内容为空）"
      :image-size="80"
    />

    <!-- 附加能力：折叠面板 -->
    <el-collapse
      v-if="hasExtraSections"
      class="extra-collapse"
      @click.stop
    >
      <el-collapse-item
        v-if="manifest.scripts.length > 0"
        :title="`可用脚本 (${manifest.scripts.length})`"
        name="scripts"
      >
        <div class="script-grid">
          <div
            v-for="script in manifest.scripts"
            :key="script.relativePath"
            class="script-card"
          >
            <div class="script-card-header">
              <span class="script-name">{{ script.name }}</span>
              <span class="lang-badge" :class="script.language">{{
                script.language
              }}</span>
            </div>
            <div class="script-path">{{ script.relativePath }}</div>
            <div class="script-description" v-if="script.description">
              {{ script.description }}
            </div>
          </div>
        </div>
      </el-collapse-item>

      <el-collapse-item
        v-if="manifest.allowedTools && manifest.allowedTools.length > 0"
        :title="`允许使用的工具 (${manifest.allowedTools.length})`"
        name="tools"
      >
        <div class="tag-group">
          <el-tag
            v-for="tool in manifest.allowedTools"
            :key="tool"
            size="small"
            effect="plain"
            round
          >
            {{ tool }}
          </el-tag>
        </div>
      </el-collapse-item>

      <el-collapse-item
        v-if="metadataEntries.length > 0"
        :title="`元数据 (${metadataEntries.length})`"
        name="metadata"
      >
        <div class="metadata-table">
          <div
            v-for="[key, value] in metadataEntries"
            :key="key"
            class="metadata-row"
          >
            <span class="meta-key">{{ key }}</span>
            <span class="meta-value">{{ value }}</span>
          </div>
        </div>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  ShieldCheck,
  Cpu,
  Terminal,
  Wrench,
  Files,
} from "lucide-vue-next";
import DocumentViewer from "@/components/common/DocumentViewer.vue";
import type { SkillManifest } from "../types";

const props = defineProps<{
  manifest: SkillManifest;
}>();

const hasCapabilityChips = computed(() => {
  return Boolean(
    props.manifest.license ||
      props.manifest.compatibility ||
      props.manifest.scripts.length > 0 ||
      props.manifest.files.length > 0 ||
      (props.manifest.allowedTools && props.manifest.allowedTools.length > 0)
  );
});

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

const metadataEntries = computed(() => {
  return Object.entries(props.manifest.metadata ?? {});
});

const hasExtraSections = computed(() => {
  return (
    props.manifest.scripts.length > 0 ||
    (props.manifest.allowedTools && props.manifest.allowedTools.length > 0) ||
    metadataEntries.value.length > 0
  );
});
</script>

<style scoped>
.tab-scroll-container {
  height: 100%;
  overflow-y: auto;
  padding: 20px 24px;
}

/* 特征属性胶囊栏 */
.capability-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.cap-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-color-secondary);
  background: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 999px;
  line-height: 1.2;
}

.cap-chip :deep(svg) {
  color: var(--el-color-primary);
  flex-shrink: 0;
}

/* 说明书主体 */
.instruction-wrapper {
  margin-bottom: 16px;
}

/* 折叠面板 */
.extra-collapse {
  margin-bottom: 16px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.extra-collapse :deep(.el-collapse-item__header) {
  padding: 0 16px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
  background: var(--input-bg);
}

.extra-collapse :deep(.el-collapse-item__content) {
  padding: 12px 16px;
}

/* Script Styles */
.script-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.script-card {
  padding: 12px;
  background: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  transition: all 0.2s;
}

.script-card:hover {
  border-color: var(--el-color-primary-light-5);
  background: rgba(var(--el-color-primary-rgb), 0.02);
}

.script-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.script-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
}

.lang-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(var(--el-color-info-rgb), 0.1);
  color: var(--el-color-info);
}

.lang-badge.python {
  color: #3776ab;
  background: rgba(55, 118, 171, 0.1);
}
.lang-badge.javascript {
  color: #b8860b;
  background: rgba(184, 134, 11, 0.1);
}
.lang-badge.powershell {
  color: #4a7ebb;
  background: rgba(74, 126, 187, 0.1);
}
.lang-badge.batch {
  color: #8a8a8a;
  background: rgba(138, 138, 138, 0.1);
}
.lang-badge.rust {
  color: #dea584;
  background: rgba(222, 165, 132, 0.1);
}
.lang-badge.go {
  color: #00add8;
  background: rgba(0, 173, 216, 0.1);
}

.script-path {
  font-size: 11px;
  color: var(--text-color-secondary);
  font-family: var(--el-font-family-mono);
  margin-bottom: 6px;
}

.script-description {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.tag-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.metadata-table {
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.metadata-row {
  display: flex;
  padding: 10px 16px;
  border-bottom: var(--border-width) solid var(--border-color);
}

.metadata-row:last-child {
  border-bottom: none;
}

.meta-key {
  width: 120px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-secondary);
  flex-shrink: 0;
}

.meta-value {
  font-size: 12px;
  color: var(--text-color);
  word-break: break-all;
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
