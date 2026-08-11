<script setup lang="ts">
import { computed, ref } from "vue";
import {
  Bot,
  Braces,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  NotebookPen,
  UserRound,
  Wrench,
} from "lucide-vue-next";

type VcpBlockVariant =
  "role" | "tool_request" | "tool_result" | "daily_note" | "tool_summary";

const props = defineProps<{
  variant: VcpBlockVariant;
  content: string;
  closed: boolean;
  isStreaming: boolean;
  role?: "user" | "assistant" | "system";
}>();

const isCollapsed = ref(props.variant !== "role");

interface ToolFields {
  toolName: string;
  command: string;
  maid: string;
  args: Array<[string, string]>;
}

function parseToolFields(content: string): ToolFields {
  const fields = new Map<string, string>();
  const patterns = [
    /([a-zA-Z0-9_-]+):「始ESCAPE」([\s\S]*?)「末ESCAPE」/g,
    /([a-zA-Z0-9_-]+):「始exp」([\s\S]*?)「末exp」/g,
    /([a-zA-Z0-9_-]+):「始」([\s\S]*?)「末」/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content))) {
      if (!fields.has(match[1])) fields.set(match[1], match[2]);
    }
  }

  const pendingStarts = [
    ...content.matchAll(/([a-zA-Z0-9_-]+):「始(ESCAPE|exp)?」/g),
  ];
  const pending = pendingStarts[pendingStarts.length - 1];
  if (pending?.index !== undefined && !fields.has(pending[1])) {
    const variant = pending[2] ?? "";
    const valueStart = pending.index + pending[0].length;
    const closingMarker = `「末${variant}」`;
    if (!content.includes(closingMarker, valueStart)) {
      fields.set(pending[1], content.slice(valueStart));
    }
  }

  return {
    toolName: fields.get("tool_name") ?? "未命名工具",
    command: fields.get("command") ?? "",
    maid: fields.get("maid") ?? "",
    args: [...fields.entries()].filter(
      ([key]) => !["tool_name", "command", "maid"].includes(key)
    ),
  };
}

const toolFields = computed(() => parseToolFields(props.content));

const resultFields = computed(() => {
  const fields = new Map<string, string>();
  const pattern =
    /-\s*(工具名称|执行状态|返回内容):\s*([\s\S]*?)(?=\n-\s*(?:工具名称|执行状态|返回内容):|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(props.content))) {
    fields.set(match[1], match[2].trim());
  }
  return {
    toolName: fields.get("工具名称") ?? "工具调用结果",
    status: fields.get("执行状态") ?? "",
    result: fields.get("返回内容") ?? props.content.trim(),
  };
});

