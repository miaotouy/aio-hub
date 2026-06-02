<template>
  <div class="structured-view">
    <!-- 顶部工具栏 -->
    <div class="view-toolbar">
      <div class="toolbar-left">
        <span class="message-count">
          共 <strong>{{ messages.length }}</strong> 条消息
        </span>
        <span v-if="badgeKind === 'real'" class="kind-badge real">
          <Globe :size="11" />
          真实
        </span>
        <span
          v-else-if="badgeKind === 'predicted'"
          class="kind-badge predicted"
        >
          <Compass :size="11" />
          预测
        </span>
      </div>
      <div class="toolbar-right">
        <div class="search-wrapper">
          <Search :size="13" class="search-icon" />
          <input
            v-model="searchQuery"
            type="text"
            class="search-input"
            placeholder="搜索消息内容..."
          />
          <button
            v-if="searchQuery"
            @click="searchQuery = ''"
            class="search-clear"
            title="清除搜索"
          >
            <X :size="11" />
          </button>
        </div>
        <span v-if="searchQuery" class="match-count">
          {{ matchedCount }} / {{ messages.length }}
        </span>
      </div>
    </div>

    <!-- 横向锚点 sticky tabs -->
    <div v-if="messages.length > 0" class="anchor-tabs">
      <button
        v-for="(msg, idx) in messages"
        :key="idx"
        :class="[
          'anchor-chip',
          `role-${msg.role}`,
          { dimmed: searchQuery && !messageMatches[idx] },
        ]"
        @click="scrollToMessage(idx)"
        :title="`${getRoleLabel(msg.role)} #${idx + 1}`"
      >
        <component :is="getRoleIcon(msg.role)" :size="11" />
        <span class="chip-index">{{ idx + 1 }}</span>
      </button>
    </div>

    <!-- 错误提示（解析失败时） -->
    <div v-if="errors && errors.length" class="parse-errors">
      <AlertCircle :size="13" />
      <span>{{ errors.join(" · ") }}</span>
    </div>

    <!-- 空状态 -->
    <div v-if="messages.length === 0 && !errors?.length" class="empty-messages">
      <Inbox :size="40" :stroke-width="1.2" />
      <p>没有消息可显示</p>
    </div>

    <!-- 消息列表 -->
    <div v-else class="messages-list">
      <article
        v-for="(msg, idx) in messages"
        :key="idx"
        :ref="(el) => setMessageRef(el, idx)"
        :class="[
          'message-card',
          `role-${msg.role}`,
          { dimmed: searchQuery && !messageMatches[idx] },
        ]"
      >
        <!-- 卡片头：角色 + 序号 -->
        <header class="card-header">
          <div class="role-label">
            <component :is="getRoleIcon(msg.role)" :size="14" />
            <span class="role-name">{{ getRoleLabel(msg.role) }}</span>
          </div>
          <span class="msg-index">#{{ idx + 1 }}</span>
        </header>

        <!-- 块内容 -->
        <div class="block-list">
          <div
            v-for="(block, bidx) in msg.blocks"
            :key="bidx"
            :class="['block', `block-${block.type}`]"
          >
            <!-- text -->
            <template v-if="block.type === 'text'">
              <pre
                class="block-text"
                v-html="highlightText(block.text || '')"
              />
            </template>

            <!-- thinking -->
            <template v-else-if="block.type === 'thinking'">
              <div class="block-label">
                <Brain :size="12" />
                <span>思维链 (Thinking)</span>
              </div>
              <pre
                class="block-text thinking-text"
                v-html="highlightText(block.text || '')"
              />
            </template>

            <!-- tool_call -->
            <template v-else-if="block.type === 'tool_call'">
              <div class="block-label">
                <Wrench :size="12" />
                <span>工具调用</span>
                <code class="tool-name">{{ block.toolName || "unknown" }}</code>
                <code
                  v-if="block.toolCallId"
                  class="tool-id"
                  :title="block.toolCallId"
                >
                  ID: {{ shortId(block.toolCallId) }}
                </code>
              </div>
              <pre class="block-code">{{
                formatArguments(block.toolArguments)
              }}</pre>
            </template>

            <!-- tool_result -->
            <template v-else-if="block.type === 'tool_result'">
              <div class="block-label">
                <CheckCircle2 :size="12" />
                <span>工具结果</span>
                <code v-if="block.toolName" class="tool-name">{{
                  block.toolName
                }}</code>
                <code
                  v-if="block.toolCallId"
                  class="tool-id"
                  :title="block.toolCallId"
                >
                  ID: {{ shortId(block.toolCallId) }}
                </code>
              </div>
              <pre class="block-code">{{
                formatArguments(block.toolResult)
              }}</pre>
            </template>

            <!-- refusal -->
            <template v-else-if="block.type === 'refusal'">
              <div class="block-label">
                <ShieldAlert :size="12" />
                <span>拒绝响应 (Refusal)</span>
              </div>
              <pre
                class="block-text refusal-text"
                v-html="highlightText(block.text || '')"
              />
            </template>

            <!-- image -->
            <template v-else-if="block.type === 'image'">
              <div class="block-label">
                <ImageIcon :size="12" />
                <span>图像</span>
              </div>
              <div class="image-ref" :title="block.imageRef">
                {{ truncateRef(block.imageRef) }}
              </div>
            </template>

            <!-- unknown -->
            <template v-else>
              <div class="block-label">
                <HelpCircle :size="12" />
                <span>未知块类型</span>
              </div>
              <pre class="block-code">{{ formatArguments(block.raw) }}</pre>
            </template>
          </div>

          <!-- 空块占位 -->
          <div v-if="msg.blocks.length === 0" class="empty-block">
            <em>（无内容）</em>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from "vue";
