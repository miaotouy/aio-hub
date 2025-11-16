import { computed, reactive, type Ref } from "vue";
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
    return document.documentElement.classList.contains("dark");
  }

  function getCssVar(varName: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }

  /**
   * 创建一个从 CSS 变量中读取颜色的动态调色板
   * 直接使用 theme-appearance.css 中已经设置好的 CSS 变量，自动跟随主题外观变化
   */
  function createThemePalette() {
    const dark = isDarkTheme();
    const lightSuffix = dark ? "" : "-light-3";
    const lighterSuffix = dark ? "-light-3" : "-light-5";
    const inactiveSuffix = dark ? "-dark-2" : "-light-8";

    // 读取主题外观 CSS 变量（由 useThemeAppearance 动态设置）
    const cardBg = getCssVar("--card-bg");
    const containerBg = getCssVar("--container-bg");

    return {
      user: {
        // 激活路径节点：使用带透明度的卡片背景色
        base: cardBg || getCssVar("--el-color-primary"),
        // 高亮/Hover：Element Plus 浅色变体
        light: getCssVar(`--el-color-primary${lightSuffix}`),
        // 非激活路径：使用容器背景色（更透明）
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
        lighter: getCssVar(`--el-color-danger${lighterSuffix}`),
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
        // 活动路径的边：使用纯色 primary，保持鲜艳（不受透明度影响）
        active: getCssVar("--el-color-primary"),
        activeHighlight: getCssVar(`--el-color-primary${lightSuffix}`),
        inactive: getCssVar(`--el-color-info${inactiveSuffix}`),
        inactiveHighlight: getCssVar(`--el-color-info${lightSuffix}`),
      },
      font: {
        base: getCssVar("--el-text-color-primary"),
        disabled: getCssVar("--el-text-color-disabled"),
        white: "#FFFFFF",
        black: "#000000",
      },
    };
  }
  // 创建一个响应式的调色板，以便在主题切换时自动更新
  let palette = reactive(createThemePalette());

  // 监听主题变化以刷新调色板
  const observer = new MutationObserver(() => {
    Object.assign(palette, createThemePalette());
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style"],
  });

  /**
   * 根据节点状态计算颜色（适配主题）- 新版
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

    // 根据角色获取对应的颜色
    type RoleColorKey = 'user' | 'assistant' | 'system';
    const roleKey = node.role as RoleColorKey;
    const roleColors = (palette[roleKey] && 'base' in palette[roleKey])
      ? palette[roleKey] as { base: string; light: string; lighter: string }
      : palette.inactive as { base: string; light: string };

    // 禁用节点
    if (!isEnabled) {
      return {
        background: palette.disabled.base,
        border: palette.disabled.light,
        highlight: { background: palette.disabled.light, border: palette.disabled.light },
        hover: { background: palette.disabled.light, border: palette.disabled.light },
      };
    }

    let background: string, border: string;

    if (isOnActivePath) {
      background = roleColors.base;
      border = roleColors.light;
    } else {
      // 非活动路径，使用更浅的颜色
      background = ('lighter' in roleColors ? roleColors.lighter : roleColors.light) as string;
      border = roleColors.light;
    }

    // 当前叶节点，使用危险色边框强调
    if (isActiveLeaf) {
      border = palette.danger.base;
    }

    return {
      background,
      border,
      highlight: {
        background: roleColors.light,
        border: isActiveLeaf ? palette.danger.light : roleColors.light,
      },
      hover: {
        background: roleColors.light,
        border: isActiveLeaf ? palette.danger.light : roleColors.light,
      },
    };
  }

  /**
   * 根据边的状态计算颜色 - 新版
   */
  function getEdgeColor(session: ChatSession, sourceId: string, targetId: string): {
    color: string;
    highlight: string;
    hover: string;
  } {
    const isSourceOnPath = BranchNavigator.isNodeInActivePath(session, sourceId);
    const isTargetOnPath = BranchNavigator.isNodeInActivePath(session, targetId);
    const isOnActivePath = isSourceOnPath && isTargetOnPath;

    if (isOnActivePath) {
      return {
        color: palette.edge.active,
        highlight: palette.edge.activeHighlight,
        hover: palette.edge.activeHighlight,
      };
    }

    return {
      color: palette.edge.inactive,
      highlight: palette.edge.inactiveHighlight,
      hover: palette.edge.inactiveHighlight,
    };
  }
  /**
   * 获取角色图标和显示名称
   */
  function getRoleDisplay(role: string): { icon: string; name: string } {
    switch (role) {
      case "user":
        return { icon: "👤", name: "用户" };
      case "assistant":
        return { icon: "🤖", name: "助手" };
      case "system":
        return { icon: "⚙️", name: "系统" };
      default:
        return { icon: "❓", name: role };
    }
  }

  /**
   * 生成 Vis.js 节点数据 - 美化版本
   */
  const nodesData = computed<Node[]>(() => {
    const session = sessionRef();
    if (!session) return [];

    return Object.values(session.nodes).map((node) => {
      const depth = calculateNodeDepth(session, node.id);
      const colors = getNodeColor(session, node);
      const isActiveLeaf = node.id === session.activeLeafId;
      const isEnabled = node.isEnabled !== false;
      const isOnActivePath = BranchNavigator.isNodeInActivePath(session, node.id);
      const siblingInfo = BranchNavigator.getSiblingIndex(session, node.id);
      const roleDisplay = getRoleDisplay(node.role);

      // 截断文本，避免节点过长
      const contentPreview = truncateText(node.content, 30);
      const label = `${roleDisplay.icon} ${contentPreview}`;

      return {
        id: node.id,
        label: label,
        shape: getNodeShape(node.role),
        level: depth,
        color: colors,
        borderWidth: isActiveLeaf ? 3 : (isOnActivePath ? 2 : 1.5),
        borderWidthSelected: 3,
        opacity: isEnabled ? 1 : 0.7,
        // 简化阴影，仅在活动节点上提供微妙提示
        shadow: isActiveLeaf || isOnActivePath
          ? {
              enabled: true,
              color: "rgba(0, 0, 0, 0.25)",
              size: 10,
              x: 2,
              y: 2,
            }
          : false,
        // 统一字体配置
        font: {
          size: 14,
          color: isEnabled ? palette.font.base : palette.font.disabled,
          face: "var(--font-family)",
          multi: false,
          bold: isActiveLeaf
            ? {
                color: isDarkTheme() ? palette.font.white : palette.font.black,
                size: 14,
              }
            : undefined,
        },
        // 丰富的悬停提示
        title: [
          `${roleDisplay.icon} ${roleDisplay.name}`,
          `状态: ${isEnabled ? '✅ 启用' : '❌ 禁用'}`,
          siblingInfo.total > 1 ? `分支: ${siblingInfo.index + 1}/${siblingInfo.total}` : '',
          isActiveLeaf ? '🎯 当前活动节点' : (isOnActivePath ? '📍 活动路径' : ''),
          '',
          '内容预览:',
          truncateText(node.content, 200),
        ].filter(Boolean).join('\n'),
        // 存储原始节点引用，用于交互
        _node: node,
      } as Node & { _node: ChatMessageNode };
    });
  });

  /**
   * 生成 Vis.js 边数据 - 美化版本
   */
  const edgesData = computed<Edge[]>(() => {
    const session = sessionRef();
    if (!session) return [];

    const edges: Edge[] = [];
    
    Object.values(session.nodes).forEach((node) => {
      if (node.parentId) {
        const colors = getEdgeColor(session, node.parentId, node.id);
        const isOnActivePath =
          BranchNavigator.isNodeInActivePath(session, node.parentId) &&
          BranchNavigator.isNodeInActivePath(session, node.id);

        edges.push({
          from: node.parentId,
          to: node.id,
          arrows: {
            to: {
              enabled: true,
              scaleFactor: isOnActivePath ? 0.8 : 0.6,
              type: "arrow",
            },
          },
          color: {
            ...colors,
            opacity: isOnActivePath ? 0.9 : 0.4,
          },
          width: isOnActivePath ? 2.2 : 1.5,
          selectionWidth: 2.5,
          smooth: {
            enabled: true,
            type: "cubicBezier",
            roundness: 0.4,
          },
          shadow: false, // 移除边的阴影
        });
      }
    });

    return edges;
  });

  /**
   * Vis.js 网络配置选项 - 优化的视觉参数
   */
  const networkOptions: Options = {
    layout: {
      hierarchical: {
        enabled: true,
        direction: "UD", // Up-Down (自上而下)
        sortMethod: "directed", // 根据边的方向排序
        nodeSpacing: 150, // 同层节点的水平间距
        levelSeparation: 120, // 层级之间的垂直间距
        treeSpacing: 200, // 不同树之间的间距
        blockShifting: true,
        edgeMinimization: true,
        parentCentralization: true,
      },
    },
    physics: {
      enabled: true,
      // 只启用分层斥力模型，用于在拖动时提供一些动态反馈，但整体保持稳定
      hierarchicalRepulsion: {
        centralGravity: 0.0,
        springLength: 120,
        springConstant: 0.01,
        nodeDistance: 150,
        damping: 0.2, // 增加阻尼，让节点更快稳定下来
      },
      // 禁用其他物理效果，特别是稳定过程，让布局更可预测
      stabilization: false,
    },
    interaction: {
      dragNodes: true, // 允许拖拽节点
      dragView: true, // 允许拖拽画布
      zoomView: true, // 允许缩放
      hover: true, // 启用 hover 效果
      tooltipDelay: 200, // 悬停提示延迟
      keyboard: {
        enabled: true, // 启用键盘导航
      },
      navigationButtons: false, // 不显示导航按钮
      zoomSpeed: 0.8, // 缩放速度
    },
    nodes: {
      shape: "box",
      margin: {
        top: 12,
        right: 16,
        bottom: 12,
        left: 16,
      },
      widthConstraint: {
        minimum: 100,
        maximum: 280,
      },
      shapeProperties: {
        borderRadius: 12, // 增加圆角
        interpolation: false,
      },
      scaling: {
        min: 10,
        max: 30,
        label: {
          enabled: true,
          min: 12,
          max: 18,
        },
      },
    },
    edges: {
      smooth: {
        enabled: true,
        type: "cubicBezier",
        forceDirection: "vertical",
        roundness: 0.5, // 增加圆滑度
      },
      hoverWidth: 2,
      selectionWidth: 3,
      scaling: {
        min: 1,
        max: 5,
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
    // 停止监听主题变化
    observer.disconnect();
  }

  return {
    init,
    updateChart,
    destroy,
  };
}