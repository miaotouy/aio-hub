<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { RefreshCw, Copy, FileText, Hash, Image as ImageIcon } from "lucide-vue-next";
import { useWebDistilleryStore } from "../../stores/store";
import { useLivePreview } from "../../composables/useLivePreview";
import { customMessage } from "@/utils/customMessage";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";

const store = useWebDistilleryStore();
const { triggerLivePreview } = useLivePreview();

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

const viewMode = ref<"preview" | "source">("preview");

const renderedHtml = ref("");
const stats = ref({
  words: 0,
  images: 0,
  time: 0,
});

// 更新预览 HTML
const updateRenderedHtml = () => {
  if (store.livePreviewContent) {
    const rawHtml = md.render(store.livePreviewContent);
    renderedHtml.value = DOMPurify.sanitize(rawHtml);

    // 简单统计
    stats.value.words = store.livePreviewContent.length;
    stats.value.images = (store.livePreviewContent.match(/!\[.*?\]\(.*?\)/g) || []).length;
  } else {
    renderedHtml.value = "";
    stats.value.words = 0;
    stats.value.images = 0;
  }
};

// 监听预览内容变化
watch(() => store.livePreviewContent, updateRenderedHtml);

// 监听标签页切换，进入预览页时自动触发一次
watch(
  () => store.activeToolTab,
  (newTab) => {
    if (newTab === "preview" && !store.livePreviewContent) {
      triggerLivePreview(true);
    }
  },
);

onMounted(() => {
  if (store.activeToolTab === "preview") {
    triggerLivePreview(true);
  }
});

const handleRefresh = () => {
  triggerLivePreview(true);
};

const handleCopyMarkdown = async () => {
  if (store.livePreviewContent) {
    await writeText(store.livePreviewContent);
    customMessage.success("Markdown 已复制到剪贴板");
  }
};

const handleCopyHtml = async () => {
  if (renderedHtml.value) {
    await writeText(renderedHtml.value);
    customMessage.success("HTML 已复制到剪贴板");
  }
};

const getQualityColor = (quality: number) => {
  if (quality >= 0.8) return "var(--el-color-success)";
  if (quality >= 0.5) return "var(--el-color-warning)";
  return "var(--el-color-danger)";
};
</script>

<template>
  <div class="live-preview-tab">
    <div class="preview-header">
      <div class="header-left">
        <div class="title">实时预览</div>
        <div class="quality-info" v-if="store.livePreviewContent">
          <el-tooltip content="提取质量评分" placement="top">
            <div class="quality-bar-container">
              <div
                class="quality-bar"
                :style="{
                  width: store.livePreviewQuality * 100 + '%',
                  backgroundColor: getQualityColor(store.livePreviewQuality),
                }"
              ></div>
            </div>
          </el-tooltip>
          <span class="quality-text" :style="{ color: getQualityColor(store.livePreviewQuality) }">
            {{ Math.round(store.livePreviewQuality * 100) }}%
          </span>
        </div>
      </div>

      <div class="header-ops">
        <el-radio-group v-model="viewMode" size="small">
          <el-radio-button value="preview">预览</el-radio-button>
          <el-radio-button value="source">源码</el-radio-button>
        </el-radio-group>

        <el-button circle size="small" :loading="store.livePreviewLoading" @click="handleRefresh">
          <template #icon><RefreshCw :size="14" /></template>
        </el-button>
      </div>
    </div>

    <div class="preview-body" v-loading="store.livePreviewLoading">
      <el-empty v-if="!store.livePreviewContent && !store.livePreviewLoading" description="暂无预览内容">
        <el-button type="primary" size="small" @click="handleRefresh">生成预览</el-button>
      </el-empty>

      <div v-else class="content-container">
        <!-- 预览模式 -->
        <div v-if="viewMode === 'preview'" class="markdown-body" v-html="renderedHtml"></div>

        <!-- 源码模式 -->
        <div v-else class="source-view">
          <pre><code>{{ store.livePreviewContent }}</code></pre>
        </div>
      </div>
    </div>

    <div class="preview-footer" v-if="store.livePreviewContent">
      <div class="stats">
        <div class="stat-item">
          <Hash :size="12" />
          <span>{{ stats.words }} 字</span>
        </div>
        <div class="stat-item">
          <ImageIcon :size="12" />
          <span>{{ stats.images }} 图</span>
        </div>
      </div>

      <div class="footer-ops">
        <el-button link size="small" @click="handleCopyMarkdown">
          <template #icon><Copy :size="12" /></template>
          复制 Markdown
        </el-button>
        <el-button link size="small" @click="handleCopyHtml">
          <template #icon><FileText :size="12" /></template>
          复制 HTML
        </el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.live-preview-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 12px;
  gap: 12px;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.quality-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.quality-bar-container {
  width: 60px;
  height: 4px;
  background-color: var(--el-fill-color-lighter);
  border-radius: 2px;
  overflow: hidden;
}

.quality-bar {
  height: 100%;
  transition: all 0.3s ease;
}

.quality-text {
  font-size: 10px;
  font-weight: 600;
}

.header-ops {
  display: flex;
  gap: 8px;
  align-items: center;
}

.preview-body {
  flex: 1;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  position: relative;
}

.content-container {
  height: 100%;
  overflow-y: auto;
  padding: 16px;
}

.markdown-body {
  font-size: 14px;
  line-height: 1.6;
  color: var(--el-text-color-primary);
}

:deep(.markdown-body) h1,
:deep(.markdown-body) h2,
:deep(.markdown-body) h3 {
  margin-top: 1em;
  margin-bottom: 0.5em;
  font-weight: 600;
}

:deep(.markdown-body) p {
  margin-bottom: 1em;
}

:deep(.markdown-body) img {
  max-width: 100%;
  border-radius: 4px;
}

.source-view {
  font-family: var(--el-font-family-mono);
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--el-text-color-regular);
}

.preview-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
}

.stats {
  display: flex;
  gap: 12px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.footer-ops {
  display: flex;
  gap: 8px;
}
</style>
