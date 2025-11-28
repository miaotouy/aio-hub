<template>
  <div class="markdown-alert" :class="[`alert-${alertType}`]">
    <div class="alert-title">
      <span class="alert-icon" v-html="iconSvg"></span>
      <span class="alert-label">{{ alertLabel }}</span>
    </div>
    <div class="alert-content">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  nodeId: string;
  alertType: 'note' | 'tip' | 'important' | 'warning' | 'caution';
}>();

const alertLabel = computed(() => {
  switch (props.alertType) {
    case 'note': return 'Note';
    case 'tip': return 'Tip';
    case 'important': return 'Important';
    case 'warning': return 'Warning';
    case 'caution': return 'Caution';
    default: return 'Note';
  }
});

const iconSvg = computed(() => {
  switch (props.alertType) {
    case 'note':
      return `<svg viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>`;
    case 'tip':
      return `<svg viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z"></path></svg>`;
    case 'important':
      return `<svg viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm7 2.25v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg>`;
    case 'warning':
      return `<svg viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg>`;
    case 'caution':
      return `<svg viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>`;
    default:
      return '';
  }
});
</script>

<style scoped>
.markdown-alert {
  margin: 12px 0;
  padding: 8px 16px;
  border-left: 4px solid;
  border-radius: 4px;
  font-size: 14px;
}

.alert-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  margin-bottom: 4px;
  line-height: 1.5;
}

.alert-icon {
  display: inline-flex;
  align-items: center;
}

.alert-content {
  /* 确保内容不与标题重叠 */
}

/* GitHub 风格配色 */
.alert-note {
  border-color: #0969da;
  background-color: #ddf4ff; /* light mode fallback */
  color: #0969da;
}
.alert-note .alert-content {
  color: var(--text-color, #1f2328);
}

.alert-tip {
  border-color: #1a7f37;
  background-color: #dafbe1;
  color: #1a7f37;
}
.alert-tip .alert-content {
  color: var(--text-color, #1f2328);
}

.alert-important {
  border-color: #8250df;
  background-color: #f6f1fe;
  color: #8250df;
}
.alert-important .alert-content {
  color: var(--text-color, #1f2328);
}

.alert-warning {
  border-color: #9a6700;
  background-color: #fff8c5;
  color: #9a6700;
}
.alert-warning .alert-content {
  color: var(--text-color, #1f2328);
}

.alert-caution {
  border-color: #d1242f;
  background-color: #ffebe9;
  color: #d1242f;
}
.alert-caution .alert-content {
  color: var(--text-color, #1f2328);
}

/* 适配暗色模式 (如果支持 CSS 变量) */
@media (prefers-color-scheme: dark) {
  /* 这里假设有全局 CSS 变量，或者直接使用 hardcoded dark colors */
  /* 为了更好的兼容性，最好使用 CSS 变量 */
}

/* 使用 CSS 变量适配主题 */
.alert-note {
  border-color: var(--md-alert-note-border-color, #1f6feb);
  background-color: var(--md-alert-note-bg-color, rgba(56, 139, 253, 0.15));
  color: var(--md-alert-note-color, #2f81f7);
}
.alert-tip {
  border-color: var(--md-alert-tip-border-color, #238636);
  background-color: var(--md-alert-tip-bg-color, rgba(46, 160, 67, 0.15));
  color: var(--md-alert-tip-color, #3fb950);
}
.alert-important {
  border-color: var(--md-alert-important-border-color, #8957e5);
  background-color: var(--md-alert-important-bg-color, rgba(137, 87, 229, 0.15));
  color: var(--md-alert-important-color, #a371f7);
}
.alert-warning {
  border-color: var(--md-alert-warning-border-color, #9e6a03);
  background-color: var(--md-alert-warning-bg-color, rgba(187, 128, 9, 0.15));
  color: var(--md-alert-warning-color, #d29922);
}
.alert-caution {
  border-color: var(--md-alert-caution-border-color, #da3633);
  background-color: var(--md-alert-caution-bg-color, rgba(248, 81, 73, 0.15));
  color: var(--md-alert-caution-color, #f85149);
}

/* 内容颜色 */
.alert-content {
  color: var(--text-color, inherit);
}
</style>
