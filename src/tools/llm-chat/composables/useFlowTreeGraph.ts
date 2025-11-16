import { ref, reactive, type Ref } from "vue";
import * as d3 from "d3-force";
import type { ChatSession, ChatMessageNode } from "../types";
import { BranchNavigator } from "../utils/BranchNavigator";
import { useLlmChatStore } from "../store";
import { useAgentStore } from "../agentStore";
import { useUserProfileStore } from "../userProfileStore";
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
    colors: {
      background: string;
      border: string;
    };
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
 */
interface D3Node extends d3.SimulationNodeDatum {
  id: string;
}

/**
 * D3 力导向边类型
 */
interface D3Link extends d3.SimulationLinkDatum<D3Node> {
  source: string | D3Node;
  target: string | D3Node;
}

/**
 * Vue Flow 树图 Composable
 * 使用 D3 力导向布局 + Vue Flow 渲染
 */
export function useFlowTreeGraph(
  sessionRef: () => ChatSession | null,
  contextMenuState: Ref<ContextMenuState>
) {
  const store = useLlmChatStore();

  // Vue Flow 的节点和边数据（响应式）
  const nodes = ref<FlowNode[]>([]);
  const edges = ref<FlowEdge[]>([]);

  // D3 力模拟实例
  let simulation: d3.Simulation<D3Node, D3Link> | null = null;

  /**
   * 截断文本用于显示
   */
  function truncateText(text: string, maxLength: number = 30): string {
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

    // 转换节点数据为 Vue Flow 格式
    const flowNodes: FlowNode[] = Object.values(session.nodes).map((node) => {
      const colors = getNodeColor(session, node);
      const isActiveLeaf = node.id === session.activeLeafId;
      const isEnabled = node.isEnabled !== false;
      const roleDisplay = getRoleDisplay(node);
      const contentPreview = truncateText(node.content, 30);

      return {
        id: node.id,
        type: 'custom',
        position: { x: 0, y: 0 }, // 初始位置，将由 D3 计算
        data: {
          name: roleDisplay.name,
          avatar: roleDisplay.icon,
          contentPreview,
          isActiveLeaf,
          isEnabled,
          colors,
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
    if (nodes.value.length === 0) return;

    // 准备 D3 数据
    const d3Nodes: D3Node[] = nodes.value.map(n => ({
      id: n.id,
      x: n.position.x || 0,
      y: n.position.y || 0,
    }));

    const d3Links: D3Link[] = edges.value.map(e => ({
      source: e.source,
      target: e.target,
    }));

    // 停止旧的模拟
    if (simulation) {
      simulation.stop();
    }

    // 创建新的力模拟
    simulation = d3.forceSimulation(d3Nodes)
      .force("link", d3.forceLink<D3Node, D3Link>(d3Links)
        .id(d => d.id)
        .distance(120)
        .strength(0.5)
      )
      .force("charge", d3.forceManyBody<D3Node>()
        .strength(-800) // 增加排斥力
      )
      .force("collide", d3.forceCollide<D3Node>()
        .radius(100) // 增加碰撞半径
        .strength(0.8)
      )
      .force("center", d3.forceCenter(400, 300))
      .force("y", d3.forceY(300).strength(0.1));
    // 监听 tick 事件，直接更新节点位置以提高性能
    simulation.on("tick", () => {
      for (const d3Node of d3Nodes) {
        const vueNode = nodes.value.find(n => n.id === d3Node.id);
        if (vueNode) {
          vueNode.position.x = d3Node.x || 0;
          vueNode.position.y = d3Node.y || 0;
        }
      }
    });

    // 模拟结束后，确保最终位置被应用
    simulation.on("end", () => {
      logger.info("D3 力模拟结束");
    });

    logger.info("D3 力模拟已初始化");
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
   * 处理拖拽结束事件 - 嫁接功能
   */
  function handleNodeDragStop(event: any): void {
    const draggedNodeId = event.node.id;
    const session = sessionRef();
    if (!session) return;

    // Vue Flow 的拖拽事件不直接提供目标节点
    // 我们需要通过位置计算最近的节点
    const draggedNode = nodes.value.find(n => n.id === draggedNodeId);
    if (!draggedNode) return;

    // 找到最近的节点（除了自己）
    let closestNodeId: string | null = null;
    let minDistance = Infinity;

    nodes.value.forEach(node => {
      if (node.id === draggedNodeId) return;

      const dx = node.position.x - draggedNode.position.x;
      const dy = node.position.y - draggedNode.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < minDistance && distance < 100) { // 100px 阈值
        minDistance = distance;
        closestNodeId = node.id;
      }
    });

    if (!closestNodeId) {
      logger.debug("拖拽结束：未找到有效的目标节点");
      return;
    }

    logger.info("拖拽嫁接操作", { draggedNodeId, targetNodeId: closestNodeId });

    try {
      store.graftBranch(draggedNodeId, closestNodeId);
    } catch (error) {
      logger.error("嫁接操作失败", error);
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
    handleNodeDoubleClick,
    handleNodeDragStop,
    handleNodeContextMenu,
    updateChart,
    destroy,
  };
}