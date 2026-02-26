<script setup lang="ts">
import { computed } from "vue";
import { Network, ExternalLink, Trash2, Code } from "lucide-vue-next";
import { useWebDistilleryStore } from "../stores/store";
import { customMessage } from "@/utils/customMessage";

const store = useWebDistilleryStore();

const filteredApis = computed(() => {
  // 简单过滤掉一些明显的静态资源（虽然 sniffer 已经过滤了一部分，这里确保 UI 干净）
  return store.discoveredApis
    .filter((api) => {
      const url = api.url.toLowerCase();
      return !url.endsWith(".js") && !url.endsWith(".css") && !url.endsWith(".ico");
    })
    .reverse(); // 最新的在上面
});

function copyUrl(url: string) {
  navigator.clipboard.writeText(url);
  customMessage.success("URL 已复制");
}

function clearApis() {
  store.discoveredApis = [];
  customMessage.success("列表已清空");
}
</script>

<template>
  <div class="api-sniffer">
    <div class="sniffer-header">
      <div class="header-title">
        <Network :size="14" class="title-icon" />
        <span>发现的 API ({{ filteredApis.length }})</span>
      </div>
      <el-button v-if="filteredApis.length" text size="small" @click="clearApis">
        <Trash2 :size="14" />
      </el-button>
    </div>

    <div v-if="filteredApis.length === 0" class="empty-state">
      <Network :size="32" class="empty-icon" />
      <p>等待页面加载请求…</p>
    </div>

    <div v-else class="api-list">
      <div v-for="api in filteredApis" :key="api.timestamp + api.url" class="api-card">
        <div class="api-meta">
          <el-tag size="small" :type="api.method === 'GET' ? 'success' : 'primary'">
            {{ api.method }}
          </el-tag>
          <el-tag size="small" type="info" class="timestamp">
            {{ new Date(api.timestamp).toLocaleTimeString() }}
          </el-tag>
        </div>
        <div class="api-url" :title="api.url">{{ api.url }}</div>
        <div class="api-actions">
          <el-button text size="small" @click="copyUrl(api.url)">
            <ExternalLink :size="12" />
          </el-button>
          <el-button v-if="api.isJson" text size="small" title="JSON 预览">
            <Code :size="12" />
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.api-sniffer {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.sniffer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-light);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.title-icon {
  color: var(--primary-color);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  color: var(--text-color-light);
  font-size: 12px;
}
.empty-icon {
  opacity: 0.2;
  margin-bottom: 8px;
}

.api-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.api-card {
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 8px;
  transition: border-color 0.2s;
}
.api-card:hover {
  border-color: var(--primary-color);
}

.api-meta {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
}
.timestamp {
  font-size: 10px;
  opacity: 0.8;
}

.api-url {
  font-size: 11px;
  color: var(--text-color);
  word-break: break-all;
  max-height: 3em;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  font-family: var(--el-font-family-mono);
}

.api-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 4px;
}
</style>
