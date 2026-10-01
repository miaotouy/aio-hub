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
  <div class="skill-overview-root">
    <div class="skill-overview-container">
      <!-- 主工作区：说明书正文（流式 Markdown 渲染，自然外层滚动） -->
      <div class="overview-main">
        <div class="markdown-wrapper">
          <RichTextRenderer
            v-if="hasInstructions"
            :content="manifest.instructions"
            :version="RendererVersion.V2_CUSTOM_PARSER"
            class="overview-markdown"
          />
          <el-empty
            v-else
            description="该技能没有说明书正文（SKILL.md 指令内容为空）"
            :image-size="80"
            class="empty-instructions"
          />
        </div>
      </div>

      <!-- 元数据侧边栏：属性规格、脚本、工具权限与元数据 -->
      <div class="overview-sidebar" v-if="hasSidebarContent">
        <!-- 1. 属性与规格 -->
        <div class="sidebar-section" v-if="hasProperties">
          <h4 class="section-title">规格属性</h4>
          <div class="property-list">
            <div class="property-item" v-if="manifest.license">
              <div class="property-label">
                <ShieldCheck :size="13" class="item-icon" />
                <span>许可证</span>
              </div>
              <div class="property-value">
                {{ manifest.license }}
              </div>
            </div>

            <div class="property-item" v-if="manifest.compatibility">
              <div class="property-label">
                <Cpu :size="13" class="item-icon" />
                <span>环境兼容性</span>
              </div>
              <div class="property-value">
                {{ manifest.compatibility }}
              </div>
            </div>

            <div class="property-item" v-if="manifest.files.length > 0">
              <div class="property-label">
                <Files :size="13" class="item-icon" />
                <span>资源文件</span>
              </div>
              <div class="property-value">
                {{ manifest.files.length }} 个文件
              </div>
            </div>
          </div>
        </div>

        <!-- 2. 依赖工具权限 -->
        <div
          class="sidebar-section"
          v-if="manifest.allowedTools && manifest.allowedTools.length > 0"
        >
          <div class="section-header">
            <h4 class="section-title">工具权限</h4>
            <span class="section-count">{{
              manifest.allowedTools.length
            }}</span>
          </div>
          <div class="tag-group">
            <el-tag
              v-for="tool in manifest.allowedTools"
              :key="tool"
              size="small"
              effect="plain"
              round
              class="tool-tag"
            >
              <Wrench :size="11" class="tag-icon" />
              <span>{{ tool }}</span>
            </el-tag>
          </div>
        </div>

        <!-- 3. 可用脚本列表 -->
        <div class="sidebar-section" v-if="manifest.scripts.length > 0">
          <div class="section-header">
            <h4 class="section-title">可用脚本</h4>
            <span class="section-count">{{ manifest.scripts.length }}</span>
          </div>
          <div class="script-list">
            <div
              v-for="script in manifest.scripts"
              :key="script.relativePath"
              class="script-card"
            >
              <div class="script-card-header">
                <span class="script-name" :title="script.name">{{
                  script.name
                }}</span>
                <span class="lang-badge" :class="script.language">{{
                  script.language
                }}</span>
              </div>
              <div class="script-path" :title="script.relativePath">
                {{ script.relativePath }}
              </div>
              <div class="script-description" v-if="script.description">
                {{ script.description }}
              </div>
            </div>
          </div>
        </div>

        <!-- 4. 扩展元数据 -->
        <div class="sidebar-section" v-if="metadataEntries.length > 0">
          <div class="section-header">
            <h4 class="section-title">元数据</h4>
            <span class="section-count">{{ metadataEntries.length }}</span>
          </div>
          <div class="metadata-list">
            <div
              v-for="[key, value] in metadataEntries"
              :key="key"
              class="metadata-card"
            >
              <div class="meta-header">
                <span class="meta-key" :title="key">
                  <component
                    :is="getMetaIcon(key)"
                    :size="12"
                    class="meta-icon"
                  />
                  <span>{{ key }}</span>
                </span>
                <div class="meta-actions">
                  <button
                    v-if="isUrl(value)"
                    type="button"
                    class="meta-action-btn"
                    title="在浏览器中打开链接"
                    @click="handleOpenUrl(value)"
                  >
                    <ExternalLink :size="12" />
                  </button>
                  <button
                    type="button"
                    class="meta-action-btn"
                    :title="copiedKey === key ? '已复制' : '复制内容'"
                    @click="handleCopy(key, value)"
                  >
                    <Check
                      v-if="copiedKey === key"
                      :size="12"
                      class="copied-icon"
                    />
                    <Copy v-else :size="12" />
                  </button>
                </div>
              </div>
              <div class="meta-value-container">
                <a
                  v-if="isUrl(value)"
                  class="meta-value is-url"
                  :href="value"
                  :title="value"
                  @click.prevent="handleOpenUrl(value)"
                >
                  {{ value }}
                </a>
                <span v-else class="meta-value" :title="value">
                  {{ value }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  ShieldCheck,
  Cpu,
  Wrench,
  Files,
  ExternalLink,
  Copy,
  Check,
  Link,
  Globe,
  User,
  Tag,
  Hash,
} from "lucide-vue-next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useClipboard } from "@vueuse/core";
import { customMessage } from "@/utils/customMessage";
import RichTextRenderer from "@/tools/rich-text-renderer/RichTextRenderer.vue";
import { RendererVersion } from "@/tools/rich-text-renderer/types";
import type { SkillManifest } from "../types";
const props = defineProps<{
  manifest: SkillManifest;
}>();

