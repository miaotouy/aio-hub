import { computed, type Ref } from "vue";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
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
 * 图节点数据结构
 */
interface GraphNode {
  id: string;
  name: string;
  category: number;
  symbolSize: number;
  symbol: string;
  label: {
    show: boolean;
    formatter: string;
  };
  itemStyle: {
    color?: string;
    borderColor?: string;
    borderWidth?: number;
    opacity?: number;
  };
  // 存储原始节点引用，用于交互
  _node: ChatMessageNode;
}

/**
 * 图连接数据结构
 */
interface GraphLink {
  source: string;
  target: string;
  lineStyle: {
    color?: string;
    width?: number;
    opacity?: number;
  };
}

/**
 * 会话树图 Composable
 * 负责将 ChatSession 数据转换为 ECharts graph 数据，并处理图表交互事件
 */
export function useConversationGraph(
  sessionRef: () => ChatSession | null,
  contextMenuState: Ref<ContextMenuState>
) {
  // ECharts 实例
  let chartInstance: echarts.ECharts | null = null;
  const store = useLlmChatStore();

  /**
   * 截断文本用于显示
   */
  function truncateText(text: string, maxLength: number = 30): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  }

  /**
   * 根据角色确定节点符号
   */
  function getNodeSymbol(role: string): string {
    switch (role) {
      case "user":
        return "rect"; // 用户消息用方形
      case "assistant":
        return "circle"; // 助手消息用圆形
      case "system":
        return "diamond"; // 系统消息用菱形
      default:
        return "circle";
    }
  }

  /**
   * 根据角色确定分类（用于着色）
   */
  function getCategoryByRole(role: string): number {
    switch (role) {
      case "user":
        return 0;
      case "assistant":
        return 1;
      case "system":
        return 2;
      default:
        return 3;
    }
  }

  /**
   * 计算节点样式（根据状态）
   */
  function getNodeStyle(
    session: ChatSession,
    node: ChatMessageNode
  ): GraphNode["itemStyle"] {
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
        color: "#d3d3d3",
        borderColor: "#999",
        borderWidth: 1,
        opacity: 0.4,
      };
    }

    // 当前叶节点：高亮加粗边框
    if (isActiveLeaf) {
      return {
        color: baseColor,
        borderColor: "#f56c6c", // 红色边框
        borderWidth: 4,
        opacity: 1,
      };
    }

    // 活动路径上的节点：正常显示
    if (isOnActivePath) {
      return {
        color: baseColor,
        borderColor: baseColor,
        borderWidth: 2,
        opacity: 1,
      };
    }

    // 非活动路径：半透明
    return {
      color: baseColor,
      borderColor: baseColor,
      borderWidth: 1,
      opacity: 0.5,
    };
  }

  /**
   * 计算连接样式
   */
  function getLinkStyle(
    session: ChatSession,
    sourceId: string,
    targetId: string
  ): GraphLink["lineStyle"] {
    const isSourceOnPath = BranchNavigator.isNodeInActivePath(session, sourceId);
    const isTargetOnPath = BranchNavigator.isNodeInActivePath(session, targetId);
    const isOnActivePath = isSourceOnPath && isTargetOnPath;

    if (isOnActivePath) {
      return {
        color: "#409eff",
        width: 3,
        opacity: 1,
      };
    }

    return {
      color: "#999",
      width: 1,
      opacity: 0.3,
    };
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
   * 生成 ECharts 图表配置
   */
  const graphOption = computed<EChartsOption>(() => {
    const session = sessionRef();
    if (!session) {
      return {
        title: {
          text: "暂无会话数据",
          left: "center",
          top: "center",
          textStyle: {
            color: "#999",
            fontSize: 16,
          },
        },
      };
    }

    // 转换节点数据
    const nodes: GraphNode[] = Object.values(session.nodes).map((node) => {
      const depth = calculateNodeDepth(session, node.id);
      const isRoot = node.id === session.rootNodeId;
      
      return {
        id: node.id,
        name: truncateText(node.content),
        category: getCategoryByRole(node.role),
        symbolSize: node.role === "system" ? 25 : 40,
        symbol: getNodeSymbol(node.role),
        // 根节点固定位置，其他节点根据深度设置初始 y 坐标
        x: isRoot ? 100 : undefined,
        y: isRoot ? 100 : depth * 120,
        fixed: isRoot, // 固定根节点
        label: {
          show: true,
          formatter: `{b}\n[${node.role}]`,
        },
        itemStyle: getNodeStyle(session, node),
        _node: node, // 保存原始引用
      } as any;
    });

    // 转换连接数据
    const links: GraphLink[] = [];
    Object.values(session.nodes).forEach((node) => {
      if (node.parentId) {
        links.push({
          source: node.parentId,
          target: node.id,
          lineStyle: getLinkStyle(session, node.parentId, node.id),
        });
      }
    });

    return {
      title: {
        text: `会话树图 (${nodes.length} 个节点)`,
        left: "center",
        top: 20,
        textStyle: {
          fontSize: 14,
          color: "#606266",
        },
      },
      tooltip: {
        trigger: "item",
        formatter: (params: any) => {
          if (params.dataType === "node") {
            const node: ChatMessageNode = params.data._node;
            const siblingInfo = BranchNavigator.getSiblingIndex(session, node.id);
            const isOnPath = BranchNavigator.isNodeInActivePath(session, node.id);
            
            return `
              <div style="max-width: 300px;">
                <strong>角色:</strong> ${node.role}<br/>
                <strong>状态:</strong> ${node.isEnabled !== false ? "启用" : "禁用"}<br/>
                <strong>路径:</strong> ${isOnPath ? "活动路径" : "非活动"}<br/>
                <strong>分支:</strong> ${siblingInfo.index + 1}/${siblingInfo.total}<br/>
                <strong>内容:</strong><br/>
                ${truncateText(node.content, 100)}
              </div>
            `;
          }
          return "";
        },
      },
      legend: {
        data: [
          { name: "用户", icon: "rect" },
          { name: "助手", icon: "circle" },
          { name: "系统", icon: "diamond" },
        ],
        top: 50,
        textStyle: {
          color: "#606266",
        },
      },
      series: [
        {
          type: "graph",
          layout: "force",
          data: nodes,
          links: links,
          categories: [
            { name: "用户" },
            { name: "助手" },
            { name: "系统" },
          ],
          roam: true, // 允许缩放和平移
          draggable: true, // 允许拖拽节点
          force: {
            // 增大斥力，让节点保持距离
            repulsion: 500,
            // 增大边长，让树更舒展
            edgeLength: [100, 250],
            // 增加重力，让节点向下聚拢（模拟树的下垂感）
            gravity: 0.15,
            // 布局迭代次数，增加以获得更稳定的布局
            layoutAnimation: true,
            // 摩擦力，减少晃动
            friction: 0.6,
          },
          label: {
            show: true,
            position: "right",
            fontSize: 11,
          },
          emphasis: {
            focus: "adjacency",
            label: {
              fontSize: 13,
            },
          },
          // 边的样式
          edgeSymbol: ['none', 'arrow'],
          edgeSymbolSize: 8,
        },
      ],
    };
  });

  /**
   * 处理双击事件 - 切换分支
   */
  function handleDblClick(params: any): void {
    if (params.dataType !== "node") return;

    const nodeId = params.data.id;
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
    if (params.dataType !== "node") return;

    const node: ChatMessageNode = params.data._node;
    const session = sessionRef();
    if (!session) return;

    // 阻止浏览器默认右键菜单
    params.event.event.preventDefault();

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
      x: params.event.event.clientX,
      y: params.event.event.clientY,
      items,
    };
  }

  /**
   * 初始化 ECharts 实例
   */
  function init(container: HTMLElement): void {
    try {
      chartInstance = echarts.init(container);
      chartInstance.setOption(graphOption.value);

      // 绑定双击事件（分支切换）
      chartInstance.on("dblclick", handleDblClick);

      // 绑定右键菜单事件
      chartInstance.on("contextmenu", handleContextMenu);

      // TODO: Phase 3.4 - 实现拖拽嫁接功能
      // 需要精确获取节点在画布上的位置，并实现吸附逻辑
      // chartInstance.on("dragend", (params) => { ... });

      logger.info("ECharts 图表初始化成功");
    } catch (error) {
      logger.error("ECharts 图表初始化失败", error);
    }
  }

  /**
   * 更新图表数据
   */
  function updateChart(): void {
    if (chartInstance) {
      try {
        chartInstance.setOption(graphOption.value, { notMerge: true });
        logger.debug("图表数据已更新");
      } catch (error) {
        logger.error("更新图表数据失败", error);
      }
    }
  }

  /**
   * 销毁 ECharts 实例
   */
  function destroy(): void {
    if (chartInstance) {
      chartInstance.dispose();
      chartInstance = null;
      logger.info("ECharts 图表已销毁");
    }
  }

  return {
    init,
    updateChart,
    destroy,
  };
}