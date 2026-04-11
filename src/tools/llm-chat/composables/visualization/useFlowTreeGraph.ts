import { ref, reactive, type Ref } from "vue";
import { useMagicKeys, onKeyStroke } from '@vueuse/core';
import { useChatSettings } from "../settings/useChatSettings";
import * as d3Force from "d3-force";
import { stratify, tree, type HierarchyNode } from "d3-hierarchy";
import type { ChatSessionDetail, ChatMessageNode } from "../../types";
import { BranchNavigator } from "../../utils/BranchNavigator";
import { useLlmChatStore } from "../../stores/llmChatStore";
import { useAgentStore } from "../../stores/agentStore";
import { useUserProfileStore } from "../../stores/userProfileStore";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useModelMetadata } from "@/composables/useModelMetadata";
import { useNodeManager } from "../session/useNodeManager";
import type { Asset } from "@/types/asset-management";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { customMessage } from "@/utils/customMessage";
import type { MenuItem } from "../../components/conversation-tree-graph/ContextMenu.vue";

const logger = createModuleLogger("llm-chat/composables/useFlowTreeGraph");
const errorHandler = createModuleErrorHandler("llm-chat/composables/useFlowTreeGraph");

/**
 * 上下文菜单状态
 */
interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  items: MenuItem[];
}

/**
 * 详情悬浮窗状态
 */
export interface DetailPopupState {
  visible: boolean;
  nodeId: string | null;
  targetElement: HTMLElement | null;
  initialPosition: { x: number; y: number };
}

/**
 * 连接预览状态
 */
export interface ConnectionPreviewState {
  isConnecting: boolean;      // 是否正在连接中
  sourceNodeId: string | null;  // 连接的源节点 ID
  targetNodeId: string | null;  // 当前悬停的目标节点 ID
  isTargetValid: boolean;     // 目标节点是否有效
  isGrafting: boolean;        // 是否为嫁接子树模式
}

/**
 * Vue Flow 节点类型
 */
interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    name: string;
    avatar: string;
    contentPreview: string;
    isActiveLeaf: boolean;
    isEnabled: boolean;
    timestamp: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
    status: 'generating' | 'complete' | 'error';
    errorMessage?: string;
    subtitleInfo: {
      profileName: string;
      profileIcon: string | undefined;
      modelName: string;
      modelIcon: string | undefined;
    } | null;
    colors: {
      background: string;
      border: string;
    };
    tokens?: {
      total: number;
      prompt?: number;
      completion?: number;
    } | null;
    attachments?: Asset[];
    _node: ChatMessageNode;
    // 压缩节点相关状态
    isCompressionNode?: boolean;
    isExpanded?: boolean;
    originalMessageCount?: number;
    originalTokenCount?: number;
    // 模型和配置 ID（用于转写状态计算）
    modelId?: string;
    profileId?: string;
  };
}

/**
 * Vue Flow 边类型
 */
interface FlowEdge {
  id: string;
  source: string;
  target: string;
  animated?: boolean;
  style?: Record<string, any>;
}

/**
 * D3 力导向节点类型（用于布局计算）
 * 增加 depth 字段用于基于层级的定向布局（自上而下的树形）
 */
interface D3Node extends d3Force.SimulationNodeDatum {
  id: string;
  depth: number;
  width: number;
  height: number;
  isActiveLeaf: boolean;
  isEnabled: boolean;
}

/**
 * D3 力导向边类型
 */
interface D3Link extends d3Force.SimulationLinkDatum<D3Node> {
  source: string | D3Node;
  target: string | D3Node;
  // 附加的调试信息
  _debug?: {
    strength: number;
    distance: number;
  };
}

/**
 * 布局模式类型
 */
export type LayoutMode = 'tree' | 'physics' | 'static';

/**
 * 自定义 D3 力：模拟持续的重力加速度
 * @param strength 重力强度，一个正值代表Y轴向下
 */
function gravityForce(strength: number) {
  let nodes: D3Node[];

  // force 函数会在模拟的每个 tick 被调用
  function force(alpha: number) {
    for (const node of nodes) {
      // 只对没有被手动固定的节点施加重力
      if (node.fy == null) {
        // 直接给节点的垂直速度 vy 增加一个量
        // 这个量是重力强度乘以 alpha，这样在模拟稳定时重力也会减弱，防止抖动
        node.vy = (node.vy || 0) + strength * alpha;
      }
    }
  }

  // D3 用于初始化力的函数
  force.initialize = (_: D3Node[]) => {
    nodes = _;
  };

  // 用于设置或获取重力强度
  force.strength = (_?: number) => {
    if (_ === undefined) return strength;
    strength = +_;
    return force;
  };

  return force;
}

/**
 * Vue Flow 树图 Composable
 * 使用 D3 力导向布局 + Vue Flow 渲染
 */