import {
  AlertCircle,
  Brain,
  CheckCircle2,
  Compass,
  Globe,
  HelpCircle,
  Image as ImageIcon,
  Inbox,
  Search,
  ShieldAlert,
  Wrench,
  X,
  User,
  Bot,
  Settings2,
  Wrench as WrenchAlt,
  HelpCircle as RoleUnknown,
} from "lucide-vue-next";
import type { ParsedMessage } from "../../types";

const props = withDefaults(
  defineProps<{
    messages: ParsedMessage[];
    errors?: string[];
    badgeKind?: "real" | "predicted" | "none";
  }>(),
  {
    errors: () => [],
    badgeKind: "real",
  }
);

// 搜索关键字（本地状态）
const searchQuery = ref("");

// 消息 ref 收集，供锚点滚动使用
const messageRefs = ref<Map<number, HTMLElement>>(new Map());

function setMessageRef(el: any, idx: number) {
  if (el instanceof HTMLElement) {
    messageRefs.value.set(idx, el);
  } else {
    messageRefs.value.delete(idx);
  }
}

// 滚动到指定消息
async function scrollToMessage(idx: number) {
  await nextTick();
  const el = messageRefs.value.get(idx);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

// 单条消息是否匹配搜索关键字
const messageMatches = computed<boolean[]>(() => {
  if (!searchQuery.value.trim()) {
    return props.messages.map(() => true);
  }
  const q = searchQuery.value.toLowerCase();
  return props.messages.map((msg) => {
    if (msg.role.toLowerCase().includes(q)) return true;
    for (const block of msg.blocks) {
      if (block.text && block.text.toLowerCase().includes(q)) return true;
      if (block.toolName && block.toolName.toLowerCase().includes(q))
        return true;
      try {
        const argsStr = JSON.stringify(
          block.toolArguments ?? block.toolResult ?? block.raw ?? ""
        );
        if (argsStr.toLowerCase().includes(q)) return true;
      } catch {
        /* ignore stringify errors */
      }
    }
    return false;
  });
});

const matchedCount = computed(
  () => messageMatches.value.filter(Boolean).length
);

// 高亮搜索关键字
function highlightText(text: string): string {
  const escaped = escapeHtml(text);
  if (!searchQuery.value.trim()) return escaped;
  const q = escapeRegex(searchQuery.value.trim());
  return escaped.replace(
    new RegExp(`(${q})`, "gi"),
    '<mark class="search-mark">$1</mark>'
  );
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 角色标签
function getRoleLabel(role: ParsedMessage["role"]): string {
  switch (role) {
    case "system":
      return "System";
    case "user":
      return "User";
    case "assistant":
      return "Assistant";
    case "model":
      return "Model";
    case "tool":
      return "Tool";
    default:
      return "Unknown";
  }
}

function getRoleIcon(role: ParsedMessage["role"]) {
  switch (role) {
    case "system":
      return Settings2;
    case "user":
      return User;
    case "assistant":
    case "model":
      return Bot;
    case "tool":
      return WrenchAlt;
    default:
      return RoleUnknown;
  }
}

// 格式化工具参数 / 结果
function formatArguments(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") {
    // 尝试当作 JSON 美化
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function shortId(id: string): string {
  if (id.length <= 10) return id;
  return `${id.slice(0, 6)}…${id.slice(-3)}`;
}

function truncateRef(ref?: string): string {
  if (!ref) return "(无引用)";
  if (ref.length <= 80) return ref;
  return `${ref.slice(0, 50)}… (${ref.length} chars)`;
}
</script>

<style scoped>
.structured-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* === 顶部工具栏 === */
.view-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding-bottom: 8px;
  border-bottom: var(--border-width) solid var(--border-color);
  flex-wrap: wrap;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.message-count {
  font-size: 13px;
  color: var(--text-color-light);
}

.message-count strong {
  color: var(--text-color);
}

.kind-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
}

.kind-badge.real {
  background: rgba(
    var(--el-color-success-rgb),
    calc(var(--card-opacity) * 0.15)
  );
  color: var(--el-color-success, #67c23a);
  border: var(--border-width) solid
    rgba(var(--el-color-success-rgb), calc(var(--card-opacity) * 0.3));
}

.kind-badge.predicted {
  background: rgba(
    var(--el-color-warning-rgb),
    calc(var(--card-opacity) * 0.15)
  );
  color: var(--el-color-warning, #e6a23c);
  border: var(--border-width) solid
    rgba(var(--el-color-warning-rgb), calc(var(--card-opacity) * 0.3));
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 8px;
  color: var(--text-color-light);
  pointer-events: none;
}

.search-input {
  padding: 5px 26px 5px 26px;
  background: var(--input-bg);
  color: var(--text-color);
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  font-size: 12px;
  width: 200px;
  outline: none;
  transition: border-color 0.2s;
}

.search-input:focus {
  border-color: var(--primary-color);
}

.search-clear {
  position: absolute;
  right: 6px;
  background: transparent;
  border: none;
  color: var(--text-color-light);
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
}

.search-clear:hover {
  color: var(--text-color);
}

.match-count {
  font-size: 11px;
  color: var(--text-color-light);
  white-space: nowrap;
}

/* === 横向锚点 === */
.anchor-tabs {
  display: flex;
  gap: 6px;
  padding: 6px 0;
  overflow-x: auto;
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--container-bg);
  backdrop-filter: blur(var(--ui-blur));
  border-bottom: var(--border-width) solid var(--border-color);
}

.anchor-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 12px;
  color: var(--text-color);
  font-size: 11px;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.anchor-chip:hover {
  transform: translateY(-1px);
}

.anchor-chip.dimmed {
  opacity: 0.35;
}

.chip-index {
  font-weight: 600;
}

/* === 解析错误 === */
.parse-errors {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: rgba(
    var(--el-color-warning-rgb),
    calc(var(--card-opacity) * 0.1)
  );
  border: var(--border-width) solid
    rgba(var(--el-color-warning-rgb), calc(var(--card-opacity) * 0.3));
  border-radius: 4px;
  color: var(--el-color-warning, #e6a23c);
  font-size: 12px;
}

/* === 空状态 === */
.empty-messages {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
  color: var(--text-color-light);
  gap: 8px;
}

.empty-messages p {
  margin: 0;
  font-size: 13px;
}

/* === 消息列表 === */
.messages-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message-card {
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-left-width: 3px;
  border-radius: 6px;
  padding: 12px 14px;
  transition: opacity 0.2s ease;
}

.message-card.dimmed {
  opacity: 0.4;
}

/* 角色色彩：左侧色条 + 标签色 */
.message-card.role-system {
  border-left-color: var(--el-color-info, #909399);
}

.message-card.role-user {
  border-left-color: var(--el-color-success, #67c23a);
}

.message-card.role-assistant,
.message-card.role-model {
  border-left-color: var(--primary-color);
}

.message-card.role-tool {
  border-left-color: var(--el-color-warning, #e6a23c);
}

.message-card.role-unknown {
  border-left-color: var(--el-color-info, #909399);
}

/* 锚点同色 */
.anchor-chip.role-system {
  border-left: 3px solid var(--el-color-info, #909399);
}

.anchor-chip.role-user {
  border-left: 3px solid var(--el-color-success, #67c23a);
}

.anchor-chip.role-assistant,
.anchor-chip.role-model {
  border-left: 3px solid var(--primary-color);
}

.anchor-chip.role-tool {
  border-left: 3px solid var(--el-color-warning, #e6a23c);
}

.anchor-chip.role-unknown {
  border-left: 3px solid var(--el-color-info, #909399);
}

/* === 卡片头 === */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: var(--border-width) dashed var(--border-color);
}

.role-label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.role-name {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-color);
}

.message-card.role-system .role-name {
  color: var(--el-color-info, #909399);
}

.message-card.role-user .role-name {
  color: var(--el-color-success, #67c23a);
}

.message-card.role-assistant .role-name,
.message-card.role-model .role-name {
  color: var(--primary-color);
}

.message-card.role-tool .role-name {
  color: var(--el-color-warning, #e6a23c);
}

.msg-index {
  font-size: 11px;
  color: var(--text-color-light);
  font-family: "Courier New", monospace;
}

/* === 块列表 === */
.block-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.block-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-color-light);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  font-weight: 600;
}

.tool-name {
  background: rgba(
    var(--el-color-warning-rgb),
    calc(var(--card-opacity) * 0.15)
  );
  color: var(--el-color-warning, #e6a23c);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
  font-family: "Courier New", monospace;
  text-transform: none;
  letter-spacing: 0;
}

.tool-id {
  background: var(--bg-color);
  color: var(--text-color-light);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-family: "Courier New", monospace;
  text-transform: none;
  letter-spacing: 0;
}

.block-text {
  margin: 0;
  padding: 8px 10px;
  background: var(--bg-color);
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  color: var(--text-color);
  font-size: 13px;
  font-family: inherit;
  line-height: 1.6;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.thinking-text {
  background: rgba(var(--el-color-info-rgb), calc(var(--card-opacity) * 0.08));
  border-color: rgba(
    var(--el-color-info-rgb),
    calc(var(--card-opacity) * 0.25)
  );
  font-style: italic;
  color: var(--text-color-light);
}

.refusal-text {
  background: rgba(var(--el-color-danger-rgb), calc(var(--card-opacity) * 0.1));
  border-color: rgba(
    var(--el-color-danger-rgb),
    calc(var(--card-opacity) * 0.3)
  );
  color: var(--el-color-danger, #f56c6c);
}

.block-code {
  margin: 0;
  padding: 8px 10px;
  background: var(--bg-color);
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  color: var(--text-color);
  font-size: 12px;
  font-family: "Courier New", monospace;
  line-height: 1.5;
  max-height: 300px;
  overflow: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.image-ref {
  padding: 8px 10px;
  background: var(--bg-color);
  border: var(--border-width) dashed var(--border-color);
  border-radius: 4px;
  color: var(--text-color-light);
  font-size: 12px;
  font-family: "Courier New", monospace;
  word-break: break-all;
}

.empty-block {
  color: var(--text-color-light);
  font-size: 12px;
  padding: 6px 0;
}

/* 搜索高亮 */
.block-text :deep(.search-mark) {
  background: rgba(var(--primary-rgb), calc(var(--card-opacity) * 0.4));
  color: var(--text-color);
  padding: 0 2px;
  border-radius: 2px;
}
</style>
