import {
  computed,
  toValue,
  type ComputedRef,
  type MaybeRefOrGetter,
  type Ref,
} from "vue";
import type { ChatMessageNode } from "../../types";
import type { ChatSettings } from "../../types/settings";
import type { BubbleLayoutConfig } from "../../types/settings";

export interface MessageSiblingInfo {
  siblings: ChatMessageNode[];
  currentIndex: number;
}

export interface MessageLayoutInfo {
  /** CSS 选择器友好的角色 (compression 节点视作 system) */
  role: "user" | "assistant" | "tool" | "system";
  /** 对齐方向 */
  align: "left" | "right" | "center";
}

/**
 * 气泡布局的临时覆盖 (用于截图分享等场景, 不修改系统设置)。
 * - mode === "follow" 时沿用系统设置的 mode
 * - borderRadius === undefined / null 时沿用系统设置
 */
export interface BubbleLayoutOverride {
  mode?: "follow" | "card" | "bubble";
  borderRadius?: number | null;
}

export interface UseMessageLayoutOptions {
  messages: Ref<ChatMessageNode[]> | ComputedRef<ChatMessageNode[]>;
  settings: Ref<ChatSettings> | ComputedRef<ChatSettings>;
  /**
   * 用于查询兄弟节点 / 判断激活路径。
   * 必须返回 ChatMessageNode[] / 布尔值,语义对齐 LlmChatStore.getSiblings 与 isNodeInActivePath
   */
  getSiblings: (nodeId: string) => ChatMessageNode[];
  isNodeInActivePath: (nodeId: string) => boolean;
  /**
   * 临时布局覆盖 (与系统设置合并, 不写入持久化设置)。
   * 仅覆盖 mode 和 borderRadius, 其余字段 (对齐/头像/header/最大宽度等)
   * 继续沿用系统设置, 避免在截图面板里暴露过多配置。
   */
  layoutOverrides?: MaybeRefOrGetter<BubbleLayoutOverride | undefined>;
}

export interface UseMessageLayoutReturn {
  /** 是否处于气泡模式 */
  isBubbleMode: ComputedRef<boolean>;
  /** 头像位置 (inside / outside) */
  avatarPlacement: ComputedRef<"inside" | "outside">;
  /** header 位置 (inside / outside) */
  headerPlacement: ComputedRef<"inside" | "outside">;
  /** 是否全局显示头像 */
  showAvatar: ComputedRef<boolean>;
  /** 是否应隐藏消息头内嵌头像 (气泡外置头像场景) */
  shouldHideHeaderAvatar: ComputedRef<boolean>;
  /** 当前气泡布局配置 (已合并系统设置 + 临时覆盖) */
  bubbleLayout: ComputedRef<BubbleLayoutConfig>;
  /** 注入到 .messages-container 的 CSS 变量 */
  bubbleLayoutVars: ComputedRef<Record<string, string>>;
  /** 每条消息的布局信息(按 messages 顺序) */
  messageLayouts: ComputedRef<MessageLayoutInfo[]>;
  /** 压缩节点 ID 集合(命中后消息视作禁用) */
  compressedNodeIds: ComputedRef<Set<string>>;
  /** 兄弟节点信息 Map (key: messageId) */
  messageSiblingInfoMap: ComputedRef<Map<string, MessageSiblingInfo>>;
  /** 按 index 读取布局信息(越界时回退到 system/left) */
  getMessageLayout: (index: number) => MessageLayoutInfo;
  /** 按 messageId 读取兄弟信息(缺省时回退到空 siblings) */
  getMessageSiblings: (messageId: string) => MessageSiblingInfo;
  /** 是否使用外置 header(气泡模式 + outside header + 普通 user/assistant) */
  shouldUseOutsideHeader: (
    msg: ChatMessageNode,
    layoutInfo: MessageLayoutInfo
  ) => boolean;
}

/**
 * 提取自 MessageList.vue 的布局编排逻辑。
 * 主列表和截图渲染器共享同一份计算,保证排版一致。
 */
