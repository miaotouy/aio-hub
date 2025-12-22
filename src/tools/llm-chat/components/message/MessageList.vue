<script setup lang="ts">
import { ref, watch, nextTick, computed } from "vue";
import { useThrottleFn } from "@vueuse/core";
import { useVirtualizer } from "@tanstack/vue-virtual";
import type { ChatMessageNode, ChatSession } from "../../types";
import type { Asset } from "@/types/asset-management";
import { useLlmChatStore } from "../../store";
import { useChatSettings } from "../../composables/useChatSettings";
import ChatMessage from "./ChatMessage.vue";
import CompressionMessage from "./CompressionMessage.vue";

interface Props {
  session: ChatSession | null;
  messages: ChatMessageNode[];
  isSending: boolean;
  llmThinkRules?: import("@/tools/rich-text-renderer/types").LlmThinkRule[];
  richTextStyleOptions?: import("@/tools/rich-text-renderer/types").RichTextRendererStyleOptions; // 智能体样式（默认）
  userRichTextStyleOptions?: import("@/tools/rich-text-renderer/types").RichTextRendererStyleOptions; // 用户样式
}
interface Emits {
  (e: "delete-message", messageId: string): void;
  (e: "regenerate", messageId: string, options?: { modelId?: string; profileId?: string }): void;
  (e: "switch-sibling", nodeId: string, direction: "prev" | "next"): void;
  (e: "switch-branch", nodeId: string): void;
  (e: "toggle-enabled", nodeId: string): void;
  (e: "edit-message", nodeId: string, newContent: string, attachments?: Asset[]): void;
  (e: "abort-node", nodeId: string): void;
  (e: "create-branch", nodeId: string): void;
  (e: "analyze-context", nodeId: string): void;
  (e: "save-to-branch", nodeId: string, newContent: string, attachments?: Asset[]): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const store = useLlmChatStore();
const { settings } = useChatSettings();

// 临时展开的压缩节点 ID 集合
const expandedCompressionIds = ref<Set<string>>(new Set());

const toggleCompressionExpand = (nodeId: string) => {
  const newSet = new Set(expandedCompressionIds.value);
  if (newSet.has(nodeId)) {
    newSet.delete(nodeId);
  } else {
    newSet.add(nodeId);
  }
  expandedCompressionIds.value = newSet;
};

/**
 * 被压缩的节点 ID 集合
 * 逻辑：如果路径上存在启用的压缩节点，且该压缩节点未被手动展开，则其管辖的节点 ID 属于此集合
 */
const compressedNodeIds = computed(() => {
  const ids = new Set<string>();
  props.messages.forEach((node) => {
    if (node.metadata?.isCompressionNode && node.isEnabled !== false) {
      // 如果该压缩节点被手动展开，则不视作压缩
      if (expandedCompressionIds.value.has(node.id)) {
        return;
      }
      if (node.metadata.compressedNodeIds) {
        node.metadata.compressedNodeIds.forEach((id) => ids.add(id));
      }
    }
  });
  return ids;
});

// 计算实际显示的消息列表（不再隐藏被压缩的节点，而是全量显示）
const displayMessages = computed(() => {
  return props.messages;
});

// 为每条消息计算兄弟节点信息
const getMessageSiblings = (messageId: string) => {
  // 注意：这里仍然在原始 messages 中查找，因为兄弟节点关系是基于原始树结构的
  const message = props.messages.find((m) => m.id === messageId);

  // 预设消息不在会话节点树中，返回只包含自己的特殊结构（不显示分支导航）
  if (message?.metadata?.isPresetDisplay) {
    return {
      siblings: [message],
      currentIndex: 0,
    };
  }

  const siblings = store.getSiblings(messageId);
  // 找到在当前活动路径上的兄弟节点（而不是传入的 messageId 自己）
  const currentIndex = siblings.findIndex((s: ChatMessageNode) => store.isNodeInActivePath(s.id));
  return {
    siblings,
    currentIndex,
  };
};

// 虚拟滚动容器引用
const messagesContainer = ref<HTMLElement | null>(null);

// 暴露滚动容器供外部使用（如 MessageNavigator）
const getScrollElement = () => messagesContainer.value;

// 消息数量（响应式）- 使用 displayMessages 的长度，因为虚拟列表渲染的是过滤后的消息
const messageCount = computed(() => displayMessages.value.length);

// 创建虚拟化器
const virtualizer = useVirtualizer({
  get count() {
    return messageCount.value;
  },
  getScrollElement: () => messagesContainer.value,
  estimateSize: () => 160, // 预估每条消息的高度
  get overscan() {
    return settings.value.uiPreferences.virtualListOverscan;
  },
});

// 虚拟项列表
const virtualItems = computed(() => virtualizer.value.getVirtualItems());

// 计算当前视口中最主要显示的消息索引
const currentVisibleIndex = computed(() => {
  const items = virtualItems.value;
  if (items.length === 0 || !messagesContainer.value) return 0;

  // 如果已经滚动到底部，直接返回总数，确保显示 N/N
  if (isNearBottom.value) {
    return props.messages.length;
  }

  const container = messagesContainer.value;
  const scrollTop = container.scrollTop;
  const clientHeight = container.clientHeight;
  const scrollBottom = scrollTop + clientHeight;

  // 找到视口内最底部的消息
  // 过滤掉那些起始位置在视口下方的元素（overscan）
  // 然后取最后一个，即为当前视口中最下面一条可见的消息
  const visibleItems = items.filter((item) => item.start < scrollBottom);

  if (visibleItems.length === 0) return 0;

  const lastVisibleItem = visibleItems[visibleItems.length - 1];
  return lastVisibleItem.index + 1; // 转换为 1-based 索引
});

// 总高度
const totalSize = computed(() => virtualizer.value.getTotalSize());

// 自动滚动到底部
const scrollToBottom = useThrottleFn(() => {
  // 直接使用原生滚动，强制滚到真正的底部
  // 不依赖虚拟列表的高度计算，确保流式输出时能及时跟随
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  });
}, 100); // 100ms 节流，避免高频 Layout Thrashing

