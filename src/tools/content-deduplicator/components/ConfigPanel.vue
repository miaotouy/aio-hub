<template>
  <InfoCard title="查重配置" class="config-card">
    <div class="config-content">
      <!-- 预设选择 -->
      <div class="config-section preset-section">
        <label>快速预设</label>
        <div class="preset-grid">
          <div
            v-for="preset in presets"
            :key="preset.id"
            class="preset-item"
            :class="{ active: store.config.preset === preset.id }"
            @click="handlePresetChange(preset.id)"
          >
            <component :is="getPresetIcon(preset.icon)" :size="18" />
            <div class="preset-info">
              <span class="preset-name">{{ preset.label }}</span>
              <span class="preset-desc">{{ preset.description }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 扫描路径 -->
      <div class="config-section">
        <label>扫描路径</label>
        <DropZone
          variant="input"
          :directory-only="true"
          :multiple="false"
          hide-content
          @drop="handlePathDrop"
        >
          <div class="path-input-group">
            <el-input
              v-model="store.scanPath"
              placeholder="输入或拖拽目录路径"
              @keyup.enter="emit('scan')"
            />
            <el-button @click="selectDirectory" :icon="FolderOpened">选择</el-button>
          </div>
        </DropZone>
      </div>

      <!-- 规范化选项 -->
      <div class="config-section">
        <label>规范化选项</label>
        <div class="normalize-options">
          <el-checkbox v-model="store.config.normalizeOptions.ignoreWhitespace">
            忽略空白字符
          </el-checkbox>
          <el-checkbox v-model="store.config.normalizeOptions.ignorePunctuation">
            忽略标点符号
          </el-checkbox>
          <el-checkbox v-model="store.config.normalizeOptions.caseSensitive">
            区分大小写
          </el-checkbox>
          <el-checkbox v-model="store.config.normalizeOptions.preserveLineBreaks">
            保留换行结构
          </el-checkbox>
        </div>
      </div>

      <!-- 高级选项 -->
      <el-collapse v-model="advancedOpen" class="config-section">
        <el-collapse-item name="advanced" title="高级选项">
          <div class="filter-item">
            <span class="filter-label">扩展名白名单（留空扫描所有文本文件）</span>
            <el-input
              v-model="extensionsInput"
              placeholder="例如: ts,js,vue,py（逗号分隔）"
              clearable
              @change="syncExtensions"
            />
          </div>

          <div class="filter-item">
            <span class="filter-label">忽略模式</span>
            <el-input
              v-model="ignorePatternsInput"
              placeholder="例如: node_modules,.git,dist"
              clearable
              @change="syncIgnorePatterns"
            />
          </div>

          <div class="filter-item">
            <span class="filter-label">最大文件大小 (MB)</span>
            <el-input-number
              v-model="store.config.maxFileSizeMb"
              :min="1"
              :max="500"
              controls-position="right"
              class="full-width"
            />
          </div>

          <div class="filter-item">
            <span class="filter-label">尺寸差异阈值</span>
            <div class="slider-wrapper">
              <el-slider
                v-model="sizeDiffPercent"
                :min="1"
                :max="50"
                :format-tooltip="(v: number) => `${v}%`"
                @change="syncSizeDiff"
              />
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>

    <div class="button-footer">
      <el-button
        v-if="!store.isScanning"
        type="primary"
        @click="emit('scan')"
        :disabled="!store.scanPath"
        class="action-btn"
      >
        <Search :size="16" style="margin-right: 5px" />
        开始扫描
      </el-button>
      <el-button v-else type="warning" @click="emit('stop')" class="action-btn">
        <Square :size="16" style="margin-right: 5px" />
        停止扫描
      </el-button>
    </div>
  </InfoCard>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { FolderOpened } from "@element-plus/icons-vue";
import { Search, Square, FileText, ShieldCheck, Code, BookOpen } from "lucide-vue-next";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import InfoCard from "@components/common/InfoCard.vue";
import DropZone from "@components/common/DropZone.vue";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useContentDeduplicatorStore } from "../stores/store";
import { PRESETS } from "../config/presets";

const errorHandler = createModuleErrorHandler("tools/content-deduplicator/ConfigPanel");

const emit = defineEmits<{
  (e: "scan"): void;
  (e: "stop"): void;
}>();

const store = useContentDeduplicatorStore();
const presets = PRESETS;
const advancedOpen = ref<string[]>([]);

// 图标映射
const iconMap: Record<string, any> = { FileText, ShieldCheck, Code, BookOpen };
const getPresetIcon = (name: string) => iconMap[name] ?? FileText;

// 扩展名和忽略模式的输入绑定
const extensionsInput = ref(store.config.extensions.join(","));
const ignorePatternsInput = ref(store.config.ignorePatterns.join(","));
const sizeDiffPercent = ref(Math.round(store.config.sizeDiffThreshold * 100));

function syncExtensions() {
  store.config.extensions = extensionsInput.value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function syncIgnorePatterns() {
  store.config.ignorePatterns = ignorePatternsInput.value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function syncSizeDiff(val: number) {
  store.config.sizeDiffThreshold = val / 100;
}

function handlePresetChange(presetId: string) {
  store.applyPreset(presetId);
  // 同步输入框
  extensionsInput.value = store.config.extensions.join(",");
  ignorePatternsInput.value = store.config.ignorePatterns.join(",");
  sizeDiffPercent.value = Math.round(store.config.sizeDiffThreshold * 100);
  customMessage.success(`已应用预设: ${presets.find((p) => p.id === presetId)?.label}`);
}

function handlePathDrop(paths: string[]) {
  if (paths.length > 0) {
    store.scanPath = paths[0];
    customMessage.success(`已设置扫描路径`);
  }
}

async function selectDirectory() {
  try {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: "选择要扫描的目录",
    });
    if (typeof selected === "string") {
      store.scanPath = selected;
    }
  } catch (error) {
    errorHandler.error(error, "选择目录失败");
  }
}
</script>

<style scoped>
.config-card {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.config-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.config-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.button-footer {
  flex-shrink: 0;
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.config-section {
  margin-bottom: 20px;
}

.config-section > label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

.preset-section {
  padding-bottom: 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.preset-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.preset-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
  cursor: pointer;
  transition: all 0.2s;
  background-color: var(--card-bg);
}

.preset-item:hover {
  border-color: var(--el-color-primary-light-5);
}

.preset-item.active {
  border-color: var(--el-color-primary);
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity, 1) * 0.08));
}

.preset-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.preset-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
}

.preset-desc {
  font-size: 11px;
  color: var(--text-color-light);
  line-height: 1.3;
}

.path-input-group {
  display: flex;
  gap: 8px;
}

.normalize-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filter-item {
  margin-bottom: 16px;
}

.filter-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--text-color-light);
}

.full-width {
  width: 100%;
}

.slider-wrapper {
  padding: 0 16px;
}

.action-btn {
  width: 100%;
}
</style>
