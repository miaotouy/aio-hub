<template>
  <div class="tab-scroll-container">
    <!-- 核心信息卡片 -->
    <div class="info-grid">
      <div class="info-card" v-if="manifest.license">
        <div class="info-label"><ShieldCheck :size="14" /> 许可证</div>
        <div class="info-value">{{ manifest.license }}</div>
      </div>
      <div class="info-card" v-if="manifest.compatibility">
        <div class="info-label"><Cpu :size="14" /> 兼容性</div>
        <div class="info-value">{{ manifest.compatibility }}</div>
      </div>
    </div>

    <!-- 脚本列表 -->
    <div
      class="content-section"
      v-if="manifest.scripts && manifest.scripts.length > 0"
    >
      <div class="section-header">
        <Terminal :size="16" />
        <span>可用脚本</span>
      </div>
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
    </div>

    <!-- 允许的工具 -->
    <div
      class="content-section"
      v-if="manifest.allowedTools && manifest.allowedTools.length > 0"
    >
      <div class="section-header">
        <Wrench :size="16" />
        <span>允许使用的工具</span>
      </div>
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
    </div>

    <!-- 元数据 -->
    <div
      class="content-section"
      v-if="manifest.metadata && Object.keys(manifest.metadata).length > 0"
    >
      <div class="section-header">
        <Database :size="16" />
        <span>元数据</span>
      </div>
      <div class="metadata-table">
        <div
          v-for="(value, key) in manifest.metadata"
          :key="key"
          class="metadata-row"
        >
          <span class="meta-key">{{ key }}</span>
          <span class="meta-value">{{ value }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ShieldCheck, Cpu, Terminal, Database, Wrench } from "lucide-vue-next";
import type { SkillManifest } from "../types";

defineProps<{
  manifest: SkillManifest;
}>();
</script>

<style scoped>
.tab-scroll-container {
  height: 100%;
  overflow-y: auto;
  padding: 20px 24px;
}

/* Overview Styles */
.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.info-card {
  padding: 12px 16px;
  background: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
}

.info-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-color-secondary);
  text-transform: uppercase;
  margin-bottom: 4px;
}

.info-value {
  font-size: 14px;
  color: var(--text-color);
  font-weight: 500;
}

.content-section {
  margin-bottom: 24px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 12px;
}

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
  color: #f7df1e;
  background: rgba(247, 223, 30, 0.1);
}
.lang-badge.powershell {
  color: #012456;
  background: rgba(1, 36, 86, 0.1);
}
.lang-badge.batch {
  color: #4d4d4d;
  background: rgba(77, 77, 77, 0.1);
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