// 记录用户是否接近底部
const isNearBottom = ref(true);

// 滚动事件处理
const onScroll = () => {
  if (!messagesContainer.value) return;
  const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value;
  // 阈值设为 100px，在这个范围内认为用户想看最新消息
  isNearBottom.value = scrollHeight - clientHeight - scrollTop < 100;
};

// 监听消息数量、总高度变化以及最后一条消息的内容变化
watch(
  [
    () => props.messages.length,
    totalSize,
    // 监听最后一条消息的内容，以便在流式输出时更及时地触发滚动
    () => {
      const lastMsg = props.messages[props.messages.length - 1];
      return lastMsg ? lastMsg.content : "";
    },
  ],
  ([newLength, newTotalSize, newLastContent], [oldLength, oldTotalSize, oldLastContent]) => {
    if (!settings.value.uiPreferences.autoScroll) return;

    const isNewMessage = newLength !== oldLength;
    const isContentChanged = newLastContent !== oldLastContent;

    // 策略：
    // 1. 如果是新消息出现，且用户之前就在底部附近，或者这是第一条消息，则滚动
    // 2. 如果仅仅是内容变长(流式输出)，且用户在底部附近，则跟随滚动
    // 3. 如果用户已经手动向上滚动查看历史(isNearBottom 为 false)，则不打扰

    if (isNewMessage) {
      // 对于新消息，我们稍微放宽一点条件，只要不是离得太远，通常都希望看到新消息
      // 或者是用户自己发送的消息（这里简化处理，假设新消息都滚动，除非用户特意翻上去）
      if (isNearBottom.value || newLength === 1) {
        scrollToBottom();
      }
    } else if (isContentChanged || newTotalSize !== oldTotalSize) {
      // 内容变化（流式输出）或总高度变化
      if (isNearBottom.value) {
        scrollToBottom();
      }
    }
  }
);

// 滚动到顶部
const scrollToTop = () => {
  if (messagesContainer.value) {
    virtualizer.value.scrollToIndex(0, { align: "start" });
  }
};

// 滚动到下一条消息
const scrollToNext = () => {
  const items = virtualizer.value.getVirtualItems();
  if (items.length === 0 || !messagesContainer.value) return;

  const scrollTop = messagesContainer.value.scrollTop;

  // 找到第一个真正可见的消息（底部位置大于当前滚动位置）
  // items 包含 overscan 的元素，所以 items[0] 可能是视口上方的元素
  const firstVisibleItem = items.find((item) => item.end > scrollTop);

  // 如果没找到（理论上不可能），就回退到第一个 item
  const currentIndex = firstVisibleItem ? firstVisibleItem.index : items[0].index;
  const nextIndex = currentIndex + 1;

  if (nextIndex < props.messages.length) {
    // 注意：动态高度的虚拟列表不支持 smooth 滚动，必须使用 auto
    virtualizer.value.scrollToIndex(nextIndex, { align: "start", behavior: "auto" });
  }
};

// 滚动到上一条消息
const scrollToPrev = () => {
  const items = virtualizer.value.getVirtualItems();
  if (items.length === 0 || !messagesContainer.value) return;

  const scrollTop = messagesContainer.value.scrollTop;

  // 找到第一个真正可见的消息
  const firstVisibleItem = items.find((item) => item.end > scrollTop);

  const currentIndex = firstVisibleItem ? firstVisibleItem.index : items[0].index;
  const prevIndex = currentIndex - 1;

  if (prevIndex >= 0) {
    // 注意：动态高度的虚拟列表不支持 smooth 滚动，必须使用 auto
    virtualizer.value.scrollToIndex(prevIndex, { align: "start", behavior: "auto" });
  }
};
// 事件处理函数
// 注意：将 payload 放在前面，messageId 放在后面，以便在模板中利用 $event 直接传参
// 从而避免在模板中编写箭头函数，解决 VSCode 隐式 any 报错和 vue-tsc 解析错误
const handleRegenerate = (
  options: { modelId?: string; profileId?: string } | undefined,
  messageId: string
) => {
  emit("regenerate", messageId, options);
};