export function useMessageLayout(
  options: UseMessageLayoutOptions
): UseMessageLayoutReturn {
  const {
    messages,
    settings,
    getSiblings,
    isNodeInActivePath,
    layoutOverrides,
  } = options;

  // 系统值 + 临时覆盖 合并, 供下游 bubbleLayoutVars / isBubbleMode 等消费
  const bubbleLayout = computed<BubbleLayoutConfig>(() => {
    const sys = settings.value.uiPreferences.bubbleLayout;
    const ov = toValue(layoutOverrides);
    if (!ov) return sys;
    const mode: BubbleLayoutConfig["mode"] =
      !ov.mode || ov.mode === "follow" ? sys.mode : ov.mode;
    const borderRadius =
      ov.borderRadius === undefined || ov.borderRadius === null
        ? sys.borderRadius
        : ov.borderRadius;
    return { ...sys, mode, borderRadius };
  });

  const isBubbleMode = computed(() => bubbleLayout.value.mode === "bubble");
  const avatarPlacement = computed(() => bubbleLayout.value.avatarPlacement);
  const headerPlacement = computed(() => bubbleLayout.value.headerPlacement);
  const showAvatar = computed(() => settings.value.uiPreferences.showAvatar);

  // 气泡外置头像时,MessageHeader 内的内嵌头像应隐藏
  const shouldHideHeaderAvatar = computed(
    () =>
      !showAvatar.value ||
      (isBubbleMode.value && avatarPlacement.value === "outside")
  );

  const compressedNodeIds = computed(() => {
    const ids = new Set<string>();
    const list = messages.value;
    for (const node of list) {
      if (node.metadata?.isCompressionNode && node.isEnabled !== false) {
        if (node.metadata.compressedNodeIds) {
          for (const id of node.metadata.compressedNodeIds) ids.add(id);
        }
      }
    }
    return ids;
  });

  const messageSiblingInfoMap = computed(() => {
    const map = new Map<string, MessageSiblingInfo>();
    const list = messages.value;
    for (const message of list) {
      if (message.metadata?.isPresetDisplay) {
        map.set(message.id, { siblings: [message], currentIndex: 0 });
        continue;
      }
      const siblings = getSiblings(message.id);
      const currentIndex = siblings.findIndex((s) => isNodeInActivePath(s.id));
      map.set(message.id, { siblings, currentIndex });
    }
    return map;
  });

  const messageLayouts = computed<MessageLayoutInfo[]>(() => {
    const layout = bubbleLayout.value;
    const isBubble = layout.mode === "bubble";
    const list = messages.value;
    const result: MessageLayoutInfo[] = [];

    for (let i = 0; i < list.length; i++) {
      const msg = list[i];

      let role: MessageLayoutInfo["role"];
      if (msg.metadata?.isCompressionNode) {
        role = "system";
      } else if (msg.role === "tool") {
        role = "tool";
      } else if (msg.role === "user") {
        role = "user";
      } else if (msg.role === "assistant") {
        role = "assistant";
      } else {
        role = "system";
      }

      let align: MessageLayoutInfo["align"] = "left";
      if (isBubble) {
        if (role === "user") {
          align = layout.userAlign;
        } else if (role === "assistant") {
          align = layout.assistantAlign;
        } else if (role === "system") {
          align = layout.systemAlign;
        } else if (role === "tool") {
          if (layout.toolAttachment === "center") {
            align = "center";
          } else {
            const prevInfo = i > 0 ? result[i - 1] : null;
            if (prevInfo && prevInfo.align !== "center") {
              align = prevInfo.align;
            } else {
              align = layout.assistantAlign;
            }
          }
        }
      }

      result.push({ role, align });
    }

    return result;
  });

  const getMessageLayout = (index: number): MessageLayoutInfo => {
    return (
      messageLayouts.value[index] ?? {
        role: "system",
        align: "left",
      }
    );
  };

  const getMessageSiblings = (messageId: string): MessageSiblingInfo => {
    return (
      messageSiblingInfoMap.value.get(messageId) ?? {
        siblings: [],
        currentIndex: -1,
      }
    );
  };

  const bubbleLayoutVars = computed(() => {
    const l = bubbleLayout.value;
    return {
      "--bubble-max-width-percent": `${l.maxWidthPercent}%`,
      "--bubble-max-width-px": `${l.maxWidthPx}px`,
      "--system-max-width-percent": `${l.systemMaxWidthPercent}%`,
      "--avatar-outside-size": `${l.avatarSize}px`,
      "--avatar-outside-gap": `${l.avatarGap}px`,
      "--header-outside-gap": `${l.headerGap}px`,
      "--bubble-radius": `${l.borderRadius}px`,
    } as Record<string, string>;
  });

  const shouldUseOutsideHeader = (
    msg: ChatMessageNode,
    layoutInfo: MessageLayoutInfo
  ): boolean => {
    if (!isBubbleMode.value) return false;
    if (headerPlacement.value !== "outside") return false;
    if (layoutInfo.align === "center") return false;
    if (msg.metadata?.isCompressionNode) return false;
    if (msg.role !== "user" && msg.role !== "assistant") return false;
    return true;
  };

  return {
    isBubbleMode,
    avatarPlacement,
    headerPlacement,
    showAvatar,
    shouldHideHeaderAvatar,
    bubbleLayout,
    bubbleLayoutVars,
    messageLayouts,
    compressedNodeIds,
    messageSiblingInfoMap,
    getMessageLayout,
    getMessageSiblings,
    shouldUseOutsideHeader,
  };
}
