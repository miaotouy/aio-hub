import { ref, reactive, type Ref } from "vue";
import { useMagicKeys, onKeyStroke } from '@vueuse/core';
import { useChatSettings } from "./useChatSettings";
import * as d3Force from "d3-force";
import { stratify, tree, type HierarchyNode } from "d3-hierarchy";
import type { ChatSession, ChatMessageNode } from "../types";
import { BranchNavigator } from "../utils/BranchNavigator";
import { useLlmChatStore } from "../store";
import { useAgentStore } from "../agentStore";
import { useUserProfileStore } from "../userProfileStore";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useModelMetadata } from "@/composables/useModelMetadata";
import { useNodeManager } from "./useNodeManager";
import { createModuleLogger } from "@/utils/logger";
import type { MenuItem } from "../components/conversation-tree-graph/ContextMenu.vue";

const logger = createModuleLogger("llm-chat/composables/useFlowTreeGraph");

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
    role: 'user' | 'assistant' | 'system';
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
    _node: ChatMessageNode;
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
export type LayoutMode = 'tree' | 'physics';

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
  sessionRef: () => ChatSession | null,
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
    * 计算每个节点的直接子节点数
    */
  function calculateDirectChildrenCount(nodes: Record<string, ChatMessageNode>): Map<string, number> {
    const counts = new Map<string, number>();

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

  // 注册撤销快捷键 (Ctrl+Z / Cmd+Z)
  onKeyStroke(
    (event) => (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z',
    (event) => {
      if (store.canUndo) {
        event.preventDefault();
        store.undo();
      }
    },
    { target }
  );

  // 注册重做快捷键 (Ctrl+Shift+Z, Cmd+Shift+Z, Ctrl+Y, Cmd+Y)
  onKeyStroke(
    (event) =>
      ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'z') ||
      ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'y'),
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
  function calculateNodeDepth(session: ChatSession, nodeId: string): number {
    let depth = 0;
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
  function getNodeColor(session: ChatSession, node: ChatMessageNode): {
    background: string;
    border: string;
  } {
    const isOnActivePath = BranchNavigator.isNodeInActivePath(session, node.id);
    const isActiveLeaf = node.id === session.activeLeafId;
    const isEnabled = node.isEnabled !== false;

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
      const name = node.metadata?.userProfileName || "你";

      let target;
      if (node.metadata?.userProfileIcon && node.metadata?.userProfileId) {
        target = {
          id: node.metadata.userProfileId,
          icon: node.metadata.userProfileIcon,
          iconMode: node.metadata.userProfileIconMode,
        };
      } else {
        const userProfileId = node.metadata?.userProfileId;
        target = userProfileId
          ? userProfileStore.getProfileById(userProfileId)
          : userProfileStore.globalProfile;
      }

      let icon = target?.icon?.trim() || "👤";

      if (icon && icon !== "👤") {
        const isBuiltin = target?.iconMode === "builtin";
        const isLegacyBuiltin = !target?.iconMode && isLikelyFilename(icon);

        if ((isBuiltin || isLegacyBuiltin) && target?.id) {
          icon = `appdata://llm-chat/user-profiles/${target.id}/${icon}`;
        }
      }

      return { icon, name };
    } else if (node.role === "assistant") {
      const name = node.metadata?.agentName || "助手";

      let target;
      if (node.metadata?.agentIcon && node.metadata?.agentId) {
        target = {
          id: node.metadata.agentId,
          icon: node.metadata.agentIcon,
          iconMode: node.metadata.agentIconMode,
        };
      } else {
        const agentId = node.metadata?.agentId;
        target = agentId ? agentStore.getAgentById(agentId) : null;
      }

      let icon = target?.icon?.trim() || "🤖";

      if (icon && icon !== "🤖") {
        const isBuiltin = target?.iconMode === "builtin";
        const isLegacyBuiltin = !target?.iconMode && isLikelyFilename(icon);

        if ((isBuiltin || isLegacyBuiltin) && target?.id) {
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
      return;
    }

    // 记录旧节点位置，用于在更新时平滑过渡，避免整个树每次都从 (0, 0) 重新收缩成一团
    const previousNodesMap = new Map<string, FlowNode>();
    // 仅当不强制重置时才记录旧位置
    if (!forceResetPosition) {
      for (const n of nodes.value) {
        previousNodesMap.set(n.id, n);
      }
    }

    // 转换节点数据为 Vue Flow 格式
    const flowNodes: FlowNode[] = Object.values(session.nodes).map((node) => {
      const colors = getNodeColor(session, node);
      const isActiveLeaf = node.id === session.activeLeafId;
      const isEnabled = node.isEnabled !== false;
      const roleDisplay = getRoleDisplay(node);
      const contentPreview = truncateText(node.content, 150);
      const subtitleInfo = getSubtitleInfo(node);

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

      const previousNode = previousNodesMap.get(node.id);
      let initialPosition;

      if (previousNode) {
        // 已有节点：继承位置
        initialPosition = { ...previousNode.position };
      } else if (node.parentId && !forceResetPosition) {
        // 新节点且有父节点：出生在父节点下方 (仅在非强制重置时)
        const parentNode = previousNodesMap.get(node.parentId);
        if (parentNode) {
          initialPosition = {
            x: parentNode.position.x,
            y: parentNode.position.y + 240, // 在父节点下方偏移一段距离
          };
        } else {
          // 如果父节点也找不到（理论上不应该），则回退
          initialPosition = { x: 0, y: 0 };
        }
      } else {
        // 新节点、根节点或强制重置：使用 (0, 0)
        initialPosition = { x: 0, y: 0 };
      }

      return {
        id: node.id,
        type: 'custom',
        position: initialPosition,
        data: {
          name: roleDisplay.name,
          avatar: roleDisplay.icon,
          contentPreview,
          isActiveLeaf,
          isEnabled,
          timestamp: node.timestamp,
          role: node.role,
          status: node.status,
          errorMessage: node.metadata?.error,
          subtitleInfo,
          colors,
          tokens,
          _node: node,
        },
      };
    });

    // 转换边数据为 Vue Flow 格式
    const flowEdges: FlowEdge[] = [];
    Object.values(session.nodes).forEach((node) => {
      if (node.parentId) {
        const isOnActivePath =
          BranchNavigator.isNodeInActivePath(session, node.parentId) &&
          BranchNavigator.isNodeInActivePath(session, node.id);

        flowEdges.push({
          id: `${node.parentId}-${node.id}`,
          source: node.parentId,
          target: node.id,
          animated: isOnActivePath,
          style: {
            stroke: isOnActivePath ? palette.edge.active : palette.edge.inactive,
            strokeWidth: isOnActivePath ? 2 : 1,
          },
        });
      }
    });

    logger.info(`准备更新图表，转换得到 ${flowNodes.length} 个节点和 ${flowEdges.length} 条边。`);
    nodes.value = flowNodes;
    edges.value = flowEdges;

    // 启动 D3 力模拟进行布局
    initD3Simulation();
  }

  /**
   * 初始化 D3 力导向模拟
   */
  function initD3Simulation(): void {
    const session = sessionRef();
    if (!session || nodes.value.length === 0) return;

    // 计算每个节点的层级深度
    const depthMap: Record<string, number> = {};
    Object.values(session.nodes).forEach((node) => {
      depthMap[node.id] = calculateNodeDepth(session, node.id);
    });

    // 基于深度预设一个大致的垂直间距，让树有明显的"自上而下"方向
    const levelGap = 280; // 增加层级间距以适应更高的节点（6行文本）

    // 准备 D3 数据
    d3Nodes.value = nodes.value.map((n) => {
      const depth = depthMap[n.id] ?? 0;
      const existingD3Node = simulation?.nodes().find(d => d.id === n.id);
      return {
        id: n.id,
        depth,
        width: existingD3Node?.width || 220, // 初始预估宽度
        height: existingD3Node?.height || 140, // 增加初始预估高度以适应6行文本
        isActiveLeaf: n.data.isActiveLeaf,
        isEnabled: n.data.isEnabled,
        // 初始化时即转换为中心点坐标
        x: n.position.x + (existingD3Node?.width || 220) / 2,
        y: n.position.y + (existingD3Node?.height || 140) / 2,
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
      const baseDistance = isPhysics ? 180 : 50; // tree 模式基础距离更短
      const extraDistancePerNode = 80;
      const maxExtraDistance = 320;
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
        .force("gravity", gravityForce(10)); // 0.2 是一个初始值，可以微调

      // 释放非根节点的固定位置
      simulation.nodes().forEach(n => {
        if (n.id !== session.rootNodeId) {
          n.fx = null;
          n.fy = null;
        }
      });
      // 将根节点固定在计算出的位置，作为整个物理系统的锚点
      const rootNode = simulation.nodes().find(n => n.id === session.rootNodeId);
      const rootPos = calculatedPositions.get(session.rootNodeId);
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

    // 激活模拟
    if (simulation) {
      simulation.alphaTarget(0.3).restart();
    }
  }

  /**
   * 处理节点拖拽中事件
   */
  function handleNodeDrag(event: any): void {
    if (!simulation) return;

    const { node } = event;
    const nodeId = node.id;

    // 保持模拟活跃
    if (simulation.alpha() < 0.1) {
      simulation.alpha(0.3).restart();
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
      logger.error("切换分支失败", error);
    }
  }

  /**
   * 处理拖拽结束事件
   */
  function handleNodeDragStop(event: any): void {
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
          if (allNodeIds.includes(d3Node.id) && d3Node.id !== session.rootNodeId) {
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
      // 在 physics 模式下，拖拽结束后节点应该弹回，所以需要解除固定
      // 根节点也应该遵循这个规则，以允许其被拖动
      if (shouldRebound) {
        const d3Node = simulation.nodes().find(n => n.id === draggedNodeId);
        if (d3Node) {
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
      logger.error("连线操作失败", error, { nodeIdToMove, newParentId, isGraftSubtree });
    }
  }

  /**
   * 处理右键菜单
   */
  function handleNodeContextMenu(event: MouseEvent, nodeId: string): void {
    event.preventDefault();

    const session = sessionRef();
    if (!session) return;

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
      logger.info("节点尺寸变化，重新加热模拟以调整布局");
      simulation.alpha(0.3).restart(); // 重新加热并重启模拟
    }
  }

  /**
   * 处理节点复制事件
   */
  function handleNodeCopy(nodeId: string): void {
    const session = sessionRef();
    if (!session) return;

    const node = session.nodes[nodeId];
    if (!node) return;

    navigator.clipboard.writeText(node.content).then(() => {
      logger.info("节点内容已复制", { nodeId });
    }).catch(error => {
      logger.error("复制失败", error);
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
    if (!session) return;

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
    handleNodeViewDetail,
    closeDetailPopup,
    updateChart,
    updateNodeDimensions, // 暴露给 Vue 组件使用
    switchLayoutMode, // 暴露布局模式切换函数
    resetLayout, // 暴露重置布局函数
    toggleDebugMode,
    destroy,
  };
}