export function useFlowTreeGraph(
  sessionRef: () => ChatSessionDetail | null,
  contextMenuState: Ref<ContextMenuState>,
  target: Ref<HTMLElement | null>
) {
  const { shift, alt, ctrl } = useMagicKeys();
  const { settings } = useChatSettings();
  const store = useLlmChatStore();
  const { getProfileById } = useLlmProfiles();
  const { getModelIcon } = useModelMetadata();

  // Vue Flow 的节点和边数据（响应式）
  const nodes = ref<FlowNode[]>([]);
  const edges = ref<FlowEdge[]>([]);

  // 布局模式
  const layoutMode = ref<LayoutMode>('tree');

  // 调试模式
  const debugMode = ref(false);

  // 展开的压缩节点 ID 集合
  const expandedCompressionIds = ref(new Set<string>());

  // 详情悬浮窗状态
  const detailPopupState = ref<DetailPopupState>({
    visible: false,
    nodeId: null,
    targetElement: null,
    initialPosition: { x: 200, y: 150 },
  });

  // D3 力模拟实例
  let simulation: d3Force.Simulation<D3Node, D3Link> | null = null;
  const d3Nodes = ref<D3Node[]>([]);
  const d3Links = ref<D3Link[]>([]);

  // 节点真实尺寸缓存
  const measuredDimensions = reactive(new Map<string, { width: number; height: number }>());
  // 是否正在等待节点尺寸更新（用于初始布局优化）
  const isWaitingForDimensions = ref(false);
  // 等待尺寸更新的节点 ID 集合
  const pendingNodeIds = ref(new Set<string>());
  // 布局超时定时器
  let layoutTimeoutId: any = null;

  // 记录上一次的拓扑结构指纹，用于判断是否需要重新布局
  let lastStructureFingerprint = "";

  // 用于子树拖拽的状态
  const subtreeDragState = reactive({
    isDragging: false,
    rootNodeId: null as string | null,
    descendantIds: new Set<string>(),
  });

  // 用于手动计算拖拽位移，以避免依赖不稳定的 event.movement
  const dragPositionState = reactive({
    lastPosition: null as { x: number; y: number } | null,
  });

  // 连接预览状态
  const connectionPreviewState = reactive<ConnectionPreviewState>({
    isConnecting: false,
    sourceNodeId: null,
    targetNodeId: null,
    isTargetValid: false,
    isGrafting: false,
  });

  /**
   * 切换压缩节点的展开/折叠状态
   */
  function toggleCompressionExpanded(nodeId: string) {
    if (expandedCompressionIds.value.has(nodeId)) {
      expandedCompressionIds.value.delete(nodeId);
    } else {
      expandedCompressionIds.value.add(nodeId);
    }
    // 状态变化后更新图表
    updateChart();
  }

  /**
    * 计算每个节点的直接子节点数
    */
  function calculateDirectChildrenCount(nodes: Record<string, ChatMessageNode> | undefined): Map<string, number> {
    const counts = new Map<string, number>();
    if (!nodes) return counts;

    // 初始化所有节点的子节点计数为 0
    for (const nodeId in nodes) {
      counts.set(nodeId, 0);
    }

    // 遍历所有节点，为其父节点增加计数
    for (const node of Object.values(nodes)) {
      if (node.parentId && counts.has(node.parentId)) {
        counts.set(node.parentId, (counts.get(node.parentId) || 0) + 1);
      }
    }

    return counts;
  }
  /**
   * 计算会话的拓扑结构指纹
   * 只关注节点ID和父子关系，不关注内容
   */
  function getStructureFingerprint(session: ChatSessionDetail): string {
    if (!session.nodes) return "not-loaded";
    return Object.values(session.nodes)
      .map(n => `${n.id}:${n.parentId || ''}`)
      .sort()
      .join('|');
  }

  /**
   * 截断文本用于显示
   */
  function truncateText(text: string, maxLength: number = 150): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  }

  /**
   * 获取当前主题（明暗）
   */
  function isDarkTheme(): boolean {
    return document.documentElement.classList.contains("dark");
  }

  function getCssVar(varName: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }

  /**
   * 创建动态调色板
   */
  function createThemePalette() {
    const dark = isDarkTheme();
    const lightSuffix = dark ? "" : "-light-3";
    const lighterSuffix = dark ? "-light-3" : "-light-5";
    const inactiveSuffix = dark ? "-dark-2" : "-light-8";

    const cardBg = getCssVar("--card-bg");
    const containerBg = getCssVar("--container-bg");

    return {
      user: {
        base: cardBg || getCssVar("--el-color-primary"),
        light: getCssVar(`--el-color-primary${lightSuffix}`),
        lighter: containerBg || getCssVar(`--el-color-primary${lighterSuffix}`),
      },
      assistant: {
        base: cardBg || getCssVar("--el-color-success"),
        light: getCssVar(`--el-color-success${lightSuffix}`),
        lighter: containerBg || getCssVar(`--el-color-success${lighterSuffix}`),
      },
      system: {
        base: cardBg || getCssVar("--el-color-warning"),
        light: getCssVar(`--el-color-warning${lightSuffix}`),
        lighter: containerBg || getCssVar(`--el-color-warning${lighterSuffix}`),
      },
      danger: {
        base: getCssVar("--el-color-danger"),
        light: getCssVar(`--el-color-danger${lightSuffix}`),
      },
      disabled: {
        base: getCssVar(`--el-color-info${inactiveSuffix}`),
        light: getCssVar(`--el-color-info${inactiveSuffix}`),
      },
      inactive: {
        base: getCssVar(`--el-color-info-dark-2`),
        light: getCssVar(`--el-color-info${lightSuffix}`),
      },
      edge: {
        active: getCssVar("--el-color-primary"),
        activeHighlight: getCssVar(`--el-color-primary${lightSuffix}`),
        inactive: getCssVar(`--el-color-info${inactiveSuffix}`),
        inactiveHighlight: getCssVar(`--el-color-info${lightSuffix}`),
      },
    };
  }

  const palette = reactive(createThemePalette());

  // 监听主题变化
  const observer = new MutationObserver(() => {
    Object.assign(palette, createThemePalette());
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style"],
  });

  const getBindingState = (binding: string) => {
    const parts = binding.toLowerCase().split("+");
    const key = parts.pop() || "";
    const ctrl = parts.includes("ctrl") || parts.includes("cmd");
    const shift = parts.includes("shift");
    const alt = parts.includes("alt");
    return { key, ctrl, shift, alt };
  };

  // 注册撤销快捷键
  onKeyStroke(
    (event) => {
      if (settings.value.shortcuts.undo === "none") return false;
      const binding = getBindingState(settings.value.shortcuts.undo);
      const isTriggered =
        event.key.toLowerCase() === binding.key &&
        (event.ctrlKey || event.metaKey) === binding.ctrl &&
        event.shiftKey === binding.shift &&
        event.altKey === binding.alt;
      return isTriggered;
    },
    (event) => {
      if (store.canUndo) {
        event.preventDefault();
        store.undo();
      }
    },
    { target }
  );

  // 注册重做快捷键
  onKeyStroke(
    (event) => {
      if (settings.value.shortcuts.redo === "none") return false;
      const binding = getBindingState(settings.value.shortcuts.redo);
      const isTriggered =
        event.key.toLowerCase() === binding.key &&
        (event.ctrlKey || event.metaKey) === binding.ctrl &&
        event.shiftKey === binding.shift &&
        event.altKey === binding.alt;
      return isTriggered;
    },
    (event) => {
      if (store.canRedo) {
        event.preventDefault();
        store.redo();
      }
    },
    { target }
  );

  /**
   * 计算节点的层级深度（根节点为 0）
   */
  function calculateNodeDepth(session: ChatSessionDetail, nodeId: string): number {
    let depth = 0;
    if (!session.nodes || !session.rootNodeId) return depth;
    let currentId: string | null = nodeId;

    while (currentId && currentId !== session.rootNodeId) {
      const node: ChatMessageNode | undefined = session.nodes[currentId];
      if (!node || !node.parentId) break;
      depth++;
      currentId = node.parentId;
    }

    return depth;
  }

  /**
   * 根据节点状态计算颜色
   */
  function getNodeColor(session: ChatSessionDetail, node: ChatMessageNode, isCompressed: boolean = false): {
    background: string;
    border: string;
  } {
    const isOnActivePath = BranchNavigator.isNodeInActivePath(session, node.id);
    const isActiveLeaf = !!session.activeLeafId && node.id === session.activeLeafId;
    const isEnabled = node.isEnabled !== false && !isCompressed;

    type RoleColorKey = 'user' | 'assistant' | 'system';
    const roleKey = node.role as RoleColorKey;
    const roleColors = (palette[roleKey] && 'base' in palette[roleKey])
      ? palette[roleKey] as { base: string; light: string; lighter: string }
      : palette.inactive as { base: string; light: string };

    if (!isEnabled) {
      return {
        background: palette.disabled.base,
        border: palette.disabled.light,
      };
    }

    let background: string, border: string;

    if (isOnActivePath) {
      background = roleColors.base;
      border = roleColors.light;
    } else {
      background = ('lighter' in roleColors ? roleColors.lighter : roleColors.light) as string;
      border = roleColors.light;
    }

    if (isActiveLeaf) {
      border = palette.danger.base;
    }

    return { background, border };
  }

  /**
   * 判断图标是否像文件名
   */
  function isLikelyFilename(icon: string): boolean {
    return icon.includes('.') && !icon.includes('/') && !icon.includes('\\');
  }

  /**
   * 获取角色的头像和显示名称
   */
  /**
   * 获取副标题信息（模型、渠道）
   */
  function getSubtitleInfo(node: ChatMessageNode) {
    const agentStore = useAgentStore();
    const metadata = node.metadata;
    if (!metadata || node.role !== 'assistant') return null;

    const agent = metadata.agentId ? agentStore.getAgentById(metadata.agentId) : null;

    const profileId = metadata.profileId || agent?.profileId;
    const modelId = metadata.modelId || agent?.modelId;

    if (!profileId || !modelId) return null;

    const profile = getProfileById(profileId);
    if (!profile) return null;

    const model = profile.models.find(m => m.id === modelId);
    if (!model) return null;

    const modelIcon = getModelIcon(model);
    const profileIcon = profile.icon || profile.logoUrl;
    const displayModelName = metadata.modelName || model.name || model.id;

    return {
      profileName: profile.name,
      profileIcon: profileIcon,
      modelName: displayModelName,
      modelIcon: modelIcon || undefined
    };
  }

  /**
   * 获取角色的头像和显示名称
   */
  function getRoleDisplay(node: ChatMessageNode): { icon: string; name: string } {
    const agentStore = useAgentStore();
    const userProfileStore = useUserProfileStore();

    if (node.role === "user") {
      // 尝试获取最新名称作为回退
      const userProfileId = node.metadata?.userProfileId;
      const currentProfile = userProfileId
        ? userProfileStore.getProfileById(userProfileId)
        : userProfileStore.globalProfile;

      const name =
        node.metadata?.userProfileName ||
        currentProfile?.displayName ||
        currentProfile?.name ||
        "你";

      let target;
      if (node.metadata?.userProfileIcon && node.metadata?.userProfileId) {
        target = {
          id: node.metadata.userProfileId,
          icon: node.metadata.userProfileIcon,
        };
      } else {
        const userProfileId = node.metadata?.userProfileId;
        target = userProfileId
          ? userProfileStore.getProfileById(userProfileId)
          : userProfileStore.globalProfile;
      }

      let icon = target?.icon?.trim() || "👤";

      if (icon && icon !== "👤") {
        // 如果是文件名格式，则转换为 appdata:// 路径
        if (isLikelyFilename(icon) && target?.id) {
          icon = `appdata://llm-chat/user-profiles/${target.id}/${icon}`;
        }
      }

      return { icon, name };
    } else if (node.role === "assistant") {
      const agentId = node.metadata?.agentId;
      const currentAgent = agentId ? agentStore.getAgentById(agentId) : null;

      const name =
        node.metadata?.agentName ||
        currentAgent?.displayName ||
        currentAgent?.name ||
        "助手";

      let target;
      if (node.metadata?.agentIcon && node.metadata?.agentId) {
        target = {
          id: node.metadata.agentId,
          icon: node.metadata.agentIcon,
        };
      } else {
        const agentId = node.metadata?.agentId;
        target = agentId ? agentStore.getAgentById(agentId) : null;
      }

      let icon = target?.icon?.trim() || "🤖";

      if (icon && icon !== "🤖") {
        // 如果是文件名格式，则转换为 appdata:// 路径
        if (isLikelyFilename(icon) && target?.id) {
          icon = `appdata://llm-chat/agents/${target.id}/${icon}`;
        }
      }

      return { icon, name };
    } else {
      return { icon: "⚙️", name: "系统" };
    }
  }

  /**
  * 初始化或更新图表数据
  * @param forceResetPosition - 如果为 true，则忽略所有现有位置，从 (0,0) 开始
  */
  function updateChart(forceResetPosition: boolean = false): void {
    const session = sessionRef();
    if (!session) {
      nodes.value = [];
      edges.value = [];
      lastStructureFingerprint = "";
      return;
    }

    // 计算当前的拓扑结构指纹
    // 注意：引入压缩折叠后，指纹还需要包含展开状态，否则折叠/展开不会触发结构更新
    const currentFingerprint = getStructureFingerprint(session) + '|' + Array.from(expandedCompressionIds.value).sort().join(',');
    const isStructureChanged = forceResetPosition || currentFingerprint !== lastStructureFingerprint;

    // 记录旧节点位置，用于在更新时平滑过渡，避免整个树每次都从 (0, 0) 重新收缩成一团
    const previousNodesMap = new Map<string, FlowNode>();
    // 仅当不强制重置时才记录旧位置
    if (!forceResetPosition) {
      for (const n of nodes.value) {
        previousNodesMap.set(n.id, n);
      }
    }

    // --- 预处理压缩节点逻辑 ---
    const hiddenNodeIds = new Set<string>();
    const compressedNodeIds = new Set<string>(); // 记录所有当前被压缩的节点 ID
    const nodeRepMap = new Map<string, string>(); // OriginalId -> RepresentativeId (SummaryNodeId)
    const logicalParentMap = new Map<string, string>(); // SummaryNodeId -> LogicalParentId (FirstNode.parentId)

    if (!session.nodes) return;
    Object.values(session.nodes).forEach(node => {
      if (node.metadata?.isCompressionNode && node.isEnabled !== false) {
        const compressedIds = node.metadata.compressedNodeIds || [];
        const isExpanded = expandedCompressionIds.value.has(node.id);

        if (compressedIds.length > 0) {
          // 无论是否展开，都记录这些节点是被压缩的
          compressedIds.forEach(id => compressedNodeIds.add(id));

          // 不再标记为隐藏，而是记录它们被压缩了，以便在渲染时应用禁用样式
          compressedIds.forEach(id => {
            compressedNodeIds.add(id);
            if (!isExpanded) {
              // 如果没有展开，我们将它们逻辑上链接到压缩节点，但节点本身保持可见
              nodeRepMap.set(id, node.id);
            }
          });

          // 2. 确定压缩节点的逻辑父节点
          // 找到第一个被压缩的节点，取其父节点
          const firstNodeId = compressedIds[0];
          const firstNode = session.nodes![firstNodeId];
          if (firstNode && firstNode.parentId) {
            logicalParentMap.set(node.id, firstNode.parentId);
          }
        }
      }
    });

    // 辅助函数：获取可见的父节点 ID
    const getVisibleParentId = (originalParentId: string): string | null => {
      // 1. 如果父节点被隐藏，尝试找到它的代表（压缩节点）
      let effectiveParentId = originalParentId;
      if (hiddenNodeIds.has(effectiveParentId)) {
        const rep = nodeRepMap.get(effectiveParentId);
        if (rep) effectiveParentId = rep;
      }

      // 2. 如果代表本身也被隐藏（嵌套压缩），递归查找（这里简单处理，假设只有一层或 rep 指向最外层）
      // 如果 rep 也在 hiddenNodeIds 里，说明出现了嵌套且都被折叠。
      // 为防止死循环，这里只做有限层级的查找或假设 nodeRepMap 已经扁平化（当前实现未扁平化，但通常压缩是线性的）
      // 在当前上下文压缩实现中，通常不会有复杂的嵌套结构，如果有，也通常是线性的。

      // 检查 effectiveParentId 是否真的可见
      if (hiddenNodeIds.has(effectiveParentId)) {
        // 这里的逻辑可能需要更健壮，但对于目前的需求，如果父节点不可见，那就断开或连到上一级
        return null;
      }

      return effectiveParentId;
    };


    // 转换节点数据为 Vue Flow 格式
    const flowNodes: FlowNode[] = [];

    Object.values(session.nodes).forEach((node) => {
      // 如果节点被显式隐藏（例如其他过滤逻辑），跳过
      if (hiddenNodeIds.has(node.id)) return;

      const isCompressed = compressedNodeIds.has(node.id);
      const isActiveLeaf = node.id === session.activeLeafId;
      const isEnabled = node.isEnabled !== false && !isCompressed; // 被压缩也视作禁用
      const colors = getNodeColor(session, node, isCompressed);
      const roleDisplay = getRoleDisplay(node);
      const contentPreview = truncateText(node.content, 150);
      const subtitleInfo = getSubtitleInfo(node);
      const attachments = node.attachments || [];
      const isCompressionNode = !!node.metadata?.isCompressionNode;
      const isExpanded = expandedCompressionIds.value.has(node.id);

      // 提取 Token 信息
      let tokens: { total: number; prompt?: number; completion?: number } | null = null;
      if (node.metadata?.usage) {
        tokens = {
          total: node.metadata.usage.totalTokens,
          prompt: node.metadata.usage.promptTokens,
          completion: node.metadata.usage.completionTokens,
        };
      } else if (node.metadata?.contentTokens) {
        tokens = {
          total: node.metadata.contentTokens,
        };
      }

      // 确定用于定位的父节点
      let positioningParentId = node.parentId;
      if (isCompressionNode && !isExpanded && logicalParentMap.has(node.id)) {
        positioningParentId = logicalParentMap.get(node.id)!;
      }
      // 获取可见的父节点 ID
      if (positioningParentId) {
        const visibleParent = getVisibleParentId(positioningParentId);
        if (visibleParent) positioningParentId = visibleParent;
      }

      const previousNode = previousNodesMap.get(node.id);
      let initialPosition;

      if (previousNode) {
        // 已有节点：继承位置
        initialPosition = { ...previousNode.position };
      } else if (positioningParentId && !forceResetPosition) {
        // 新节点且有父节点：出生在父节点下方 (仅在非强制重置时)
        const parentNode = previousNodesMap.get(positioningParentId);
        if (parentNode) {
          initialPosition = {
            x: parentNode.position.x,
            y: parentNode.position.y + 240, // 在父节点下方偏移一段距离
          };
        } else {
          initialPosition = { x: 0, y: 0 };
        }
      } else {
        // 新节点、根节点或强制重置：使用 (0, 0)
        initialPosition = { x: 0, y: 0 };
      }
      // 提取模型和配置 ID（用于转写状态计算）
      const agentStore = useAgentStore();
      const agent = node.metadata?.agentId ? agentStore.getAgentById(node.metadata.agentId) : null;
      const modelId = node.metadata?.modelId || agent?.modelId;
      const profileId = node.metadata?.profileId || agent?.profileId;

      flowNodes.push({
        id: node.id,
        type: 'custom',
        position: initialPosition,
        data: {
          name: roleDisplay.name,
          avatar: roleDisplay.icon,
          contentPreview,
          isActiveLeaf,
          isEnabled,
          timestamp: node.timestamp || "",
          role: node.role,
          status: node.status,
          errorMessage: node.metadata?.error,
          subtitleInfo,
          colors,
          tokens,
          attachments,
          _node: node,
          // 传递压缩相关状态
          isCompressionNode,
          isExpanded,
          originalMessageCount: node.metadata?.originalMessageCount,
          originalTokenCount: node.metadata?.originalTokenCount,
          // 传递模型和配置 ID
          modelId,
          profileId,
        },
      });
    });

    // 转换边数据为 Vue Flow 格式
    const flowEdges: FlowEdge[] = [];

    // 遍历生成的 flowNodes 来建立连接，而不是遍历 session.nodes
    // 这样可以确保只连接可见的节点
    flowNodes.forEach(targetNode => {
      if (!session.nodes) return;
      const node = session.nodes[targetNode.id];
      if (!node) return;

      // 确定逻辑上的父节点 ID
      let rawParentId = node.parentId;

      // 如果是折叠的压缩节点，它的逻辑父节点是它压缩的第一个节点的父节点
      if (targetNode.data.isCompressionNode && !targetNode.data.isExpanded && logicalParentMap.has(node.id)) {
        rawParentId = logicalParentMap.get(node.id)!;
      }

      if (rawParentId) {
        const sourceId = getVisibleParentId(rawParentId);

        if (sourceId) {
          // 检查源节点是否在 flowNodes 中 (防止连接到已被过滤的节点)
          // 虽然 getVisibleParentId 应该已经处理了，但双重检查更安全
          if (!flowNodes.find(n => n.id === sourceId)) return;

          const isOnActivePath =
            BranchNavigator.isNodeInActivePath(session, sourceId) &&
            BranchNavigator.isNodeInActivePath(session, targetNode.id);

          flowEdges.push({
            id: `${sourceId}-${targetNode.id}`,
            source: sourceId,
            target: targetNode.id,
            animated: isOnActivePath,
            style: {
              stroke: isOnActivePath ? palette.edge.active : palette.edge.inactive,
              strokeWidth: isOnActivePath ? 2 : 1,
            },
          });
        }
      }
    });

    // 如果拓扑结构没有变化，只是内容更新（如流式生成），则仅更新节点数据，不重新初始化布局
    if (!isStructureChanged && nodes.value.length > 0) {
      logger.info(`检测到内容更新（非结构变化），更新节点数据，跳过布局重算`, {
        nodeCount: flowNodes.length,
        edgeCount: flowEdges.length,
      });

      // 直接替换 nodes 和 edges，触发 Vue Flow 更新
      // 注意：flowNodes 在生成时已经继承了 previousNodesMap 中的位置信息，
      // 所以这里直接赋值不会导致位置跳变，同时能确保 data 的更新被视图响应。
      nodes.value = flowNodes;
      edges.value = flowEdges;

      return; // 跳过布局重算
    }

    // 拓扑结构发生变化，需要完整的布局重算
    logger.info(`准备更新图表（结构变化），转换得到 ${flowNodes.length} 个节点和 ${flowEdges.length} 条边。`);
    lastStructureFingerprint = currentFingerprint;
    nodes.value = flowNodes;
    edges.value = flowEdges;

    // --- 优化：先等待节点尺寸到位，再计算布局 ---
    // 1. 标记开始等待
    isWaitingForDimensions.value = true;
    pendingNodeIds.value = new Set(flowNodes.map(n => n.id));

    // 2. 清除旧的超时
    if (layoutTimeoutId) {
      clearTimeout(layoutTimeoutId);
      layoutTimeoutId = null;
    }

    // 3. 设置新的超时兜底 (300ms)
    // 如果 300ms 内节点尺寸还没全部回来（比如节点不可见），强制开始布局
    layoutTimeoutId = setTimeout(() => {
      if (isWaitingForDimensions.value) {
        logger.warn("等待节点尺寸超时，强制开始布局", {
          pendingCount: pendingNodeIds.value.size
        });
        isWaitingForDimensions.value = false;
        pendingNodeIds.value.clear();
        initD3Simulation();
      }
    }, 300);

    // 注意：这里不再立即调用 initD3Simulation()
    // 而是等待 updateNodeDimensions 被调用
  }

  /**
   * 初始化 D3 力导向模拟
   */
  function initD3Simulation(): void {
    const session = sessionRef();
    if (!session || nodes.value.length === 0) return;

    // 计算每个节点的层级深度
    const depthMap: Record<string, number> = {};
    if (session.nodes) {
      Object.values(session.nodes).forEach((node) => {
        depthMap[node.id] = calculateNodeDepth(session, node.id);
      });
    }

    // 基于深度预设一个大致的垂直间距，让树有明显的"自上而下"方向
    const levelGap = 280; // 增加层级间距以适应更高的节点（6行文本）

    // 准备 D3 数据
    d3Nodes.value = nodes.value.map((n) => {
      const depth = depthMap[n.id] ?? 0;
      const existingD3Node = simulation?.nodes().find(d => d.id === n.id);
      const measured = measuredDimensions.get(n.id);

      // 估算节点高度：基础高度 + 附件高度 (作为回退)
      const baseHeight = 140; // 基础高度 (6行文本)
      const attachmentHeight = (n.data.attachments?.length || 0) * 160; // 每个附件约 160px (extra-large 模式)
      const estimatedHeight = baseHeight + attachmentHeight;

      // 优先使用：
      // 1. 刚刚测量到的真实尺寸 (measured)
      // 2. 之前 D3 模拟中的尺寸 (existingD3Node)
      // 3. 估算尺寸 (estimatedHeight)
      const finalWidth = measured?.width || existingD3Node?.width || 220;
      const finalHeight = measured?.height || existingD3Node?.height || estimatedHeight;

      return {
        id: n.id,
        depth,
        width: finalWidth,
        height: finalHeight,
        isActiveLeaf: n.data.isActiveLeaf,
        isEnabled: n.data.isEnabled,
        // 初始化时即转换为中心点坐标
        x: n.position.x + finalWidth / 2,
        y: n.position.y + finalHeight / 2,
        ...(!n.position.x && !n.position.y && { y: depth * levelGap })
      };
    });

    // 停止旧的模拟
    if (simulation) {
      simulation.stop();
    }

    // --- 1. 确定性布局计算 (所有模式通用) ---
    const nodeWidth = 220;
    const nodeHorizontalPadding = 120;

    if (!session.nodes) return;
    const rootHierarchy = stratify<ChatMessageNode>()
      .id((d: ChatMessageNode) => d.id)
      .parentId((d: ChatMessageNode) => d.parentId)
      (Object.values(session.nodes));

    const treeLayout = tree<ChatMessageNode>().nodeSize([
      nodeWidth + nodeHorizontalPadding,
      levelGap,
    ]);

    treeLayout(rootHierarchy);

    const calculatedPositions = new Map<string, { x: number; y: number }>();
    rootHierarchy.each((d: HierarchyNode<ChatMessageNode>) => {
      calculatedPositions.set(d.id!, { x: d.x ?? 0, y: d.y ?? 0 });
    });

    // --- 2. 动态链接配置 (所有模式通用) ---
    const childrenCount = calculateDirectChildrenCount(session.nodes);
    d3Links.value = edges.value.map((e) => {
      const sourceNodeId = e.source;
      // 使用源节点的子节点数量来决定线的长度
      const weight = childrenCount.get(sourceNodeId) || 0;
      // 动态计算连线长度，但在不同模式下使用不同的基础值
      const isPhysics = layoutMode.value === 'physics';
      const baseDistance = isPhysics ? 180 : 80;
      const extraDistancePerNode = 30;
      const maxExtraDistance = 420;
      // 两种模式都应用基于子节点数量的额外距离
      const distance =
        baseDistance + Math.min(weight * extraDistancePerNode, maxExtraDistance);

      return {
        source: e.source,
        target: e.target,
        _debug: { strength: isPhysics ? 0.4 : 0.2, distance: Math.round(distance) },
      };
    });

    // --- 3. 创建或更新模拟 ---
    if (!simulation) {
      // 首次创建
      simulation = d3Force.forceSimulation<D3Node, D3Link>();
      logger.info("首次创建 D3 力模拟实例");
    }
    simulation.nodes(d3Nodes.value);


    // --- 4. 根据布局模式配置不同的力 ---

    // 通用力：碰撞力 (所有模式都需要)
    simulation.force("collide", d3Force.forceCollide<D3Node>(d => Math.max(d.width, d.height) / 2 + 40).strength(1));

    // 通用力：链接力 (所有模式都需要，但参数不同)
    simulation.force("link", d3Force.forceLink<D3Node, D3Link>(d3Links.value)
      .id(d => d.id)
      .distance(link => link._debug?.distance ?? 150)
      .strength(link => link._debug?.strength ?? 0.4)
    );

    if (layoutMode.value === 'static') {
      // === Static 模式：纯静态布局，不启动物理引擎 ===
      // 直接应用计算结果到 Vue Flow 节点并停止模拟
      for (const d3Node of d3Nodes.value) {
        const vueNode = nodes.value.find((n) => n.id === d3Node.id);
        const pos = calculatedPositions.get(d3Node.id);
        if (vueNode && pos) {
          vueNode.position.x = pos.x - d3Node.width / 2;
          vueNode.position.y = pos.y - d3Node.height / 2;
          
          // 同时更新 d3Node 坐标，保持同步
          d3Node.x = pos.x;
          d3Node.y = pos.y;
        }
      }

      if (simulation) {
        simulation.stop();
      }
      
      logger.info("静态布局已应用 (Static 模式，无物理引擎)");
      return; // 静态模式不需要配置力，直接返回
    }

    if (layoutMode.value === 'tree') {
      // === Tree 模式：强定位，无电荷力 ===
      simulation
        .alpha(1).restart() // 使用高 alpha 快速定位
        .alphaDecay(0.04)   // 较快的衰减
        .velocityDecay(0.5) // 较高的阻尼
        .force("charge", null) // 禁用电荷力
        .force("x", d3Force.forceX<D3Node>(d => calculatedPositions.get(d.id)?.x ?? d.x ?? 0).strength(0.15))
        .force("y", d3Force.forceY<D3Node>(d => calculatedPositions.get(d.id)?.y ?? d.y ?? 0).strength(0.25));

      // 释放所有节点的固定位置，让它们可以被定位力驱动
      simulation.nodes().forEach(n => {
        n.fx = null;
        n.fy = null;
      });

      logger.info("D3 力模拟已配置 (Tree 模式)");

    } else {
      // === Physics 模式：使用自定义重力，移除Y钉固力 ===
      simulation
        .alpha(1).restart() // 使用高alpha启动，快速展开
        .alphaDecay(0.0228)
        .velocityDecay(0.4)
        .force("charge", d3Force.forceManyBody().strength(-400))
        // 移除Y钉固力
        .force("y", null)
        // [可选]保留一个极弱的X轴中心力，防止整个图左右漂移
        .force("x", d3Force.forceX(0).strength(0.005))
        // ★★★ 添加我们自定义的、真正的重力 ★★★
        .force("gravity", gravityForce(6)); // 0.2 是一个初始值，可以微调

      // 释放非根节点的固定位置
      simulation.nodes().forEach(n => {
        if (n.id !== session.rootNodeId) {
          n.fx = null;
          n.fy = null;
        }
      });
      // 将根节点固定在计算出的位置，作为整个物理系统的锚点
      const rootNode = simulation.nodes().find(n => n.id === session.rootNodeId);
      const rootPos = session.rootNodeId ? calculatedPositions.get(session.rootNodeId) : null;
      if (rootNode && rootPos) {
        rootNode.fx = rootPos.x;
        rootNode.fy = rootPos.y;
      }

      logger.info("D3 力模拟已配置 (Physics 模式)");
    }

    // 监听 tick 事件，直接更新节点位置
    simulation.on("tick", () => {
      if (!simulation) return;
      // 在调试模式下，我们希望看到原始 d3 节点位置的变化，所以触发更新
      if (debugMode.value) {
        d3Nodes.value = [...simulation.nodes()];
      }
      for (const d3Node of simulation.nodes()) {
        const vueNode = nodes.value.find((n) => n.id === d3Node.id);
        if (vueNode) {
          // D3 的坐标是中心点，而 Vue Flow 的 position 是左上角
          // 因此需要减去 d3Node 中存储的宽高的一半来校正
          vueNode.position.x = (d3Node.x || 0) - d3Node.width / 2;
          vueNode.position.y = (d3Node.y || 0) - d3Node.height / 2;
        }
      }
    });

    // 模拟结束后，确保最终位置被应用
    simulation.on("end", () => {
      logger.info("D3 力模拟结束");
    });
  }


  /**
   * 处理节点拖拽开始事件
   */
  function handleNodeDragStart(event: any): void {
    const { node, event: domEvent } = event;
    const nodeId = node.id;

    const dragSubtreeModifier = settings.value.graphViewShortcuts.dragSubtree;
    const isDragSubtree =
      (dragSubtreeModifier === 'shift' && (domEvent?.shiftKey || false)) ||
      (dragSubtreeModifier === 'alt' && (domEvent?.altKey || false)) ||
      (dragSubtreeModifier === 'ctrl' && (domEvent?.ctrlKey || false));

    // 如果按住指定修饰键，则准备拖拽整个子树
    if (isDragSubtree) {
      const session = sessionRef();
      if (session) {
        const nodeManager = useNodeManager();
        const descendants = nodeManager.getAllDescendants(session, nodeId);
        subtreeDragState.isDragging = true;
        subtreeDragState.rootNodeId = nodeId;
        subtreeDragState.descendantIds = new Set(descendants.map((d: ChatMessageNode) => d.id));
        logger.info(`准备拖拽子树，包含 ${subtreeDragState.descendantIds.size} 个子孙节点`, { rootNodeId: nodeId });

        // 记录初始位置，用于手动计算位移
        dragPositionState.lastPosition = { ...node.position };
      }
    }

    logger.debug("节点拖拽开始 (Physics 模式)", { nodeId, isDragSubtree });

    // 激活模拟 (静态模式除外)
    if (simulation && layoutMode.value !== 'static') {
      simulation.alphaTarget(0.3).restart();
    }
  }

  /**
   * 处理节点拖拽中事件
   */
  function handleNodeDrag(event: any): void {
    if (layoutMode.value === 'static') return;
    if (!simulation) return;

    const { node } = event;
    const nodeId = node.id;

    // 保持模拟活跃
    if (simulation.alpha() < 0.1) {
      simulation.alpha(0.3).restart();
    }

    // 关键修正：确保 nodes.value 中的引用是最新的
    // Vue Flow 在拖拽时可能会产生新的节点对象实例，导致 nodes.value 中的旧对象失效
    // 如果 tick 函数操作的是旧对象，视图就不会更新，导致"脱钩"
    const localNodeIndex = nodes.value.findIndex(n => n.id === nodeId);
    if (localNodeIndex !== -1 && nodes.value[localNodeIndex] !== node) {
      // 更新引用，确保 tick 能控制到真正的视图节点
      nodes.value[localNodeIndex] = node;
    }

    // 如果正在拖拽子树
    if (subtreeDragState.isDragging && subtreeDragState.rootNodeId && dragPositionState.lastPosition) {
      // 手动计算位移增量
      const movement = {
        x: node.position.x - dragPositionState.lastPosition.x,
        y: node.position.y - dragPositionState.lastPosition.y,
      };

      const allNodeIds = [subtreeDragState.rootNodeId, ...subtreeDragState.descendantIds];

      simulation.nodes().forEach(d3Node => {
        if (allNodeIds.includes(d3Node.id)) {
          // 如果节点是拖拽的根节点，直接使用它的位置
          if (d3Node.id === nodeId) {
            d3Node.fx = node.position.x + d3Node.width / 2;
            d3Node.fy = node.position.y + d3Node.height / 2;
          } else {
            // 如果是子孙节点，应用相同的位移增量
            d3Node.x = (d3Node.x ?? 0) + movement.x;
            d3Node.y = (d3Node.y ?? 0) + movement.y;
            // 同时固定住它们的位置，防止物理引擎干扰
            d3Node.fx = d3Node.x;
            d3Node.fy = d3Node.y;
          }
        }
      });

      // 更新上一次的位置
      dragPositionState.lastPosition = { ...node.position };
    } else {
      // 只拖拽单个节点
      const d3Node = simulation.nodes().find(n => n.id === nodeId);
      if (d3Node) {
        // Vue Flow 的 position 是左上角，需要转换回 D3 的中心点坐标
        d3Node.fx = node.position.x + d3Node.width / 2;
        d3Node.fy = node.position.y + d3Node.height / 2;
      }
    }
  }

  /**
   * 处理双击事件 - 切换分支
   */
  function handleNodeDoubleClick(event: any): void {
    const nodeId = event.node.id;
    logger.info("双击节点，切换分支", { nodeId });

    try {
      store.switchBranch(nodeId);
    } catch (error) {
      errorHandler.error(error, "切换分支失败");
    }
  }

  /**
   * 处理拖拽结束事件
   */
  function handleNodeDragStop(event: any): void {
    if (layoutMode.value === 'static') return;
    if (!simulation) return;

    const draggedNodeId = event.node.id;
    const session = sessionRef();
    if (!session) return;

    const shouldRebound = layoutMode.value === 'physics';

    // 如果是子树拖拽结束
    if (subtreeDragState.isDragging) {
      // 在 physics 模式下，拖拽结束后节点应该弹回，所以需要解除固定
      if (shouldRebound) {
        const allNodeIds = [subtreeDragState.rootNodeId, ...subtreeDragState.descendantIds];
        simulation.nodes().forEach(d3Node => {
          if (allNodeIds.includes(d3Node.id) && (!session.rootNodeId || d3Node.id !== session.rootNodeId)) {
            d3Node.fx = null;
            d3Node.fy = null;
          }
        });
      }
      // 重置状态
      subtreeDragState.isDragging = false;
      subtreeDragState.rootNodeId = null;
      subtreeDragState.descendantIds.clear();
      dragPositionState.lastPosition = null; // 清理位置记录
      logger.info("子树拖拽结束");
    } else {
      // 单个节点拖拽结束
      const d3Node = simulation.nodes().find(n => n.id === draggedNodeId);
      if (d3Node) {
        // 关键修正：松手瞬间，强制将 D3 节点的物理坐标(x,y)同步到 Vue Flow 的视觉位置
        // 否则 D3 节点可能还在"追赶"鼠标的路上，导致松手后位置突变或脱节
        d3Node.x = event.node.position.x + d3Node.width / 2;
        d3Node.y = event.node.position.y + d3Node.height / 2;

        // 在 physics 模式下，拖拽结束后节点应该弹回，所以需要解除固定
        // 根节点也应该遵循这个规则，以允许其被拖动
        if (shouldRebound) {
          d3Node.fx = null;
          d3Node.fy = null;
        }
      }
    }

    // 降低模拟活跃度
    simulation.alphaTarget(0);
  }

  /**
   * 处理 Vue Flow 的连线事件，用作嫁接/移动交互
   * 核心设计：根据节点的实际父子关系来决定操作类型，而非依赖视图层的连接方向
   */
  /**
   * 核心预检函数，检查连接的有效性
   */
  function checkConnectionValidity(nodeIdToMove: string, newParentId: string): boolean {
    const session = sessionRef();
    if (!session) return false;

    // 规则 1: 不能连接到自身
    if (nodeIdToMove === newParentId) return false;

    if (!session.nodes) return false;
    const nodeToMove = session.nodes[nodeIdToMove];
    const newParent = session.nodes[newParentId];
    if (!nodeToMove || !newParent) return false;

    // 规则 2: 不能操作预设消息节点
    if (nodeIdToMove.startsWith("preset-") || newParentId.startsWith("preset-")) return false;

    // 规则 3: 不能将节点移动到其自身的子孙节点下（防止循环依赖）
    const nodeManager = useNodeManager();
    const descendants = nodeManager.getAllDescendants(session, nodeIdToMove);
    if (descendants.some(d => d.id === newParentId)) return false;

    // 规则 4: 不能移动根节点
    if (nodeIdToMove === session.rootNodeId) return false;

    // 规则 5: 如果目标父节点已经是当前父节点，则为无效操作
    if (nodeToMove.parentId === newParentId) return false;

    return true;
  }

  /**
   * 处理连接开始事件
   */
  function handleConnectionStart({ nodeId }: { event?: MouseEvent, nodeId?: string }): void {
    if (!nodeId) return;

    const graftSubtreeModifier = settings.value.graphViewShortcuts.graftSubtree;
    const isGrafting =
      (graftSubtreeModifier === "shift" && shift.value) ||
      (graftSubtreeModifier === "alt" && alt.value) ||
      (graftSubtreeModifier === "ctrl" && ctrl.value);

    Object.assign(connectionPreviewState, {
      isConnecting: true,
      sourceNodeId: nodeId,
      targetNodeId: null,
      isTargetValid: false,
      isGrafting,
    });
    logger.debug("连接开始", { sourceNodeId: nodeId, isGrafting });
  }

  /**
   * 处理连接结束事件
   */
  function handleConnectionEnd(): void {
    Object.assign(connectionPreviewState, {
      isConnecting: false,
      sourceNodeId: null,
      targetNodeId: null,
      isTargetValid: false,
      isGrafting: false,
    });
    logger.debug("连接结束");
  }

  /**
   * 处理鼠标进入节点事件（连接时）
   */
  function handleNodeMouseEnter(nodeId: string): void {
    if (!connectionPreviewState.isConnecting || !connectionPreviewState.sourceNodeId) return;

    const isValid = checkConnectionValidity(connectionPreviewState.sourceNodeId, nodeId);
    connectionPreviewState.targetNodeId = nodeId;
    connectionPreviewState.isTargetValid = isValid;
    logger.debug("连接时鼠标进入节点", { targetNodeId: nodeId, isValid });
  }

  /**
   * 处理鼠标离开节点事件（连接时）
   */
  function handleNodeMouseLeave(): void {
    if (!connectionPreviewState.isConnecting) return;

    connectionPreviewState.targetNodeId = null;
    connectionPreviewState.isTargetValid = false;
  }

  /**
   * 处理 Vue Flow 的连线事件，用作嫁接/移动交互
   */
  function handleEdgeConnect(connection: any): void {
    const session = sessionRef();
    if (!session) return;

    const sourceId = connection?.source as string | undefined;
    const targetId = connection?.target as string | undefined;
    if (!sourceId || !targetId) {
      logger.warn("连线操作失败：缺少有效的节点 ID", { connection });
      return;
    }

    // Vue Flow 中，source 是起点，target 是终点。
    // 我们的操作语义是：将 target 节点移动到 source 节点下
    const nodeIdToMove = targetId;
    const newParentId = sourceId;

    // 最终验证
    if (!checkConnectionValidity(nodeIdToMove, newParentId)) {
      logger.warn("无效的连接操作被阻止", { nodeIdToMove, newParentId });
      return;
    }

    const isGraftSubtree = connectionPreviewState.isGrafting;

    try {
      if (isGraftSubtree) {
        logger.info("执行子树嫁接", { nodeIdToMove, newParentId });
        store.graftBranch(nodeIdToMove, newParentId);
      } else {
        logger.info("执行单点移动", { nodeIdToMove, newParentId });
        store.moveNode(nodeIdToMove, newParentId);
      }
    } catch (error) {
      errorHandler.error(error, "连线操作失败", {
        context: { nodeIdToMove, newParentId, isGraftSubtree },
      });
    }
  }

  /**
   * 处理右键菜单
   */
  function handleNodeContextMenu(event: MouseEvent, nodeId: string): void {
    event.preventDefault();

    const session = sessionRef();
    if (!session || !session.nodes) return;

    const node = session.nodes[nodeId];
    if (!node) return;

    const items: MenuItem[] = [];

    if (node.id !== session.activeLeafId) {
      items.push({
        label: "设为当前分支",
        icon: "el-icon-position",
        action: () => {
          logger.info("切换到分支", { nodeId: node.id });
          store.switchBranch(node.id);
        },
      });
    }

    items.push({
      label: node.isEnabled !== false ? "禁用此节点" : "启用此节点",
      icon: node.isEnabled !== false ? "el-icon-circle-close" : "el-icon-circle-check",
      action: () => {
        logger.info("切换节点启用状态", { nodeId: node.id });
        store.toggleNodeEnabled(node.id);
      },
    });

    if (node.id !== session.rootNodeId) {
      items.push({
        label: "剪掉这个分支",
        icon: "el-icon-delete",
        danger: true,
        action: () => {
          logger.info("删除分支", { nodeId: node.id });
          store.deleteMessage(node.id);
        },
      });
    }

    contextMenuState.value = {
      visible: true,
      x: event.clientX,
      y: event.clientY,
      items,
    };
  }

  /**
   * 更新 D3 模拟中节点的尺寸信息
   */
  function updateNodeDimensions(dimensions: Map<string, { width: number; height: number }>) {
    // 1. 始终更新真实尺寸缓存
    for (const [id, dim] of dimensions) {
      measuredDimensions.set(id, dim);
    }

    // 2. 如果处于等待初始布局状态
    if (isWaitingForDimensions.value) {
      // 从等待列表中移除已更新尺寸的节点
      for (const id of dimensions.keys()) {
        pendingNodeIds.value.delete(id);
      }

      // 如果所有节点都已就位（或者只剩很少的几个，避免无限等待），开始布局
      if (pendingNodeIds.value.size === 0) {
        logger.info("所有节点尺寸已就位，开始初始布局");
        isWaitingForDimensions.value = false;
        if (layoutTimeoutId) {
          clearTimeout(layoutTimeoutId);
          layoutTimeoutId = null;
        }
        initD3Simulation();
      }
      return;
    }

    // 3. 如果是常规运行时的尺寸变化（例如流式生成导致高度变化）
    if (!simulation) return;

    let needsRestart = false;
    simulation.nodes().forEach(d3Node => {
      const dim = dimensions.get(d3Node.id);
      if (dim && (d3Node.width !== dim.width || d3Node.height !== dim.height)) {
        d3Node.width = dim.width;
        d3Node.height = dim.height;
        needsRestart = true;
      }
    });

    if (needsRestart) {
      // logger.debug("节点尺寸变化，重新加热模拟以调整布局");
      simulation.alpha(0.3).restart(); // 重新加热并重启模拟
    }
  }

  /**
   * 处理节点复制事件
   */
  function handleNodeCopy(nodeId: string): void {
    const session = sessionRef();
    if (!session || !session.nodes) return;

    const node = session.nodes[nodeId];
    if (!node) return;

    navigator.clipboard
      .writeText(node.content)
      .then(() => {
        logger.info("节点内容已复制", { nodeId });
        customMessage.success("节点内容已复制");
      })
      .catch((error) => {
        errorHandler.error(error, "复制失败");
      });
  }

  /**
   * 处理节点启用/禁用切换
   */
  function handleNodeToggleEnabled(nodeId: string): void {
    logger.info("切换节点启用状态", { nodeId });
    store.toggleNodeEnabled(nodeId);
  }

  /**
   * 处理节点删除事件
   */
  function handleNodeDelete(nodeId: string): void {
    const session = sessionRef();
    if (!session || !session.nodes) return;

    const node = session.nodes[nodeId];
    if (!node) return;

    // 根节点不允许删除
    if (node.id === session.rootNodeId) {
      logger.warn("根节点不允许删除");
      return;
    }

    logger.info("删除节点", { nodeId });
    store.deleteMessage(nodeId);
  }

  /**
   * 处理重新生成事件
   */
  function handleNodeRegenerate(nodeId: string, options?: { modelId?: string; profileId?: string }): void {
    const session = sessionRef();
    if (!session || !session.nodes) return;

    const node = session.nodes[nodeId];
    if (!node) return;

    logger.info("重新生成", { nodeId, role: node.role, options });
    store.regenerateFromNode(nodeId, options);
  }
  /**
   * 处理创建分支事件
   */
  function handleNodeCreateBranch(nodeId: string): void {
    const session = sessionRef();
    if (!session || !session.nodes) return;

    const node = session.nodes[nodeId];
    if (!node) return;

    logger.info("创建分支", { nodeId, role: node.role });
    store.createBranch(nodeId);
  }

  /**
   * 处理查看详情事件
   */
  function handleNodeViewDetail(nodeId: string, event: MouseEvent): void {
    logger.info("查看节点详情", { nodeId });

    // 获取被点击的按钮元素（事件目标）
    const targetElement = event.currentTarget as HTMLElement;

    // 计算弹窗的初始位置，确保在视口内
    const popupWidth = 400; // 对应 GraphNodeDetailPopup 的 min-width
    const popupMaxHeight = window.innerHeight * 0.7; // 弹窗最大高度为视口的70%（对应组件的 max-height: 70vh）
    const padding = 20; // 距离视口边缘的最小距离

    // 获取视口尺寸
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // 计算初始位置（鼠标右侧、稍微上方）
    let x = event.clientX + 20;
    let y = event.clientY - 50;

    // 检查右边界
    if (x + popupWidth + padding > viewportWidth) {
      // 如果右侧放不下，尝试放在鼠标左侧
      x = event.clientX - popupWidth - 20;
      // 如果左侧也放不下，贴近右边界
      if (x < padding) {
        x = viewportWidth - popupWidth - padding;
      }
    }

    // 检查左边界
    if (x < padding) {
      x = padding;
    }

    // 检查下边界（使用最大高度计算，确保即使内容很长也不会超出）
    if (y + popupMaxHeight + padding > viewportHeight) {
      // 如果下方放不下，尝试上移
      y = viewportHeight - popupMaxHeight - padding - 40;
    }

    // 检查上边界
    if (y < padding) {
      y = padding;
    }

    // 更新详情悬浮窗状态
    detailPopupState.value = {
      visible: true,
      nodeId,
      targetElement,
      initialPosition: { x, y },
    };
  }

  /**
   * 关闭详情悬浮窗
   */
  function closeDetailPopup(): void {
    detailPopupState.value.visible = false;
  }

  /**
   * 切换布局模式
   */
  function switchLayoutMode(mode: LayoutMode): void {
    if (layoutMode.value === mode) return;

    logger.info(`切换布局模式: ${layoutMode.value} -> ${mode}`);
    layoutMode.value = mode;

    // 重新初始化模拟以应用新的布局模式
    initD3Simulation();
  }

  /**
   * 切换调试模式
   */
  function toggleDebugMode(): void {
    debugMode.value = !debugMode.value;
    logger.info(`切换调试模式: ${debugMode.value ? 'ON' : 'OFF'}`);
    // 如果开启调试模式，可能需要强制更新一下 d3 节点数据
    if (debugMode.value && simulation) {
      d3Nodes.value = [...simulation.nodes()];
    }
  }

  /**
   * 重置布局
   * 强制清除所有位置并重新计算布局
   */
  function resetLayout(): void {
    logger.info("执行彻底的布局重置...");
    // 强制清除所有现有位置并重新构建图表，然后启动模拟
    updateChart(true);
  }
  /**
   * 清理资源
   */
  function destroy(): void {
    if (simulation) {
      simulation.stop();
      simulation = null;
    }
    observer.disconnect();
    logger.info("Vue Flow 树图已销毁");
  }

  return {
    nodes,
    edges,
    layoutMode,
    debugMode,
    d3Nodes,
    d3Links,
    detailPopupState,
    connectionPreviewState,
    handleNodeDoubleClick,
    handleNodeDragStart,
    handleNodeDrag,
    handleNodeDragStop,
    handleEdgeConnect,
    handleConnectionStart,
    handleConnectionEnd,
    handleNodeMouseEnter,
    handleNodeMouseLeave,
    handleNodeContextMenu,
    handleNodeCopy,
    handleNodeToggleEnabled,
    handleNodeDelete,
    handleNodeRegenerate,
    handleNodeCreateBranch,
    handleNodeViewDetail,
    closeDetailPopup,
    updateChart,
    updateNodeDimensions, // 暴露给 Vue 组件使用
    switchLayoutMode, // 暴露布局模式切换函数
    resetLayout, // 暴露重置布局函数
    toggleDebugMode,
    toggleCompressionExpanded,
    destroy,
  };
}