<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useWorldbookStore } from '../../worldbookStore';
import type { STWorldbook } from '../../types/worldbook';
import { Search, Tag, MapPin, Anchor, Layers } from 'lucide-vue-next';

const props = defineProps<{
  id: string;
}>();

const worldbookStore = useWorldbookStore();
const content = ref<STWorldbook | null>(null);
const loading = ref(true);
const searchQuery = ref('');

onMounted(async () => {
  loading.value = true;
  content.value = await worldbookStore.getWorldbookContent(props.id);
  loading.value = false;
});

const entries = computed(() => {
  if (!content.value) return [];
  return Object.values(content.value.entries).sort((a, b) => b.order - a.order);
});

const filteredEntries = computed(() => {
  if (!searchQuery.value) return entries.value;
  const q = searchQuery.value.toLowerCase();
  return entries.value.filter(e => 
    e.comment?.toLowerCase().includes(q) || 
    e.key.some(k => k.toLowerCase().includes(q)) ||
    e.content.toLowerCase().includes(q)
  );
});

const getPositionLabel = (pos: number) => {
  const labels: Record<number, string> = {
    0: '角色前',
    1: '角色后',
    2: 'AN前',
    3: 'AN后',
    4: '深度注入',
    5: 'EM前',
    6: 'EM后',
    7: 'Outlet',
  };
  return labels[pos] || '未知';
};
</script>

<template>
  <div class="worldbook-detail" v-loading="loading">
    <div class="detail-header">
      <el-input
        v-model="searchQuery"
        placeholder="搜索条目 (名称、关键词、内容)..."
        :prefix-icon="Search"
        clearable
      />
    </div>

    <div class="entry-list">
      <el-empty v-if="filteredEntries.length === 0" description="没有找到匹配的条目" />
      
      <el-collapse v-else>
        <el-collapse-item v-for="entry in filteredEntries" :key="entry.uid" :name="entry.uid">
          <template #title>
            <div class="entry-title">
              <el-tag :type="entry.disable ? 'info' : 'success'" size="small" class="status-tag">
                {{ entry.disable ? '禁用' : '启用' }}
              </el-tag>
              <span class="entry-name">{{ entry.comment || `条目 #${entry.uid}` }}</span>
              <div class="entry-meta-preview">
                <span v-if="entry.constant" class="meta-item constant">始终激活</span>
                <span v-else class="meta-item keys">{{ entry.key.length }} 个关键词</span>
              </div>
            </div>
          </template>

          <div class="entry-content-wrapper">
            <div class="entry-attributes">
              <div class="attr-row">
                <div class="attr-item">
                  <el-icon><Tag /></el-icon>
                  <span class="label">关键词:</span>
                  <div class="tags">
                    <el-tag v-for="k in entry.key" :key="k" size="small" effect="plain" class="keyword-tag">{{ k }}</el-tag>
                  </div>
                </div>
              </div>
              <div class="attr-row">
                <div class="attr-item">
                  <el-icon><MapPin /></el-icon>
                  <span class="label">位置:</span>
                  <span>{{ getPositionLabel(entry.position) }}</span>
                  <span v-if="entry.position === 4" class="depth-text">(深度: {{ entry.depth }})</span>
                </div>
                <div class="attr-item">
                  <el-icon><Layers /></el-icon>
                  <span class="label">顺序:</span>
                  <span>{{ entry.order }}</span>
                </div>
                <div v-if="entry.group" class="attr-item">
                  <el-icon><Anchor /></el-icon>
                  <span class="label">分组:</span>
                  <span>{{ entry.group }}</span>
                </div>
              </div>
            </div>

            <div class="content-box">
              <div class="box-label">条目内容</div>
              <pre class="content-text">{{ entry.content }}</pre>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>
  </div>
</template>

<style scoped>
.worldbook-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}

.detail-header {
  margin-bottom: 8px;
}

.entry-list {
  flex: 1;
  overflow-y: auto;
}

.entry-title {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.status-tag {
  flex-shrink: 0;
}

.entry-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entry-meta-preview {
  margin-left: auto;
  margin-right: 12px;
  display: flex;
  gap: 8px;
}

.meta-item {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.meta-item.constant {
  color: var(--el-color-warning);
  font-weight: bold;
}

.entry-content-wrapper {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.entry-attributes {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.attr-row {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
}

.attr-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.attr-item .label {
  color: var(--el-text-color-secondary);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.keyword-tag {
  border-style: dashed;
}

.depth-text {
  color: var(--el-color-primary);
  font-weight: 500;
}

.content-box {
  background-color: var(--vscode-editor-background, rgba(0,0,0,0.05));
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 12px;
}

.box-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
  text-transform: uppercase;
}

.content-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: var(--el-font-family-mono);
  font-size: 13px;
  line-height: 1.5;
  color: var(--el-text-color-primary);
}
</style>