const summaryItems = computed(() =>
  props.content
    .split(/[\n；;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
);

const isPending = computed(() => props.isStreaming && !props.closed);
const isResultSuccess = computed(() =>
  /(?:SUCCESS|成功|✅)/i.test(resultFields.value.status)
);
const isResultError = computed(() =>
  /(?:ERROR|失败|❌)/i.test(resultFields.value.status)
);

const title = computed(() => {
  switch (props.variant) {
    case "role":
      return `VCP ${
        props.role === "user"
          ? "用户消息"
          : props.role === "assistant"
            ? "助手消息"
            : "系统消息"
      }`;
    case "tool_request":
      return "VCP 工具请求";
    case "tool_result":
      return "VCP 工具调用结果";
    case "daily_note":
      return "VCP 日记";
    case "tool_summary":
      return "本轮工具调用摘要";
  }
});

const icon = computed(() => {
  switch (props.variant) {
    case "role":
      return props.role === "assistant" ? Bot : UserRound;
    case "tool_request":
      return Wrench;
    case "tool_result":
      return Braces;
    case "daily_note":
      return NotebookPen;
    case "tool_summary":
      return Braces;
  }
});

const statusText = computed(() => {
  if (isPending.value) return "生成中";
  if (!props.closed) return "内容未完整结束";
  if (props.variant === "tool_result" && resultFields.value.status) {
    return resultFields.value.status;
  }
  return "已完成";
});
</script>

<template>
  <section
    class="vcp-block"
    :class="[
      `vcp-${variant}`,
      {
        'is-pending': isPending,
        'is-incomplete': !closed && !isPending,
        'is-success': variant === 'tool_result' && isResultSuccess,
        'is-error': variant === 'tool_result' && isResultError,
      },
    ]"
    :data-testid="`rich-text-vcp-${variant}`"
  >
    <button
      class="vcp-header"
      type="button"
      :aria-expanded="!isCollapsed"
      @click="isCollapsed = !isCollapsed"
    >
      <component :is="icon" :size="18" aria-hidden="true" />
      <span class="vcp-heading">
        <strong>{{ title }}</strong>
        <small>{{ statusText }}</small>
      </span>
      <LoaderCircle v-if="isPending" class="vcp-spinner" :size="16" />
      <CircleCheck
        v-else-if="variant === 'tool_result' && isResultSuccess"
        :size="16"
      />
      <CircleAlert
        v-else-if="!closed || (variant === 'tool_result' && isResultError)"
        :size="16"
      />
      <ChevronDown v-if="!isCollapsed" :size="18" />
      <ChevronRight v-else :size="18" />
    </button>

    <div v-show="!isCollapsed" class="vcp-content">
      <template v-if="variant === 'tool_request'">
        <dl class="vcp-fields">
          <div>
            <dt>工具</dt>
            <dd>{{ toolFields.toolName }}</dd>
          </div>
          <div v-if="toolFields.command">
            <dt>命令</dt>
            <dd>{{ toolFields.command }}</dd>
          </div>
          <div v-if="toolFields.maid">
            <dt>角色</dt>
            <dd>{{ toolFields.maid }}</dd>
          </div>
          <div v-for="[key, value] in toolFields.args" :key="key">
            <dt>{{ key }}</dt>
            <dd>{{ value }}</dd>
          </div>
        </dl>
      </template>

      <template v-else-if="variant === 'tool_result'">
        <dl class="vcp-fields">
          <div>
            <dt>工具</dt>
            <dd>{{ resultFields.toolName }}</dd>
          </div>
          <div v-if="resultFields.status">
            <dt>状态</dt>
            <dd>{{ resultFields.status }}</dd>
          </div>
        </dl>
        <pre class="vcp-pre">{{ resultFields.result }}</pre>
      </template>

      <ul v-else-if="variant === 'tool_summary'" class="vcp-summary">
        <li v-for="item in summaryItems" :key="item">{{ item }}</li>
      </ul>

      <pre v-else class="vcp-pre">{{ content.trim() }}</pre>
    </div>
  </section>
</template>

<style scoped>
.vcp-block {
  margin: 10px 0;
  overflow: hidden;
  border: var(--border-width) solid var(--border-color);
  border-radius: var(--app-radius-md);
  color: var(--text-color);
  background: var(--color-surface-container-low);
}

.vcp-block.is-pending {
  border-color: var(--primary-color);
}

.vcp-block.is-error,
.vcp-block.is-incomplete {
  border-color: var(--color-error, var(--el-color-danger));
}

.vcp-header {
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: inherit;
  background: transparent;
  border: 0;
  text-align: left;
}

.vcp-heading {
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 1px;
}

.vcp-heading strong,
.vcp-heading small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vcp-heading small {
  color: var(--color-on-surface-variant, var(--text-color-light));
}

.vcp-content {
  padding: 0 12px 12px;
  border-top: var(--border-width) solid var(--border-color);
}

.vcp-fields {
  margin: 0;
}

.vcp-fields > div {
  display: grid;
  grid-template-columns: minmax(72px, 28%) minmax(0, 1fr);
  gap: 8px;
  padding: 8px 0;
  border-bottom: var(--border-width) solid var(--border-color);
}

.vcp-fields > div:last-child {
  border-bottom: 0;
}

.vcp-fields dt {
  color: var(--color-on-surface-variant, var(--text-color-light));
  font-size: 0.85em;
}

.vcp-fields dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.vcp-pre {
  margin: 10px 0 0;
  overflow: auto;
  color: inherit;
  font: inherit;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.vcp-summary {
  margin: 10px 0 0;
  padding-left: 20px;
}

.vcp-summary li + li {
  margin-top: 6px;
}

.vcp-spinner {
  animation: vcp-spin 900ms linear infinite;
}

@keyframes vcp-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
