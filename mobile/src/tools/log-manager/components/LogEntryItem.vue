<script setup lang="ts">
import { ref } from "vue";
import { LogLevel, type LogEntry } from "@/utils/logger";
import { useI18n } from "@/i18n";
import { Copy, ChevronRight, ChevronDown } from "lucide-vue-next";
import { Snackbar } from "@varlet/ui";

const props = defineProps<{
  log: LogEntry;
}>();

const { useScopedT, t: gt } = useI18n();
const t = useScopedT("tools.log-manager.LogEntryItem");

const expanded = ref(false);

const getLevelType = (level: LogLevel) => {
  switch (level) {
    case LogLevel.DEBUG:
      return "default";
    case LogLevel.INFO:
      return "info";
    case LogLevel.WARN:
      return "warning";
    case LogLevel.ERROR:
      return "danger";
    default:
      return "default";
  }
};

const getLevelName = (level: LogLevel) => {
  return LogLevel[level];
};

const handleCopy = async (e: Event) => {
  e.stopPropagation();
  let text = `[${props.log.timestamp}] [${getLevelName(props.log.level)}] [${props.log.module}] ${props.log.message}`;
  if (props.log.data) {
    text += `\nData: ${JSON.stringify(props.log.data, null, 2)}`;
  }
  if (props.log.stack) {
    text += `\nStack: ${props.log.stack}`;
  }

  try {
    await navigator.clipboard.writeText(text);
    Snackbar.success(t("复制成功"));
  } catch (err) {
    Snackbar.error(gt("common.失败"));
  }
};

const toggleExpand = () => {
  if (props.log.data || props.log.stack) {
    expanded.value = !expanded.value;
  }
};
</script>

<template>
  <div
    class="log-entry-item"
    :class="[
      `level-${getLevelName(log.level).toLowerCase()}`,
      { 'is-expandable': log.data || log.stack },
    ]"
    @click="toggleExpand"
  >
    <div class="entry-header">
      <div class="header-left">
        <div class="level-badge" :class="getLevelType(log.level)">
          {{ getLevelName(log.level) }}
        </div>
        <span class="timestamp">{{ log.timestamp.split(" ")[1] }}</span>
        <span class="module">[{{ log.module }}]</span>
      </div>
      <div class="header-right">
        <var-button round text size="mini" @click="handleCopy">
          <Copy :size="14" />
        </var-button>
      </div>
    </div>

    <div class="entry-message">
      {{ log.message }}
      <span v-if="log.data || log.stack" class="expand-hint">
        <ChevronDown v-if="expanded" :size="14" />
        <ChevronRight v-else :size="14" />
      </span>
    </div>

    <div v-if="expanded" class="entry-details">
      <div v-if="log.data" class="detail-section">
        <div class="detail-label">Data:</div>
        <pre class="detail-content">{{
          JSON.stringify(log.data, null, 2)
        }}</pre>
      </div>
      <div v-if="log.stack" class="detail-section">
        <div class="detail-label">Stack:</div>
        <pre class="detail-content stack">{{ log.stack }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.log-entry-item {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
  transition: background-color 0.2s;
}

.log-entry-item:active {
  background-color: var(--input-bg);
}

.is-expandable {
  cursor: pointer;
}

.entry-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
}

.level-badge {
  font-size: 10px;
  padding: 1px 4px;
  border-radius: var(--app-radius-sm);
  font-weight: bold;
  min-width: 45px;
  text-align: center;
}

.level-badge.default {
  background-color: var(--border-color);
  color: var(--text-color);
}
.level-badge.info {
  background-color: var(--info-color);
  color: white;
}
.level-badge.warning {
  background-color: var(--warning-color);
  color: white;
}
.level-badge.danger {
  background-color: var(--danger-color);
  color: white;
}

.timestamp {
  font-size: 11px;
  color: var(--border-color);
  white-space: nowrap;
}

.module {
  font-size: 11px;
  color: var(--primary-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entry-message {
  font-size: 13px;
  line-height: 1.5;
  word-break: break-all;
  color: var(--text-color);
  display: flex;
  align-items: flex-start;
  gap: 4px;
}

.expand-hint {
  display: inline-flex;
  align-items: center;
  color: var(--border-color);
  margin-top: 2px;
}

.entry-details {
  margin-top: 8px;
  padding: 8px;
  background-color: var(--overlay-bg);
  border-radius: var(--app-radius-sm);
  font-size: 12px;
}

.detail-section {
  margin-bottom: 8px;
}

.detail-section:last-child {
  margin-bottom: 0;
}

.detail-label {
  font-weight: bold;
  color: var(--border-color);
  margin-bottom: 2px;
}

.detail-content {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-color-light);
  background: transparent;
  padding: 0;
}

.stack {
  color: var(--danger-color);
  font-size: 11px;
}

/* 级别特定的边框或背景微调 */
.level-error {
  background-color: rgba(var(--danger-color-rgb), 0.05);
}

.level-warn {
  background-color: rgba(var(--warning-color-rgb), 0.05);
}
</style>
