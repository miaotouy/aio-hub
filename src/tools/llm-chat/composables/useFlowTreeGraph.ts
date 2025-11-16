import { ref, reactive, type Ref } from "vue";
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
 * Vue Flow 树图 Composable
 * 使用 D3 力导向布局 + Vue Flow 渲染
 */
export function useFlowTreeGraph(
  sessionRef: () => ChatSession | null,
  contextMenuState: Ref<ContextMenuState>
) {
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

  /**
   * 计算每个节点的后代总数
   */
  function calculateDescendantCounts(nodes: Record<string, ChatMessageNode>): Map<string, number> {
    const childrenMap = new Map<string, string[]>();
    Object.values(nodes).forEach(node => {
      if (node.parentId) {
        if (!childrenMap.has(node.parentId)) {
          childrenMap.set(node.parentId, []);
        }
        childrenMap.get(node.parentId)!.push(node.id);
      }
    });

    const counts = new Map<string, number>();

    // 使用缓存的递归函数计算后代数量
    function countDescendants(nodeId: string): number {
      if (counts.has(nodeId)) {
        return counts.get(nodeId)!;
      }

      const children = childrenMap.get(nodeId) || [];
      let count = children.length; // 直接子节点
      for (const childId of children) {
        count += countDescendants(childId); // 递归累加
      }

      counts.set(nodeId, count);
      return count;
    }

    // 确保所有节点都被计算
    for (const nodeId of Object.keys(nodes)) {
      if (!counts.has(nodeId)) {
        countDescendants(nodeId);
      }
    }

    // 再次遍历，确保没有子节点的节点也被设置为0
    for (const nodeId of Object.keys(nodes)) {
      if (!counts.has(nodeId)) {
        counts.set(nodeId, 0);
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
   */
  function updateChart(): void {
    const session = sessionRef();
    if (!session) {
      nodes.value = [];
      edges.value = [];
      return;
    }

    // 记录旧节点位置，用于在更新时平滑过渡，避免整个树每次都从 (0, 0) 重新收缩成一团
    const previousNodesMap = new Map<string, FlowNode>();
    for (const n of nodes.value) {
      previousNodesMap.set(n.id, n);
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
      // 如果存在旧节点，则继承其位置，否则使用(0,0)作为初始位置，后续由D3计算
      const initialPosition = previousNode
        ? { ...previousNode.position }
        : { x: 0, y: 0 };

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

    // 将根节点钉在顶部中心，作为"锚点"
    const rootNode = d3Nodes.value.find((n) => n.id === session.rootNodeId);
    if (rootNode) {
      rootNode.fx = 0;
      rootNode.fy = 0;
    }

    // 停止旧的模拟
    if (simulation) {
      simulation.stop();
    }

    // 在这里，我们可以为 d3Links 附加调试信息
    if (layoutMode.value === 'tree') {
      d3Links.value = edges.value.map((e) => ({
        source: e.source,
        target: e.target,
        _debug: { strength: 0.2, distance: 50 },
      }));
    } else {
      const descendantCounts = calculateDescendantCounts(session.nodes);
      d3Links.value = edges.value.map((e) => {
        const targetNodeId = e.target;
        const weight = descendantCounts.get(targetNodeId) || 0;
        const baseDistance = 180;
        const extraDistancePerNode = 80;
        const maxExtraDistance = 320;
        const distance = baseDistance + Math.min(weight * extraDistancePerNode, maxExtraDistance);

        return {
          source: e.source,
          target: e.target,
          _debug: { strength: 0.4, distance: Math.round(distance) },
        };
      });
    }

    // 根据布局模式选择不同的力配置
    if (layoutMode.value === 'tree') {
      // === Tree 模式：使用 d3-hierarchy 进行确定性树布局 ===
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

      // 将计算好的位置直接应用到 d3Nodes，最小化物理模拟的工作量
      d3Nodes.value.forEach(n => {
        const pos = calculatedPositions.get(n.id);
        if (pos) {
          // 直接设置到目标位置，让物理模拟只处理碰撞避免
          n.x = pos.x;
          n.y = pos.y;
        }
      });

      // 创建优化的椭圆碰撞力，使用更高效的算法
      const ellipticalCollideForce = () => {
        const paddingX = 150; // X 方向额外间距
        const paddingY = 40;  // Y 方向额外间距
        let nodes: D3Node[];

        function force(alpha: number) {
          // 限制检测范围以优化性能（从 O(n²) 降到接近 O(n)）
          for (let i = 0; i < nodes.length; i++) {
            const nodeA = nodes[i];
            // 只检测附近的节点（基于深度相近）
            for (let j = i + 1; j < nodes.length && j < i + 20; j++) {
              const nodeB = nodes[j];
              
              // 快速跳过深度差异大的节点（它们不太可能碰撞）
              if (Math.abs(nodeA.depth - nodeB.depth) > 1) continue;

              const dx = (nodeB.x ?? 0) - (nodeA.x ?? 0);
              const dy = (nodeB.y ?? 0) - (nodeA.y ?? 0);

              // 椭圆碰撞检测
              const radiusX = (nodeA.width + nodeB.width) / 2 + paddingX;
              const radiusY = (nodeA.height + nodeB.height) / 2 + paddingY;

              const normalizedDist = Math.sqrt((dx * dx) / (radiusX * radiusX) + (dy * dy) / (radiusY * radiusY));

              if (normalizedDist < 1 && normalizedDist > 0.01) {
                // 使用更强的推开力以快速解决碰撞
                const pushStrength = (1 - normalizedDist) * alpha * 2.0;
                const pushX = (dx / normalizedDist) * pushStrength;
                const pushY = (dy / normalizedDist) * pushStrength;

                nodeB.vx = (nodeB.vx ?? 0) + pushX;
                nodeB.vy = (nodeB.vy ?? 0) + pushY;
                nodeA.vx = (nodeA.vx ?? 0) - pushX;
                nodeA.vy = (nodeA.vy ?? 0) - pushY;
              }
            }
          }
        }

        force.initialize = (_: D3Node[]) => { nodes = _; };
        return force;
      };

      simulation = d3Force
        .forceSimulation(d3Nodes.value)
        // 加速收敛：更激进的 alpha 衰减
        .alphaDecay(0.05) // 默认 0.0228，提高到 0.05 加快收敛
        .alphaMin(0.01)   // 默认 0.001，提高到 0.01 更快停止
        .velocityDecay(0.6) // 默认 0.4，提高阻尼加快稳定
        // 保持链接关系，但降低强度（因为初始位置已经正确）
        .force("link", d3Force.forceLink<D3Node, D3Link>(d3Links.value)
          .id(d => d.id)
          .distance(50)
          .strength(0.1) // 降低链接强度，减少震荡
        )
        // 使用更高效的圆形碰撞作为第一道防线
        .force("collide", d3Force.forceCollide<D3Node>(d => Math.max(d.width, d.height) / 2 + 20)
          .strength(0.9) // 提高强度以快速解决碰撞
          .iterations(2) // 增加迭代次数提高精度
        )
        // 添加优化的椭圆碰撞力
        .force("collideElliptical", ellipticalCollideForce())
        // 降低位置约束力的强度（因为初始位置已经正确）
        .force("x", d3Force.forceX<D3Node>(d => calculatedPositions.get(d.id)?.x ?? d.x ?? 0)
          .strength(0.15) // 大幅降低，只用于微调
        )
        .force("y", d3Force.forceY<D3Node>(d => calculatedPositions.get(d.id)?.y ?? d.y ?? 0)
          .strength(0.2) // 大幅降低，只用于微调
        );

      logger.info("D3 力模拟已初始化 (Tree 模式)");
    } else {
      // === Physics 模式：物理悬挂布局 (已根据大节点尺寸优化) ===
      simulation = d3Force
        .forceSimulation(d3Nodes.value)
        // 1. 连接力: 像有弹性的绳索，定义基础悬挂长度
        .force("link", d3Force.forceLink<D3Node, D3Link>(d3Links.value)
          .id(d => d.id)
          .distance(250) // 为大节点设置一个更合适的基础距离
          .strength(0.5) // 保持较高的强度
        )
        // 2. 排斥力/电荷力: 核心力量，将大节点互相推开
        .force("charge", d3Force.forceManyBody().strength(-1200)) // 大幅增强排斥力以适应大尺寸
        // 3. Y轴力 (重力): 提供一个温和的、持续向下的引导力
        .force("gravity", d3Force.forceY(0).strength(0.03))
        // 4. X轴力 (水平居中): 弱力，防止整个树结构在水平方向上漂移
        .force("x", d3Force.forceX(0).strength(0.02))
        // 5. 碰撞力: 最后的防线，基于节点实际尺寸防止重叠
        .force("collide", d3Force.forceCollide<D3Node>(d => {
          // 使用节点的长边作为半径，并增加更多安全间距
          return Math.max(d.width, d.height) / 2 + 40;
        }).strength(1)); // 使用高强度确保不重叠

      logger.info("D3 力模拟已初始化 (Physics 模式，带动态绳长)");
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
    const nodeId = event.node.id;
    const isShiftPressed = event.event?.shiftKey || false;

    // 如果按住 Shift，则准备拖拽整个子树
    if (isShiftPressed) {
      const session = sessionRef();
      if (session) {
        const nodeManager = useNodeManager();
        const descendants = nodeManager.getAllDescendants(session, nodeId);
        subtreeDragState.isDragging = true;
        subtreeDragState.rootNodeId = nodeId;
        subtreeDragState.descendantIds = new Set(descendants.map((d: ChatMessageNode) => d.id));
        logger.info(`准备拖拽子树，包含 ${subtreeDragState.descendantIds.size} 个子孙节点`, { rootNodeId: nodeId });
      }
    }

    logger.debug("节点拖拽开始 (Physics 模式)", { nodeId, isShiftPressed });

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
  
    const { node, movement } = event;
    const nodeId = node.id;
  
    // 保持模拟活跃
    if (simulation.alpha() < 0.1) {
      simulation.alpha(0.3).restart();
    }
  
    // 如果正在拖拽子树
    if (subtreeDragState.isDragging && subtreeDragState.rootNodeId) {
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

    // 如果是子树拖拽结束
    if (subtreeDragState.isDragging) {
      const allNodeIds = [subtreeDragState.rootNodeId, ...subtreeDragState.descendantIds];
      simulation.nodes().forEach(d3Node => {
        if (allNodeIds.includes(d3Node.id) && d3Node.id !== session.rootNodeId) {
          d3Node.fx = null;
          d3Node.fy = null;
        }
      });
      // 重置状态
      subtreeDragState.isDragging = false;
      subtreeDragState.rootNodeId = null;
      subtreeDragState.descendantIds.clear();
      logger.info("子树拖拽结束");
    } else {
      // 单个节点拖拽结束
      if (draggedNodeId !== session.rootNodeId) {
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
  function handleEdgeConnect(connection: any): void {
    const session = sessionRef();
    if (!session) return;

    const sourceId = connection?.source as string | undefined;
    const targetId = connection?.target as string | undefined;
    const event = connection?.event as MouseEvent | undefined;

    if (!sourceId || !targetId) {
      logger.warn("连线操作失败：缺少有效的节点 ID", { connection });
      return;
    }

    // 预设消息不参与嫁接
    if (sourceId.startsWith("preset-") || targetId.startsWith("preset-")) {
      logger.debug("忽略预设消息的连线操作");
      return;
    }

    // 不允许自己连接自己
    if (sourceId === targetId) {
      logger.debug("忽略自我连接");
      return;
    }

    const isShiftPressed = event?.shiftKey || false;
    const nodeManager = useNodeManager();

    // 使用节点管理器判断实际的父子关系
    const relationship = nodeManager.getNodeRelationship(session, sourceId, targetId);

    logger.info("触发连线操作", {
      sourceId,
      targetId,
      relationship,
      isShiftPressed,
    });

    // 根据实际关系来决定操作
    // 注意：Vue Flow 的连线是单向的，从 source 指向 target
    // 在 Vue Flow 中：
    // - source: 连线的起点（从哪个节点的 source handle 拖出）
    // - target: 连线的终点（拖到哪个节点的 target handle）
    // 语义：target 节点应该成为 source 节点的子节点
    const nodeIdToMove = targetId;  // target 是要移动的节点
    const newParentId = sourceId;   // source 是新的父节点

    try {
      if (isShiftPressed) {
        // 按住 Shift：嫁接整个子树
        logger.info("执行子树嫁接", {
          nodeId: nodeIdToMove,
          newParentId,
          relationship,
          note: "target 节点成为 source 节点的子节点"
        });
        store.graftBranch(nodeIdToMove, newParentId);
      } else {
        // 未按 Shift：只移动单个节点
        logger.info("执行单点移动", {
          nodeId: nodeIdToMove,
          newParentId,
          relationship,
          note: "target 节点成为 source 节点的子节点"
        });
        store.moveNode(nodeIdToMove, newParentId);
      }
    } catch (error) {
      logger.error("连线操作失败", error, {
        sourceId,
        targetId,
        relationship,
        isShiftPressed,
      });
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
    handleNodeDoubleClick,
    handleNodeDragStart,
    handleNodeDrag,
    handleNodeDragStop,
    handleEdgeConnect,
    handleNodeContextMenu,
    handleNodeCopy,
    handleNodeToggleEnabled,
    handleNodeDelete,
    handleNodeViewDetail,
    closeDetailPopup,
    updateChart,
    updateNodeDimensions, // 暴露给 Vue 组件使用
    switchLayoutMode, // 暴露布局模式切换函数
    toggleDebugMode,
    destroy,
  };
}