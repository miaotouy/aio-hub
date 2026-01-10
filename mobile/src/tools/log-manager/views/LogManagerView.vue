<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { throttle } from 'lodash-es'
import { logger, LogLevel, type LogEntry } from '@/utils/logger'
import { useI18n } from '@/i18n'
import {
  Trash2,
  Download,
  Copy,
  Search,
  ArrowDownCircle
} from 'lucide-vue-next'
import LogEntryItem from '../components/LogEntryItem.vue'
import { Snackbar, Dialog } from '@varlet/ui'

const { tRaw } = useI18n()
const t = (key: string) => tRaw(`tools.log-manager.LogManagerView.${key}`)

// 状态
const logs = ref<LogEntry[]>([])
const searchQuery = ref('')
const selectedLevel = ref<LogLevel | 'ALL'>('ALL')
const autoScroll = ref(true)
const logContainer = ref<HTMLElement | null>(null)

// 级别选项
const levelOptions = [
  { label: t('全部级别'), value: 'ALL' },
  { label: 'DEBUG', value: LogLevel.DEBUG },
  { label: 'INFO', value: LogLevel.INFO },
  { label: 'WARN', value: LogLevel.WARN },
  { label: 'ERROR', value: LogLevel.ERROR }
]

// 过滤后的日志
const filteredLogs = computed(() => {
  return logs.value.filter(log => {
    const matchesSearch = !searchQuery.value || 
      log.message.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      log.module.toLowerCase().includes(searchQuery.value.toLowerCase())
    
    const matchesLevel = selectedLevel.value === 'ALL' || log.level === selectedLevel.value
    
    return matchesSearch && matchesLevel
  })
})

// 初始化与订阅
let unsubscribe: (() => void) | null = null


const scrollToBottom = async () => {
  await nextTick()
  if (logContainer.value) {
    logContainer.value.scrollTop = logContainer.value.scrollHeight
  }
}
const updateLogs = throttle(() => {
  logs.value = logger.getLogs()
  if (autoScroll.value) {
    scrollToBottom()
  }
}, 200, { leading: true, trailing: true })

onMounted(() => {
  logs.value = logger.getLogs()
  unsubscribe = logger.subscribe(updateLogs)
  scrollToBottom()
})

onUnmounted(() => {
  if (unsubscribe) unsubscribe()
})

// 操作
const handleClear = async () => {
  const result = await Dialog({
    title: tRaw('common.提示'),
    message: t('确认清空'),
  })
  
  if (result === 'confirm') {
    logger.clearLogs()
    logs.value = []
    Snackbar.success(tRaw('common.成功'))
  }
}

const handleExport = () => {
  const content = logger.exportLogs()
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`
  a.click()
  URL.revokeObjectURL(url)
  Snackbar.success(t('导出成功'))
}

const handleCopyAll = async () => {
  const content = logger.exportLogs()
  try {
    await navigator.clipboard.writeText(content)
    Snackbar.success(t('已复制到剪贴板'))
  } catch (err) {
    Snackbar.error(tRaw('common.失败'))
  }
}

// 监听过滤条件变化，如果开启了自动滚动则滚动到底部
watch([searchQuery, selectedLevel], () => {
  if (autoScroll.value) {
    scrollToBottom()
  }
})
</script>

<template>
  <div class="log-manager-view">
    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <var-input
        v-model="searchQuery"
        :placeholder="t('搜索日志')"
        variant="standard"
        clearable
        size="small"
      >
        <template #prepend-icon>
          <Search :size="18" />
        </template>
      </var-input>

      <div class="filter-row">
        <var-select
          v-model="selectedLevel"
          size="small"
          variant="standard"
          :hint="false"
          class="level-select"
        >
          <var-option
            v-for="opt in levelOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </var-select>

        <var-chip
          size="small"
          :type="autoScroll ? 'primary' : 'default'"
          @click="autoScroll = !autoScroll"
          class="auto-scroll-chip"
        >
          <template #left>
            <ArrowDownCircle :size="14" />
          </template>
          {{ t('自动滚动') }}
        </var-chip>
      </div>
    </div>

    <!-- 日志列表 -->
    <div class="log-content" ref="logContainer">
      <div v-if="filteredLogs.length === 0" class="empty-state">
        <var-empty :description="t('暂无日志')" />
      </div>
      <div v-else class="log-list">
        <LogEntryItem
          v-for="log in filteredLogs"
          :key="log.id"
          :log="log"
        />
      </div>
    </div>

    <!-- 底部操作栏 -->
    <div class="footer-actions">
      <var-button-group type="primary" mode="text">
        <var-button @click="handleClear">
          <template #default>
            <div class="btn-content">
              <Trash2 :size="18" />
              <span>{{ t('清空日志') }}</span>
            </div>
          </template>
        </var-button>
        <var-button @click="handleExport">
          <template #default>
            <div class="btn-content">
              <Download :size="18" />
              <span>{{ t('导出日志') }}</span>
            </div>
          </template>
        </var-button>
        <var-button @click="handleCopyAll">
          <template #default>
            <div class="btn-content">
              <Copy :size="18" />
              <span>{{ t('复制全部') }}</span>
            </div>
          </template>
        </var-button>
      </var-button-group>
    </div>
  </div>
</template>

<style scoped>
.log-manager-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--color-body);
}

.toolbar {
  padding: 8px 16px;
  background-color: var(--color-surface-container);
  border-bottom: 1px solid var(--color-outline-variant);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filter-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.level-select {
  flex: 1;
}

.auto-scroll-chip {
  flex-shrink: 0;
}

.log-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
  -webkit-overflow-scrolling: touch;
}

.log-list {
  display: flex;
  flex-direction: column;
}

.empty-state {
  padding-top: 100px;
}

.footer-actions {
  padding: 8px 16px;
  padding-bottom: calc(8px + var(--safe-area-bottom));
  background-color: var(--color-surface-container);
  border-top: 1px solid var(--color-outline-variant);
  display: flex;
  justify-content: center;
}

.btn-content {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

:deep(.var-input) {
  --input-placeholder-size: 14px;
}
</style>