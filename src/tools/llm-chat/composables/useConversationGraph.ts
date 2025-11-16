import { computed, type Ref } from "vue";
import { DataSet, Network } from "vis-network/standalone";
import type { Options, Node, Edge, Data } from "vis-network/standalone";
import type { ChatSession, ChatMessageNode } from "../types";
import { BranchNavigator } from "../utils/BranchNavigator";
import { useLlmChatStore } from "../store";
import { createModuleLogger } from "@/utils/logger";
import type { MenuItem } from "../components/conversation-tree-graph/ContextMenu.vue";

const logger = createModuleLogger("llm-chat/composables/useConversationGraph");

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
 * 会话树图 Composable
 * 负责将 ChatSession 数据转换为 Vis.js Network 数据，并处理图表交互事件
 */
export function useConversationGraph(
  sessionRef: () => ChatSession | null,
  contextMenuState: Ref<ContextMenuState>
) {
  // Vis.js Network 实例
  let networkInstance: Network | null = null;
  const store = useLlmChatStore();

  /**
   * 截断文本用于显示
   */
  function truncateText(text: string, maxLength: number = 30): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  }

  /**
   * 根据角色确定节点形状
   */
  function getNodeShape(role: string): string {
    switch (role) {
      case "user":
        return "box"; // 用户消息用方形
      case "assistant":
        return "ellipse"; // 助手消息用椭圆
      case "system":
        return "diamond"; // 系统消息用菱形
      default:
        return "ellipse";
    }
  }

  /**
   * 计算节点的层级深度
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
   * 获取当前主题（明暗）
   */
  function isDarkTheme(): boolean {
    return document.documentElement.classList.contains('dark');
  }

  /**
   * 根据节点状态计算颜色（适配主题）
   */
  function getNodeColor(session: ChatSession, node: ChatMessageNode): {
    background: string;
    border: string;
    highlight: { background: string; border: string };
    hover: { background: string; border: string };
  } {
    const isOnActivePath = BranchNavigator.isNodeInActivePath(session, node.id);
    const isActiveLeaf = node.id === session.activeLeafId;
    const isEnabled = node.isEnabled !== false;

    const dark = isDarkTheme();
    
    // 基础颜色（根据角色和主题）
    let baseColor: string;
    let gradientColor: string;
    switch (node.role) {
      case "user":
        baseColor = dark ? "#409eff" : "#409eff";
        gradientColor = dark ? "#66b1ff" : "#79bbff";
        break;
      case "assistant":
        baseColor = dark ? "#67c23a" : "#67c23a";
        gradientColor = dark ? "#85ce61" : "#95d475";
        break;
      case "system":
        baseColor = dark ? "#e6a23c" : "#e6a23c";
        gradientColor = dark ? "#ebb563" : "#eebe77";
        break;
      default:
        baseColor = dark ? "#909399" : "#909399";
        gradientColor = dark ? "#a6a9ad" : "#b1b3b8";
    }

    // 禁用节点：置灰（适配主题）
    if (!isEnabled) {
      return {
        background: dark ? "#4a4a4a" : "#d3d3d3",
        border: dark ? "#666666" : "#999999",
        highlight: { background: dark ? "#5a5a5a" : "#e0e0e0", border: dark ? "#777777" : "#888888" },
        hover: { background: dark ? "#5a5a5a" : "#e0e0e0", border: dark ? "#777777" : "#888888" },
      };
    }

    // 当前叶节点：红色边框高亮 + 发光效果
    if (isActiveLeaf) {
      return {
        background: baseColor,
        border: "#f56c6c",
        highlight: { background: gradientColor, border: "#f78989" },
        hover: { background: gradientColor, border: "#f78989" },
      };
    }

    // 活动路径上的节点
    if (isOnActivePath) {
      return {
        background: baseColor,
        border: baseColor,
        highlight: { background: gradientColor, border: gradientColor },
        hover: { background: gradientColor, border: gradientColor },
      };
    }

    // 非活动路径：半透明
    return {
      background: baseColor + "60",
      border: baseColor + "60",
      highlight: { background: baseColor + "80", border: baseColor + "80" },
      hover: { background: baseColor + "80", border: baseColor + "80" },
    };
  }

  /**
   * 根据边的状态计算颜色
   */
  function getEdgeColor(session: ChatSession, sourceId: string, targetId: string): string {
    const isSourceOnPath = BranchNavigator.isNodeInActivePath(session, sourceId);
    const isTargetOnPath = BranchNavigator.isNodeInActivePath(session, targetId);
    const isOnActivePath = isSourceOnPath && isTargetOnPath;

    if (isOnActivePath) {
      return "#409eff";
    }

    return "#99999950"; // 半透明灰色
  }

  /**
   * 生成 Vis.js 节点数据
   */
  const nodesData = computed<Node[]>(() => {
    const session = sessionRef();
    if (!session) return [];

    return Object.values(session.nodes).map((node) => {
      const depth = calculateNodeDepth(session, node.id);
      const colors = getNodeColor(session, node);
      const isActiveLeaf = node.id === session.activeLeafId;
      const isEnabled = node.isEnabled !== false;
      const siblingInfo = BranchNavigator.getSiblingIndex(session, node.id);

      return {
        id: node.id,
        label: `${truncateText(node.content, 40)}\n[${node.role}]`,
        shape: getNodeShape(node.role),
        level: depth,
        color: {
          background: colors.background,
          border: colors.border,
          highlight: colors.highlight,
          hover: colors.hover,
        },
        borderWidth: isActiveLeaf ? 5 : 2,
        borderWidthSelected: 4,
        opacity: isEnabled ? 1 : 0.5,
        shadow: isActiveLeaf ? {
          enabled: true,
          color: 'rgba(245, 108, 108, 0.5)',
          size: 15,
          x: 0,
          y: 0,
        } : {
          enabled: true,
          color: 'rgba(0, 0, 0, 0.2)',
          size: 10,
          x: 2,
          y: 2,
        },
        font: {
          size: 13,
          color: isEnabled 
            ? (isDarkTheme() ? "#e0e0e0" : "#333333")
            : (isDarkTheme() ? "#666666" : "#999999"),
          face: "Arial, sans-serif",
          multi: true,
          bold: {
            color: isDarkTheme() ? "#ffffff" : "#000000",
            size: 14,
          },
        },
        title: `角色: ${node.role}\n状态: ${node.isEnabled !== false ? '✅ 启用' : '❌ 禁用'}\n分支: ${siblingInfo.index + 1}/${siblingInfo.total}\n\n内容:\n${truncateText(node.content, 200)}`,
        // 存储原始节点引用，用于交互
        _node: node,
      } as Node & { _node: ChatMessageNode };
    });
  });

  /**
   * 生成 Vis.js 边数据
   */
  const edgesData = computed<Edge[]>(() => {
    const session = sessionRef();
    if (!session) return [];

    const edges: Edge[] = [];
    Object.values(session.nodes).forEach((node) => {
      if (node.parentId) {
        const color = getEdgeColor(session, node.parentId, node.id);
        const isOnActivePath =
          BranchNavigator.isNodeInActivePath(session, node.parentId) &&
          BranchNavigator.isNodeInActivePath(session, node.id);

        edges.push({
          from: node.parentId,
          to: node.id,
          arrows: {
            to: {
              enabled: true,
              scaleFactor: 0.8,
              type: "arrow",
            },
          },
          color: {
            color: color,
            highlight: "#409eff",
            hover: "#409eff",
            opacity: isOnActivePath ? 1 : 0.5,
          },
          width: isOnActivePath ? 3 : 1.5,
          selectionWidth: 2,
          smooth: {
            enabled: true,
            type: "cubicBezier",
            roundness: 0.3,
          },
          shadow: isOnActivePath ? {
            enabled: true,
            color: 'rgba(64, 158, 255, 0.3)',
            size: 8,
            x: 0,
            y: 0,
          } : undefined,
        });
      }
    });

    return edges;
  });

  /**
   * Vis.js 网络配置选项
   */
  const networkOptions: Options = {
    layout: {
      hierarchical: {
        enabled: true,
        direction: "UD", // Up-Down (自上而下)
        sortMethod: "directed", // 根据边的方向排序
        nodeSpacing: 150, // 同层节点之间的水平间距
        levelSeparation: 120, // 层级之间的垂直间距
        treeSpacing: 200, // 不同树之间的间距
      },
    },
    physics: {
      enabled: true, // 启用物理引擎，提供拖拽时的动态效果
      hierarchicalRepulsion: {
        centralGravity: 0.0, // 降低中心引力，让节点更自由
        springLength: 120, // 弹簧长度（节点间期望距离）
        springConstant: 0.01, // 弹簧常数（越小越柔软）
        nodeDistance: 150, // 节点间的最小距离
        damping: 0.09, // 阻尼系数（越大停得越快）
      },
      stabilization: {
        enabled: true,
        iterations: 200, // 初始化时的稳定迭代次数
        updateInterval: 25,
      },
    },
    interaction: {
      dragNodes: true, // 允许拖拽节点
      dragView: true, // 允许拖拽画布
      zoomView: true, // 允许缩放
      hover: true, // 启用 hover 效果
    },
    nodes: {
      shape: "box",
      margin: {
        top: 10,
        right: 10,
        bottom: 10,
        left: 10,
      },
      widthConstraint: {
        minimum: 80,
        maximum: 200,
      },
      shapeProperties: {
        borderRadius: 8,
      },
    },
    edges: {
      smooth: {
        enabled: true,
        type: "cubicBezier",
        forceDirection: "vertical",
        roundness: 0.4,
      },
      hoverWidth: 1.5,
    },
  };

  /**
   * 处理双击事件 - 切换分支
   */
  function handleDoubleClick(params: any): void {
    if (!params.nodes || params.nodes.length === 0) return;

    const nodeId = params.nodes[0];
    logger.info("双击节点，切换分支", { nodeId });

    try {
      store.switchBranch(nodeId);
    } catch (error) {
      logger.error("切换分支失败", error);
    }
  }

  /**
   * 处理右键菜单（原生 DOM 事件）
   */
  function handleContextMenu(event: MouseEvent): void {
    // 阻止浏览器默认右键菜单
    event.preventDefault();
    
    if (!networkInstance) return;

    // 获取鼠标位置对应的节点
    const nodeId = networkInstance.getNodeAt({ x: event.offsetX, y: event.offsetY });
    
    if (!nodeId) return;

    const session = sessionRef();
    if (!session) return;

    const node = session.nodes[String(nodeId)];
    if (!node) return;

    // 构建菜单项
    const items: MenuItem[] = [];
    
    // 设为当前分支
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
    
    // 切换启用/禁用
    items.push({
      label: node.isEnabled !== false ? "禁用此节点" : "启用此节点",
      icon: node.isEnabled !== false ? "el-icon-circle-close" : "el-icon-circle-check",
      action: () => {
        logger.info("切换节点启用状态", { nodeId: node.id });
        store.toggleNodeEnabled(node.id);
      },
    });
    
    // 剪掉分支
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

    // 显示上下文菜单
    contextMenuState.value = {
      visible: true,
      x: event.clientX,
      y: event.clientY,
      items,
    };
  }

  /**
   * 处理拖拽结束事件 - 嫁接功能
   */
  function handleDragEnd(params: any): void {
    if (!params.nodes || params.nodes.length === 0) return;

    const draggedNodeId = params.nodes[0];
    const session = sessionRef();
    if (!session || !networkInstance) return;

    // 获取释放位置下的目标节点
    const pointer = params.pointer.DOM;
    const targetNodeId = networkInstance.getNodeAt(pointer);

    if (!targetNodeId || targetNodeId === draggedNodeId) {
      logger.debug("拖拽结束：未找到有效的目标节点");
      return;
    }

    logger.info("拖拽嫁接操作", { draggedNodeId, targetNodeId });

    try {
      store.graftBranch(String(draggedNodeId), String(targetNodeId));
    } catch (error) {
      logger.error("嫁接操作失败", error);
    }
  }

  // 保存容器引用用于清理
  let containerRef: HTMLElement | null = null;

  /**
   * 初始化 Vis.js Network 实例
   */
  function init(container: HTMLElement): void {
    try {
      const nodes = new DataSet(nodesData.value);
      const edges = new DataSet(edgesData.value);

      const data: Data = { nodes, edges };

      networkInstance = new Network(container, data, networkOptions);
      containerRef = container;

      // 绑定双击事件（分支切换）
      networkInstance.on("doubleClick", handleDoubleClick);

      // 绑定原生右键菜单事件
      container.addEventListener("contextmenu", handleContextMenu);

      // 绑定拖拽结束事件（嫁接功能）
      networkInstance.on("dragEnd", handleDragEnd);

      logger.info("Vis.js Network 初始化成功");
    } catch (error) {
      logger.error("Vis.js Network 初始化失败", error);
    }
  }

  /**
   * 更新网络数据
   */
  function updateChart(): void {
    if (networkInstance) {
      try {
        // 重新创建 DataSet 并更新网络
        const nodes = new DataSet(nodesData.value);
        const edges = new DataSet(edgesData.value);
        
        networkInstance.setData({ nodes, edges });

        logger.debug("网络数据已更新");
      } catch (error) {
        logger.error("更新网络数据失败", error);
      }
    }
  }

  /**
   * 销毁 Vis.js Network 实例
   */
  function destroy(): void {
    if (networkInstance) {
      // 移除事件监听器
      if (containerRef) {
        containerRef.removeEventListener("contextmenu", handleContextMenu);
        containerRef = null;
      }
      
      networkInstance.destroy();
      networkInstance = null;
      logger.info("Vis.js Network 已销毁");
    }
  }

  return {
    init,
    updateChart,
    destroy,
  };
}