const hasInstructions = computed(() => {
  return Boolean(props.manifest.instructions?.trim());
});

const metadataEntries = computed(() => {
  return Object.entries(props.manifest.metadata ?? {});
});

const hasProperties = computed(() => {
  return Boolean(
    props.manifest.license ||
    props.manifest.compatibility ||
    props.manifest.files.length > 0
  );
});

const hasSidebarContent = computed(() => {
  return Boolean(
    hasProperties.value ||
    (props.manifest.allowedTools && props.manifest.allowedTools.length > 0) ||
    props.manifest.scripts.length > 0 ||
    metadataEntries.value.length > 0
  );
});

const copiedKey = ref<string | null>(null);
const { copy } = useClipboard();

function isUrl(value: string): boolean {
  if (typeof value !== "string") return false;
  return /^https?:\/\//i.test(value.trim());
}

async function handleOpenUrl(url: string) {
  try {
    await openUrl(url.trim());
  } catch {
    window.open(url.trim(), "_blank");
  }
}

async function handleCopy(key: string, val: string) {
  try {
    await copy(val);
    copiedKey.value = key;
    customMessage.success(`已复制 ${key}`);
    setTimeout(() => {
      if (copiedKey.value === key) {
        copiedKey.value = null;
      }
    }, 1800);
  } catch {
    customMessage.error("复制失败");
  }
}

function getMetaIcon(key: string) {
  const lower = key.toLowerCase();
  if (
    lower.includes("source") ||
    lower.includes("url") ||
    lower.includes("repo") ||
    lower.includes("link")
  ) {
    return Link;
  }
  if (
    lower.includes("home") ||
    lower.includes("site") ||
    lower.includes("web")
  ) {
    return Globe;
  }
  if (
    lower.includes("author") ||
    lower.includes("creator") ||
    lower.includes("maintainer") ||
    lower.includes("owner")
  ) {
    return User;
  }
  if (
    lower.includes("version") ||
    lower.includes("ver") ||
    lower.includes("tag") ||
    lower.includes("release")
  ) {
    return Tag;
  }
  if (lower.includes("license")) {
    return ShieldCheck;
  }
  return Hash;
}
</script>

<style scoped>
.skill-overview-root {
  width: 100%;
  height: 100%;
  overflow: hidden;
  container-type: inline-size;
  container-name: overview-panel;
}

.skill-overview-container {
  width: 100%;
  height: 100%;
  display: flex;
  overflow: hidden;
  background: transparent;
}

/* 主内容区 */
.overview-main {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.markdown-wrapper {
  padding: 24px 32px;
  max-width: 900px;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
}

.overview-markdown {
  color: var(--text-color);
  font-size: 14px;
  line-height: 1.65;
}

.empty-instructions {
  padding: 60px 20px;
}

/* 侧边栏 */
.overview-sidebar {
  width: 280px;
  flex-shrink: 0;
  border-left: var(--border-width) solid var(--border-color);
  overflow-y: auto;
  overflow-x: hidden; /* 防御微小溢出引起的横向滚动条 */
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  box-sizing: border-box;
}

.sidebar-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.section-count {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 10px;
  color: var(--text-color-secondary);
  background: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
}

/* 属性规格项 */
.property-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.property-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.property-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-color-secondary);
  flex-shrink: 0;
  white-space: nowrap;
}

.property-value {
  display: block;
  padding: 4px 10px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-color);
  background: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  width: fit-content;
  max-width: 100%;
  box-sizing: border-box;
  word-break: break-word;
  white-space: normal;
}

.item-icon {
  color: var(--el-color-primary);
  flex-shrink: 0;
}

/* 工具权限 */
.tag-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tool-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  box-sizing: border-box;
}

.tag-icon {
  opacity: 0.8;
  flex-shrink: 0;
}

/* 脚本列表 */
.script-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.script-card {
  padding: 10px 12px;
  background: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  box-sizing: border-box;
  width: 100%;
  transition:
    border-color 0.2s,
    background-color 0.2s;
}

.script-card:hover {
  border-color: rgba(var(--el-color-primary-rgb), 0.5);
  background: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.04)
  );
}

.script-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.script-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lang-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(var(--el-color-info-rgb), 0.1);
  color: var(--el-color-info);
  flex-shrink: 0;
  text-transform: lowercase;
}