const handleSwitchSibling = (direction: "prev" | "next", messageId: string) => {
  emit("switch-sibling", messageId, direction);
};

const handleSwitchBranch = (nodeId: string) => {
  emit("switch-branch", nodeId);
};

// 编辑消息涉及多个参数，模板中只能用箭头函数，这里保持参数顺序不变
const handleEditMessage = (nodeId: string, newContent: string, attachments?: Asset[]) => {
  emit("edit-message", nodeId, newContent, attachments);
};

// 处理保存到分支事件
const handleSaveToBranch = (nodeId: string, newContent: string, attachments?: Asset[]) => {
  emit("save-to-branch", nodeId, newContent, attachments);
};

// 暴露滚动方法和容器引用供外部调用
defineExpose({
  scrollToBottom,
  scrollToTop,
  scrollToNext,
  scrollToPrev,
  getScrollElement,
  currentVisibleIndex,
});
</script>

<template>
  <div class="message-list-container">
    <div ref="messagesContainer" class="message-list" @scroll="onScroll">
      <div v-if="displayMessages.length === 0" class="empty-state">
        <p>👋 开始新的对话吧！</p>
      </div>

      <!-- 虚拟滚动容器 -->
      <div
        v-else
        :style="{
          height: `${totalSize}px`,
          width: '100%',
          position: 'relative',
        }"
      >
        <!-- 仅渲染可见的虚拟项 -->
        <div
          v-for="virtualItem in virtualItems"
          :key="displayMessages[virtualItem.index].id"
          :data-index="virtualItem.index"
          :ref="
            (el) => {
              if (el) virtualizer.measureElement(el as HTMLElement);
            }
          "
          :style="{
            position: 'absolute',
            top: `${virtualItem.start}px`,
            left: 0,
            width: '100%',
          }"
        >
          <div class="message-wrapper">
            <!-- 压缩节点渲染 -->
            <CompressionMessage
              v-if="displayMessages[virtualItem.index].metadata?.isCompressionNode"
              :message="displayMessages[virtualItem.index]"
              :is-expanded="expandedCompressionIds.has(displayMessages[virtualItem.index].id)"
              @toggle-expand="toggleCompressionExpand(displayMessages[virtualItem.index].id)"
              @toggle-enabled="emit('toggle-enabled', displayMessages[virtualItem.index].id)"
              @delete="emit('delete-message', displayMessages[virtualItem.index].id)"
            />

            <!-- 普通消息渲染 -->
            <ChatMessage
              v-else
              :session="props.session"
              :message="displayMessages[virtualItem.index]"
              :is-compressed="compressedNodeIds.has(displayMessages[virtualItem.index].id)"
              :message-depth="displayMessages.length - 1 - virtualItem.index"
              :is-sending="isSending"
              :siblings="getMessageSiblings(displayMessages[virtualItem.index].id).siblings"
              :current-sibling-index="
                getMessageSiblings(displayMessages[virtualItem.index].id).currentIndex
              "
              :llm-think-rules="llmThinkRules"
              :rich-text-style-options="
                displayMessages[virtualItem.index].role === 'user'
                  ? userRichTextStyleOptions || richTextStyleOptions
                  : richTextStyleOptions
              "
              @delete="emit('delete-message', displayMessages[virtualItem.index].id)"
              @regenerate="handleRegenerate($event, displayMessages[virtualItem.index].id)"
              @switch-sibling="handleSwitchSibling($event, displayMessages[virtualItem.index].id)"
              @switch-branch="handleSwitchBranch"
              @toggle-enabled="emit('toggle-enabled', displayMessages[virtualItem.index].id)"
              @edit="
                (newContent: any, attachments: any) =>
                  handleEditMessage(displayMessages[virtualItem.index].id, newContent, attachments)
              "
              @save-to-branch="
                (newContent: any, attachments: any) =>
                  handleSaveToBranch(displayMessages[virtualItem.index].id, newContent, attachments)
              "
              @copy="() => {}"
              @abort="emit('abort-node', displayMessages[virtualItem.index].id)"
              @create-branch="emit('create-branch', displayMessages[virtualItem.index].id)"
              @analyze-context="emit('analyze-context', displayMessages[virtualItem.index].id)"
              @update-translation="
                (translation: any) =>
                  store.updateMessageTranslation(displayMessages[virtualItem.index].id, translation)
              "
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-list-container {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.message-list {
  flex: 1;
  overflow-y: auto; /* 使用 auto 以支持虚拟滚动 */
  padding: 84px 20px 20px 28px; /* 左右各增加8px间距 */
}

.message-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0; /* 消息间距 */
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color-light);
  font-size: 16px;
}

/* 自定义滚动条 */
.message-list::-webkit-scrollbar {
  width: 8px;
}

.message-list::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 4px;
}

.message-list::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 4px;
  transition: background-color 0.2s ease;
}

.message-list:hover::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb-color);
}
</style>
