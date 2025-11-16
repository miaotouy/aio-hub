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
   * 根据节点状态计算颜色
   */
  function getNodeColor(session: ChatSession, node: ChatMessageNode): { background: string; border: string } {
    const isOnActivePath = BranchNavigator.isNodeInActivePath(session, node.id);
    const isActiveLeaf = node.id === session.activeLeafId;
    const isEnabled = node.isEnabled !== false;

    // 基础颜色（根据角色）
    let baseColor: string;
    switch (node.role) {
      case "user":
        baseColor = "#409eff"; // Element Plus 主题色
        break;
      case "assistant":
        baseColor = "#67c23a"; // 绿色
        break;
      case "system":
        baseColor = "#e6a23c"; // 橙色
        break;
      default:
        baseColor = "#909399";
    }

    // 禁用节点：置灰
    if (!isEnabled) {
      return {
        background: "#d3d3d3",
        border: "#999",
      };
    }

    // 当前叶节点：红色边框高亮
    if (isActiveLeaf) {
      return {
        background: baseColor,
        border: "#f56c6c",
      };
    }

    // 活动路径上的节点
    if (isOnActivePath) {
      return {
        background: baseColor,
        border: baseColor,
      };
    }

    // 非活动路径：半透明
    return {
      background: baseColor + "80", // 添加 alpha 通道
      border: baseColor + "80",
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

      return {
        id: node.id,
        label: `${truncateText(node.content)}\n[${node.role}]`,
        shape: getNodeShape(node.role),
        level: depth, // 用于层级布局
        color: {
          background: colors.background,
          border: colors.border,
          highlight: {
            background: colors.background,
            border: "#f56c6c",
          },
        },
        borderWidth: isActiveLeaf ? 4 : 2,
        opacity: isEnabled ? 1 : 0.4,
        font: {
          size: 12,
          color: "#333",
        },
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
          arrows: "to",
          color: {
            color: color,
            highlight: "#409eff",
          },
          width: isOnActivePath ? 3 : 1,
          smooth: {
            enabled: true,
            type: "cubicBezier",
            roundness: 0.2,
          },
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
        maximum: 200,
      },
    },
    edges: {
      smooth: {
        enabled: true,
        type: "cubicBezier",
        forceDirection: "vertical",
        roundness: 0.4,
      },
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
   * 处理右键菜单
   */
  function handleContextMenu(params: any): void {
    if (!params.nodes || params.nodes.length === 0) return;

    const nodeId = params.nodes[0];
    const session = sessionRef();
    if (!session) return;

    const node = session.nodes[nodeId];
    if (!node) return;

    // 阻止浏览器默认右键菜单
    params.event.preventDefault();

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
      x: params.pointer.DOM.x,
      y: params.pointer.DOM.y,
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

  /**
   * 初始化 Vis.js Network 实例
   */
  function init(container: HTMLElement): void {
    try {
      const nodes = new DataSet(nodesData.value);
      const edges = new DataSet(edgesData.value);

      const data: Data = { nodes, edges };

      networkInstance = new Network(container, data, networkOptions);

      // 绑定双击事件（分支切换）
      networkInstance.on("doubleClick", handleDoubleClick);

      // 绑定右键菜单事件
      networkInstance.on("oncontext", handleContextMenu);

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