.lang-badge.python {
  color: #3776ab;
  background: rgba(55, 118, 171, 0.15);
}

.lang-badge.javascript,
.lang-badge.typescript {
  color: #b8860b;
  background: rgba(184, 134, 11, 0.15);
}

.lang-badge.powershell {
  color: #4a7ebb;
  background: rgba(74, 126, 187, 0.15);
}

.lang-badge.bash,
.lang-badge.shell {
  color: #2b5b84;
  background: rgba(43, 91, 132, 0.15);
}

.lang-badge.batch {
  color: #8a8a8a;
  background: rgba(138, 138, 138, 0.15);
}

.lang-badge.rust {
  color: #dea584;
  background: rgba(222, 165, 132, 0.15);
}

.lang-badge.go {
  color: #00add8;
  background: rgba(0, 173, 216, 0.15);
}

.script-path {
  font-size: 11px;
  color: var(--text-color-secondary);
  font-family: var(--el-font-family-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.script-description {
  font-size: 11px;
  color: var(--text-color-secondary);
  margin-top: 4px;
  line-height: 1.4;
}

/* 元数据卡片列表 */
.metadata-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.metadata-card {
  padding: 8px 10px;
  background: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  box-sizing: border-box;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  transition:
    border-color 0.2s,
    background-color 0.2s;
}

.metadata-card:hover {
  border-color: rgba(var(--el-color-primary-rgb), 0.4);
  background: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.03)
  );
}

.meta-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-width: 0;
}

.meta-key {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-color-secondary);
  font-family: var(--el-font-family-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.meta-icon {
  color: var(--el-color-primary);
  flex-shrink: 0;
  opacity: 0.85;
}

.meta-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.meta-action-btn {
  background: transparent;
  border: none;
  padding: 2px 4px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-color-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    color 0.15s,
    background-color 0.15s;
}

.meta-action-btn:hover {
  color: var(--el-color-primary);
  background: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.12)
  );
}

.copied-icon {
  color: var(--el-color-success);
}

.meta-value-container {
  min-width: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-color);
  word-break: break-all;
}

.meta-value {
  display: inline;
  word-break: break-all;
  font-family: var(--el-font-family-mono);
}

.meta-value.is-url {
  color: var(--el-color-primary);
  text-decoration: none;
  cursor: pointer;
  transition: opacity 0.15s;
}

.meta-value.is-url:hover {
  text-decoration: underline;
  opacity: 0.85;
}

/* 统一精致滚动条定制 */
.skill-overview-container::-webkit-scrollbar,
.overview-main::-webkit-scrollbar,
.overview-sidebar::-webkit-scrollbar {
  width: 6px;
}

.skill-overview-container::-webkit-scrollbar-thumb,
.overview-main::-webkit-scrollbar-thumb,
.overview-sidebar::-webkit-scrollbar-thumb {
  background: rgba(var(--el-color-info-rgb), 0.2);
  border-radius: 10px;
}

.skill-overview-container::-webkit-scrollbar-thumb:hover,
.overview-main::-webkit-scrollbar-thumb:hover,
.overview-sidebar::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--el-color-info-rgb), 0.35);
}

/* 中等宽度：紧凑双栏 */
@container overview-panel (max-width: 900px) and (min-width: 681px) {
  .overview-sidebar {
    width: 230px;
    padding: 16px 12px;
  }

  .markdown-wrapper {
    padding: 20px 24px;
  }
}

/* 窄宽度：单列自适应，元数据置顶展示，整页统一平滑滚动 */
@container overview-panel (max-width: 680px) {
  .skill-overview-container {
    flex-direction: column;
    overflow-y: auto;
    overflow-x: hidden;
    height: 100%;
  }

  /* 1. 元数据置顶，用户第一时间掌握特征与配置 */
  .overview-sidebar {
    order: 1;
    flex: none;
    width: 100%;
    border-left: none;
    border-bottom: var(--border-width) solid var(--border-color);
    overflow: visible;
    padding: 16px 18px 20px;
    background: rgba(var(--el-color-info-rgb), 0.02);
  }

  /* 2. 说明书正文在下方展开 */
  .overview-main {
    order: 2;
    flex: none;
    width: 100%;
    overflow: visible;
  }

  .markdown-wrapper {
    padding: 16px 18px 28px;
    max-width: 100%;
  }

  /* 窄屏下规格属性流式排布，不占用过多纵向高度 */
  .property-list {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 12px;
  }

  .property-item {
    flex-direction: row;
    align-items: flex-start;
    gap: 8px;
    max-width: 100%;
  }

  .property-item .property-label {
    padding-top: 4px;
  }

  .property-item .property-value {
    flex: 1;
    min-width: 0;
  }

  /* 脚本卡片在全宽下自适应网格，提升空间利用率 */
  .script-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 10px;
  }

  /* 元数据卡片在窄屏下自适应网格 */
  .metadata-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 10px;
  }
}
</style>
