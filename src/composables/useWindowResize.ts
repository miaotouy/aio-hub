import { getCurrentWindow, PhysicalSize, PhysicalPosition } from "@tauri-apps/api/window";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@utils/errorHandler";

const logger = createModuleLogger("WindowResize");
const errorHandler = createModuleErrorHandler("WindowResize");

/**
 * Tauri v2 调整方向类型
 * 对应 Tauri 的 ResizeDirection 枚举
 */
export type ResizeDirection =
  | "East" // 右边缘
  | "North" // 上边缘
  | "NorthEast" // 右上角
  | "NorthWest" // 左上角
  | "South" // 下边缘
  | "SouthEast" // 右下角
  | "SouthWest" // 左下角
  | "West"; // 左边缘

/**
 * 调整手柄位置配置
 */
export interface ResizeHandleConfig {
  /** 调整方向 */
  direction: ResizeDirection;
  /** CSS 类名 */
  className?: string;
  /** 鼠标样式 */
  cursor?: string;
  /** 手柄尺寸（像素） */
  size?: number;
}

/**
 * 预设的调整手柄配置
 */
export const RESIZE_PRESETS: Record<string, ResizeHandleConfig> = {
  // 角落
  topLeft: {
    direction: "NorthWest",
    cursor: "nw-resize",
    className: "resize-handle-nw",
  },
  topRight: {
    direction: "NorthEast",
    cursor: "ne-resize",
    className: "resize-handle-ne",
  },
  bottomLeft: {
    direction: "SouthWest",
    cursor: "sw-resize",
    className: "resize-handle-sw",
  },
  bottomRight: {
    direction: "SouthEast",
    cursor: "se-resize",
    className: "resize-handle-se",
  },
  // 边缘
  top: {
    direction: "North",
    cursor: "n-resize",
    className: "resize-handle-n",
  },
  right: {
    direction: "East",
    cursor: "e-resize",
    className: "resize-handle-e",
  },
  bottom: {
    direction: "South",
    cursor: "s-resize",
    className: "resize-handle-s",
  },
  left: {
    direction: "West",
    cursor: "w-resize",
    className: "resize-handle-w",
  },
};

/**
 * 窗口大小调整 Composable
 * 使用 Tauri v2 原生 API 实现窗口调整
 */
export function useWindowResize() {
  /**
   * 开始调整窗口大小
   * @param direction 调整方向
   * @param event 鼠标事件（可选，用于阻止默认行为）
   */
  const startResize = async (direction: ResizeDirection, event?: MouseEvent) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    logger.info("开始调整窗口大小", { direction });

    try {
      const window = getCurrentWindow();

      // 定义扩展的 Window 接口以支持 Tauri v2 API
      interface TauriWindowExtended {
        startResizeDragging: (direction: string) => Promise<void>;
      }

      // 使用 Tauri v2 原生 API
      await (window as unknown as TauriWindowExtended).startResizeDragging(direction);
      logger.info("窗口调整完成", { direction });
    } catch (error: any) {
      errorHandler.error(error, "窗口调整失败", { context: { direction } });
    }
  };

  /**
   * 创建调整手柄的鼠标按下事件处理器
   * @param direction 调整方向
   * @returns 事件处理器函数
   */
  const createResizeHandler = (direction: ResizeDirection) => {
    return (event: MouseEvent) => startResize(direction, event);
  };

  /**
   * 动态调整窗口大小并保持特定锚点不动
   * @param options 调整选项
   */
  const animateWindowSize = async (options: {
    width?: number;
    height?: number;
    anchor?: "bottom" | "top" | "left" | "right" | "center";
    threshold?: number;
  }) => {
    const { width, height, anchor = "top", threshold = 2 } = options;

    try {
      const win = getCurrentWindow();
      const [size, pos] = await Promise.all([win.innerSize(), win.outerPosition()]);

      const targetWidth = width !== undefined ? Math.round(width) : size.width;
      const targetHeight = height !== undefined ? Math.round(height) : size.height;

      const deltaWidth = targetWidth - size.width;
      const deltaHeight = targetHeight - size.height;

      // 如果变化非常小，忽略以减少抖动
      if (Math.abs(deltaWidth) <= threshold && Math.abs(deltaHeight) <= threshold) {
        return;
      }

      let newX = pos.x;
      let newY = pos.y;

      // 根据锚点计算新位置
      if (anchor === "bottom") {
        // 底部不动，向上增长
        newY = Math.round(pos.y - deltaHeight);
      } else if (anchor === "right") {
        // 右侧不动，向左增长
        newX = Math.round(pos.x - deltaWidth);
      } else if (anchor === "center") {
        // 中心不动，向四周增长
        newX = Math.round(pos.x - deltaWidth / 2);
        newY = Math.round(pos.y - deltaHeight / 2);
      }
      // 'top' 和 'left' 是默认行为，不需要调整坐标

      // 如果坐标有变化，先设置坐标（或同时设置）
      if (newX !== pos.x || newY !== pos.y) {
        await win.setPosition(new PhysicalPosition(newX, newY));
      }

      await win.setSize(new PhysicalSize(targetWidth, targetHeight));

      logger.debug("窗口尺寸动态调整完成", {
        anchor,
        oldSize: { w: size.width, h: size.height },
        newSize: { w: targetWidth, h: targetHeight },
        delta: { dw: deltaWidth, dh: deltaHeight },
        newPos: { x: newX, y: newY },
      });
    } catch (error) {
      errorHandler.error(error, "动态调整窗口尺寸失败");
    }
  };

  return {
    startResize,
    createResizeHandler,
    animateWindowSize,
    RESIZE_PRESETS,
  };
}

/**
 * 生成调整手柄的样式
 * @param config 手柄配置
 * @returns CSS 样式对象
 */
export function getResizeHandleStyle(config: ResizeHandleConfig) {
  const size = config.size || 16;
  const style: Record<string, string> = {
    cursor: config.cursor || "default",
    width: `${size}px`,
    height: `${size}px`,
    position: "absolute",
  };

  // 根据方向设置位置
  switch (config.direction) {
    case "NorthWest":
      style.top = "0";
      style.left = "0";
      break;
    case "NorthEast":
      style.top = "0";
      style.right = "0";
      break;
    case "SouthWest":
      style.bottom = "0";
      style.left = "0";
      break;
    case "SouthEast":
      style.bottom = "0";
      style.right = "0";
      break;
    case "North":
      style.top = "0";
      style.left = "0";
      style.right = "0";
      style.height = `${Math.min(size, 8)}px`;
      break;
    case "South":
      style.bottom = "0";
      style.left = "0";
      style.right = "0";
      style.height = `${Math.min(size, 8)}px`;
      break;
    case "East":
      style.top = "0";
      style.right = "0";
      style.bottom = "0";
      style.width = `${Math.min(size, 8)}px`;
      break;
    case "West":
      style.top = "0";
      style.left = "0";
      style.bottom = "0";
      style.width = `${Math.min(size, 8)}px`;
      break;
  }

  return style;
}
