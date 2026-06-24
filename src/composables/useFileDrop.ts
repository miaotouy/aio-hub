import { ref, onMounted, onUnmounted, Ref } from "vue";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";

// 创建模块日志记录器
const errorHandler = createModuleErrorHandler("useFileDrop");

// 拖放选项接口
export interface FileDropOptions {
  // 元素引用或选择器
  element?: Ref<HTMLElement | undefined> | string;
  // 是否只接受目录
  directoryOnly?: boolean;
  // 是否只接受文件
  fileOnly?: boolean;
  // 是否接受多个文件
  multiple?: boolean;
  // 文件类型过滤
  accept?: string[];
  // 自动执行回调
  autoProcess?: boolean;
  // 成功回调
  onDrop?: (paths: string[]) => void | Promise<void>;
  // 成功回调（返回 File 对象，适用于无拦截器时的系统拖放）
  onFiles?: (files: File[]) => void | Promise<void>;
  // 拖入回调
  onDragEnter?: () => void;
  // 拖出回调
  onDragLeave?: () => void;
  // 错误回调
  onError?: (error: string) => void;
  // 自定义验证函数
  validator?: (paths: string[]) => Promise<boolean> | boolean;
  // 是否禁用
  disabled?: Ref<boolean> | boolean;
  // 是否静默处理错误（不弹窗提示）
  silent?: boolean;
}

// 拖放状态接口
export interface FileDropState {
  isDraggingOver: Ref<boolean>;
  isProcessing: Ref<boolean>;
  lastDroppedPaths: Ref<string[]>;
}

/**
 * 从 DataTransfer 中解析路径（兜底方案，适用于 VSCode 等拖拽）
 */
const parsePathsFromDataTransfer = (dt: DataTransfer): string[] => {
  const paths: string[] = [];

  // 1. 尝试从 text/uri-list 获取
  const uriList = dt.getData("text/uri-list");
  if (uriList) {
    const uris = uriList.split(/[\r\n]+/).filter(Boolean);
    for (const uri of uris) {
      if (uri.startsWith("file://")) {
        try {
          let p = decodeURIComponent(uri.substring(7));
          if (p.startsWith("/")) {
            if (p.charAt(2) === ":" || p.charAt(2) === "|") {
              p = p.substring(1);
            }
          }
          p = p.replace(/\|/, ":");
          p = p.replace(/\//g, "\\");
          paths.push(p);
        } catch (err) {
          console.error("解析 URI 失败:", err);
        }
      }
    }
  }

  // 2. 如果 uri-list 没拿到，尝试从 text/plain 获取
  if (paths.length === 0) {
    const plainText = dt.getData("text/plain");
    if (plainText) {
      const lines = plainText.split(/[\r\n]+/).filter(Boolean);
      for (const line of lines) {
        const trimmed = line.trim();
        const isWindowsPath = /^[a-zA-Z]:[\\/]/.test(trimmed);
        const isUnixPath = trimmed.startsWith("/");
        if (isWindowsPath || isUnixPath) {
          paths.push(trimmed);
        }
      }
    }
  }

  return paths;
};

/**
 * 文件拖放组合式函数
 *
 * === 设计架构：双信号融合 (Dual-Signal Fusion) ===
 *
 * 在 Tauri 环境中，文件拖放可能通过两条路径到达：
 *
 * 路径 A - H5 原生事件：当 Tauri 拖拽拦截器被禁用时（disableDragDropHandler=true），
 *   HTML5 原生 dragenter/dragover/dragleave/drop 事件正常触发。
 *   - 优点：DOM 级别精准，即时响应，isDraggingOver 状态极其灵敏。
 *   - 缺点：drop 时通过 e.dataTransfer.files 只能拿到文件名、大小和 MIME 类型，
 *           拿不到文件系统绝对路径；需要通过 onFiles 走字节导入。
 *
 * 路径 B - Tauri 窗口级事件：
 *   - custom-drag-enter/custom-drag-over/custom-drag-leave（通过 Tauri 事件系统）
 *     只会在 Tauri 拖拽拦截器启用时触发。
 *   - getCurrentWebview().onDragDropEvent（Tauri v2 最底层 Webview 拖放事件）
 *     在 Tauri 拖拽拦截器启用时携带绝对路径；禁用拦截器后不能依赖它补路径。
 *
 * === 延迟融合去重算法 (Delayed Fusion & Deduplication) ===
 *
 * 当用户松开鼠标进行 Drop 时：
 *
 *   [用户松开鼠标 (Drop)]
 *        │
 *        ├─► H5 原生 drop 触发 ──► 有 onFiles? ──► 使用 File[] 导入 ✅
 *        │                         │
 *        │                         └─► 无 onFiles 时解析文件名并挂起 50ms ⏳
 *        │                                          │
 *        │                                    (50ms 内 Tauri drop 触发?)
 *        │                                          ▼
 *        └─► Tauri webview-file-drop 触发 ────► 取消挂起 ──► 使用绝对路径执行 onDrop! ✅
 *                                                   │
 *                                              (未触发?)
 *                                                   ▼
 *                                             提示无法获取绝对路径
 *
 * 对于 isDraggingOver 状态：H5 原生 dragenter/dragleave 用于精准控显，Tauri 事件作为兜底补充，
 * 两者互不干扰，让 isDraggingOver 始终保持最准确的值。
 *
 * @param options 拖放选项
 * @returns 拖放状态和方法
 */
export function useFileDrop(options: FileDropOptions = {}) {
  // 状态
  const isDraggingOver = ref(false);
  const isProcessing = ref(false);
  const lastDroppedPaths = ref<string[]>([]);

  // Tauri 事件监听器（custom-drag-* 系列）
  let unlistenDrop: (() => void) | null = null;
  let unlistenDragEnter: (() => void) | null = null;
  let unlistenDragOver: (() => void) | null = null;
  let unlistenDragLeave: (() => void) | null = null;

  // Tauri webview.onDragDropEvent 监听器
  let unlistenWebviewDragDrop: (() => void) | null = null;

  // H5 原生事件监听器
  const nativeListenerCleanups: (() => void)[] = [];

  // ==================== 延迟融合去重状态 ====================
  // 当 H5 原生 drop 触发时，如果 pendingPaths 不为空，说明 Tauri drop 即将到来
  let pendingResolve: ((paths: string[]) => void) | null = null;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  const FUSION_WAIT_MS = 50; // 等待 Tauri 路径的毫秒数

  /**
   * 挂起一个新的 drop 等待（延迟融合）
   * 返回一个 Promise，在 Tauri 路径到达或超时时 resolve
   */
  const createPendingDrop = (paths: string[]): Promise<string[]> => {
    // 清除任何之前的挂起
    clearPendingDrop();
    console.log("[useFileDrop] 创建挂起等待 Tauri 绝对路径, 初始路径:", paths);

    return new Promise<string[]>((resolve) => {
      pendingResolve = resolve;
      pendingTimer = setTimeout(() => {
        console.warn(
          "[useFileDrop] 等待 Tauri 绝对路径超时 (50ms), 降级使用初始路径:",
          paths
        );
        // 超时：使用当前路径（可能是文件名或已解析到的路径）
        const savedPaths = [...paths];
        pendingResolve = null;
        pendingTimer = null;
        resolve(savedPaths);
      }, FUSION_WAIT_MS);
    });
  };

  /**
   * 完成挂起的 drop（接收到 Tauri 路径）
   */
  const resolvePendingDrop = (paths: string[]): boolean => {
    if (pendingResolve) {
      console.log("[useFileDrop] 成功融合 Tauri 绝对路径:", paths);
      const savedPaths = [...paths];
      const resolve = pendingResolve;
      pendingResolve = null;
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
      }
      resolve(savedPaths);
      return true;
    } else {
      console.log(
        "[useFileDrop] 收到 Tauri 绝对路径，但没有挂起的 H5 drop 任务:",
        paths
      );
      return false;
    }
  };

  /**
   * 清除挂起的 drop
   */
  const clearPendingDrop = () => {
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    pendingResolve = null;
  };

  // 辅助函数：判断位置是否在元素内
  const isPositionInRect = (
    position: { x: number; y: number },
    rect: DOMRect
  ) => {
    const ratio = window.devicePixelRatio || 1;
    return (
      position.x >= rect.left * ratio &&
      position.x <= rect.right * ratio &&
      position.y >= rect.top * ratio &&
      position.y <= rect.bottom * ratio
    );
  };

  // 获取目标元素
  const getTargetElement = (): HTMLElement | null => {
    if (!options.element) return null;

    if (typeof options.element === "string") {
      return document.querySelector(options.element) as HTMLElement;
    }

    return options.element.value || null;
  };

  // 检查是否禁用
  const isDisabled = () => {
    if (options.disabled === undefined) return false;
    if (typeof options.disabled === "boolean") return options.disabled;
    return options.disabled.value;
  };

  // 验证文件路径
  const validatePaths = async (paths: string[]): Promise<string[]> => {
    // 验证文件数量
    if (!options.multiple && paths.length > 1) {
      paths = [paths[0]];
      if (!options.silent) {
        customMessage.warning("只能选择一个文件，已自动选择第一个");
      }
    }

    const validPaths: string[] = [];

    for (const path of paths) {
      let isValid = true;

      // 检查是否为目录
      if (options.directoryOnly || options.fileOnly) {
        try {
          const isDir = await invoke<boolean>("is_directory", { path });

          if (options.directoryOnly && !isDir) {
            if (!options.silent) customMessage.warning(`请拖入文件夹: ${path}`);
            isValid = false;
          } else if (options.fileOnly && isDir) {
            if (!options.silent) customMessage.warning(`请拖入文件: ${path}`);
            isValid = false;
          }
        } catch (error) {
          errorHandler.handle(error, {
            userMessage: "检查路径类型失败",
            context: { path },
            showToUser: false,
          });
          // 如果检查失败，仍然添加路径
        }
      }

      // 检查文件扩展名
      if (options.accept && options.accept.length > 0 && isValid) {
        const ext = path.substring(path.lastIndexOf(".")).toLowerCase();
        const isSupported = options.accept.some((acceptedExt) => {
          const normalized = acceptedExt.toLowerCase();
          return normalized.startsWith(".")
            ? ext === normalized
            : ext === `.${normalized}`;
        });

        if (!isSupported) {
          if (!options.silent)
            customMessage.warning(`不支持的文件类型: ${ext}`);
          isValid = false;
        }
      }

      if (isValid) {
        validPaths.push(path);
      }
    }

    // 自定义验证
    if (validPaths.length > 0 && options.validator) {
      const isValid = await options.validator(validPaths);
      if (!isValid) {
        return [];
      }
    }

    return validPaths;
  };

  const validateFiles = (files: File[]): File[] => {
    if (options.directoryOnly) {
      if (!options.silent) {
        customMessage.warning("当前拖放方式无法获取文件夹路径，请使用路径选择");
      }
      return [];
    }

    let validFiles = [...files];
    if (!options.multiple && validFiles.length > 1) {
      validFiles = [validFiles[0]];
      if (!options.silent) {
        customMessage.warning("只能选择一个文件，已自动选择第一个");
      }
    }

    if (options.accept && options.accept.length > 0) {
      validFiles = validFiles.filter((file) => {
        const lowerName = file.name.toLowerCase();
        const mimeType = file.type.toLowerCase();
        const isSupported = options.accept!.some((accepted) => {
          const normalized = accepted.toLowerCase();
          if (normalized.endsWith("/*")) {
            return mimeType.startsWith(normalized.slice(0, -1));
          }
          if (normalized.includes("/")) {
            return mimeType === normalized;
          }
          const ext = normalized.startsWith(".")
            ? normalized
            : `.${normalized}`;
          return lowerName.endsWith(ext);
        });

        if (!isSupported && !options.silent) {
          const ext = file.name.includes(".")
            ? file.name.substring(file.name.lastIndexOf(".")).toLowerCase()
            : file.type || "未知类型";
          customMessage.warning(`不支持的文件类型: ${ext}`);
        }

        return isSupported;
      });
    }

    return validFiles;
  };

  // 处理文件拖放（入口，可能由 H5 或 Tauri 触发）
  const handleFileDrop = async (paths: string[]) => {
    if (isProcessing.value) return;

    try {
      isProcessing.value = true;

      // 验证路径
      const validPaths = await validatePaths(paths);
      if (validPaths.length === 0) {
        return;
      }

      // 保存最后拖放的路径
      lastDroppedPaths.value = validPaths;

      // 触发回调
      if (options.onDrop) {
        await options.onDrop(validPaths);
      }

      // 显示成功消息
      if (options.autoProcess) {
        const message =
          validPaths.length === 1
            ? `已添加: ${validPaths[0].split(/[/\\]/).pop()}`
            : `已添加 ${validPaths.length} 个项目`;
        customMessage.success(message);
      }
    } catch (error: any) {
      errorHandler.error(error, "处理拖放文件失败", { context: { paths } });
      const errorMsg = error.toString();
      if (options.onError) {
        options.onError(errorMsg);
      }
    } finally {
      isProcessing.value = false;
    }
  };

  const handleFilesDrop = async (files: File[]) => {
    if (isProcessing.value || !options.onFiles) return;

    try {
      isProcessing.value = true;

      const validFiles = validateFiles(files);
      if (validFiles.length === 0) {
        return;
      }

      lastDroppedPaths.value = validFiles.map((file) => file.name);
      await options.onFiles(validFiles);

      if (options.autoProcess) {
        const message =
          validFiles.length === 1
            ? `已添加: ${validFiles[0].name}`
            : `已添加 ${validFiles.length} 个项目`;
        customMessage.success(message);
      }
    } catch (error: any) {
      errorHandler.error(error, "处理拖放文件失败", {
        context: { files: files.map((file) => file.name) },
      });
      const errorMsg = error.toString();
      if (options.onError) {
        options.onError(errorMsg);
      }
    } finally {
      isProcessing.value = false;
    }
  };

  // ==================== H5 原生事件处理器 ====================
  const setupNativeListeners = () => {
    const element = getTargetElement();
    if (!element) return;

    const handleDragEnter = (e: DragEvent) => {
      if (isDisabled()) return;
      e.preventDefault();
      isDraggingOver.value = true;
      options.onDragEnter?.();
    };

    const handleDragOver = (e: DragEvent) => {
      if (isDisabled()) return;
      e.preventDefault();
      // dragover 中设置 dragEffect 以显示正确的鼠标样式
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "move";
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      if (isDisabled()) return;
      // 只在真正离开元素时触发（而不是进入子元素时）
      if (!element.contains(e.relatedTarget as Node)) {
        isDraggingOver.value = false;
        options.onDragLeave?.();
      }
    };

    const handleNativeDrop = async (e: DragEvent) => {
      if (isDisabled()) {
        console.log("[useFileDrop] H5 原生 drop 触发，但组件已禁用");
        return;
      }
      e.preventDefault();
      isDraggingOver.value = false;
      options.onDragLeave?.();

      console.log("[useFileDrop] H5 原生 drop 触发");

      // 尝试获取文件名或路径
      const dt = e.dataTransfer;
      if (!dt) {
        console.log("[useFileDrop] H5 原生 drop 触发，但 dataTransfer 为空");
        return;
      }

      // 1. 尝试从 DataTransfer 中解析绝对路径
      const parsedPaths = parsePathsFromDataTransfer(dt);
      console.log("[useFileDrop] H5 原生 drop 解析到的绝对路径:", parsedPaths);

      // 2. 尝试从 files 获取文件名
      const droppedFiles: File[] = [];
      const fileNames: { name: string; size: number; type: string }[] = [];
      if (dt.files && dt.files.length > 0) {
        for (let i = 0; i < dt.files.length; i++) {
          const f = dt.files[i];
          droppedFiles.push(f);
          fileNames.push({
            name: f.name,
            size: f.size,
            type: f.type || "未知",
          });
        }
      }
      console.log("[useFileDrop] H5 原生 drop 获取到的文件名列表:", fileNames);

      // 如果解析到了绝对路径，直接使用（通常是 VSCode 等编辑器拖拽）
      if (parsedPaths.length > 0) {
        console.log(
          "[useFileDrop] H5 原生 drop 直接使用解析到的绝对路径:",
          parsedPaths
        );
        await handleFileDrop(parsedPaths);
        return;
      }

      // 禁用 Tauri 拦截后，系统拖放只能通过 H5 拿到 File 对象，不能拿到绝对路径。
      if (droppedFiles.length > 0 && options.onFiles) {
        console.log("[useFileDrop] H5 原生 drop 使用 File 对象处理");
        await handleFilesDrop(droppedFiles);
        return;
      }

      // 如果只有文件名，等待可能存在的 Tauri 路径；超时后不要把文件名当路径使用。
      if (fileNames.length > 0) {
        const paths = fileNames.map((f) => f.name);
        const finalPaths = await createPendingDrop(paths);

        console.log(
          "[useFileDrop] H5 原生 drop 挂起等待结束，最终路径:",
          finalPaths
        );
        const resolvedToRealPaths =
          finalPaths.length > 0 &&
          (finalPaths.length !== paths.length ||
            finalPaths.some((path, index) => path !== paths[index]));

        if (resolvedToRealPaths) {
          await handleFileDrop(finalPaths);
        } else {
          const message =
            "当前拖放只能读取文件名，无法获取文件绝对路径，请使用文件选择器添加";
          console.warn("[useFileDrop]", message, paths);
          options.onError?.(message);
          if (!options.silent) {
            customMessage.warning(message);
          }
        }
        return;
      }

      console.log("[useFileDrop] H5 原生 drop 未获取到任何有效文件或路径");
    };

    element.addEventListener("dragenter", handleDragEnter);
    element.addEventListener("dragover", handleDragOver);
    element.addEventListener("dragleave", handleDragLeave);
    element.addEventListener("drop", handleNativeDrop);

    nativeListenerCleanups.push(() => {
      element.removeEventListener("dragenter", handleDragEnter);
      element.removeEventListener("dragover", handleDragOver);
      element.removeEventListener("dragleave", handleDragLeave);
      element.removeEventListener("drop", handleNativeDrop);
    });
  };

  // ==================== Tauri 事件监听器 ====================
  const setupTauriCustomListeners = async () => {
    // 监听拖动进入事件
    unlistenDragEnter = await listen("custom-drag-enter", (event: any) => {
      if (isDisabled()) return;

      const element = getTargetElement();
      if (!element) return;

      const { position } = event.payload;
      const rect = element.getBoundingClientRect();

      if (isPositionInRect(position, rect)) {
        isDraggingOver.value = true;
        options.onDragEnter?.();
      }
    });

    // 监听拖动移动事件
    unlistenDragOver = await listen("custom-drag-over", (event: any) => {
      if (isDisabled()) return;

      const element = getTargetElement();
      if (!element) return;

      const { position } = event.payload;
      const rect = element.getBoundingClientRect();
      const isInside = isPositionInRect(position, rect);

      if (isInside !== isDraggingOver.value) {
        isDraggingOver.value = isInside;
        if (!isInside) {
          options.onDragLeave?.();
        }
      }
    });

    // 监听拖动离开事件
    unlistenDragLeave = await listen("custom-drag-leave", () => {
      if (isDisabled()) return;

      isDraggingOver.value = false;
      options.onDragLeave?.();
    });

    // 监听文件放下事件
    unlistenDrop = await listen("custom-file-drop", async (event: any) => {
      if (isDisabled()) return;

      const element = getTargetElement();
      if (!element) return;

      const { paths, position } = event.payload;

      // 清除高亮状态
      isDraggingOver.value = false;

      if (!paths || paths.length === 0) {
        return;
      }

      const rect = element.getBoundingClientRect();
      if (isPositionInRect(position, rect)) {
        await handleFileDrop(paths);
      }
    });
  };

  // ==================== Tauri webview.onDragDropEvent 监听器 ====================
  const setupWebviewDragDropListener = async () => {
    try {
      const { getCurrentWebview } = await import("@tauri-apps/api/webview");
      const webview = getCurrentWebview();
      console.log(
        "[useFileDrop] 成功获取当前 Webview 实例，开始注册 onDragDropEvent"
      );

      unlistenWebviewDragDrop = await webview.onDragDropEvent((event: any) => {
        const { type, position, paths } = event.payload || {};
        console.log(
          `[useFileDrop] Webview 拖放事件触发: type=${type}, paths=`,
          paths,
          "position=",
          position
        );

        if (isDisabled()) {
          console.log("[useFileDrop] Webview 拖放事件触发，但组件已禁用");
          return;
        }

        const element = getTargetElement();
        if (!element) {
          console.log(
            "[useFileDrop] Webview 拖放事件触发，但未找到目标 DOM 元素"
          );
          return;
        }

        const coords = position
          ? { x: position.x, y: position.y }
          : { x: 0, y: 0 };

        if (type === "enter") {
          const rect = element.getBoundingClientRect();
          const isInside = isPositionInRect(coords, rect);
          console.log(
            "[useFileDrop] Webview dragenter, 是否在元素内:",
            isInside,
            "rect=",
            rect,
            "coords=",
            coords
          );
          if (isInside) {
            isDraggingOver.value = true;
            options.onDragEnter?.();
          }
        } else if (type === "over") {
          const rect = element.getBoundingClientRect();
          const isInside = isPositionInRect(coords, rect);

          if (isInside !== isDraggingOver.value) {
            isDraggingOver.value = isInside;
            if (!isInside) {
              options.onDragLeave?.();
            }
          }
        } else if (type === "leave") {
          console.log("[useFileDrop] Webview dragleave");
          isDraggingOver.value = false;
          options.onDragLeave?.();
        } else if (type === "drop") {
          isDraggingOver.value = false;
          const rect = element.getBoundingClientRect();
          const isInside = isPositionInRect(coords, rect);
          console.log(
            "[useFileDrop] Webview drop 触发, 是否在元素内:",
            isInside,
            "paths=",
            paths
          );

          if (paths && paths.length > 0) {
            // 只有当落点在元素内时，才进行处理
            if (isInside) {
              // 如果有挂起的 H5 drop，立即 resolve 它（使用绝对路径）
              const handledByPendingDrop = resolvePendingDrop(paths);
              if (!handledByPendingDrop) {
                handleFileDrop(paths).catch((err) => {
                  console.debug("[useFileDrop] webview drop 处理异常:", err);
                });
              }
            } else {
              console.log(
                "[useFileDrop] Webview drop 触发，但落点不在元素内，忽略"
              );
            }
          }
        }
      });
    } catch (err) {
      // webview.onDragDropEvent 不可用时静默降级
      console.warn(
        "[useFileDrop] webview.onDragDropEvent 注册失败，降级为纯 H5/自定义事件模式:",
        err
      );
    }
  };

  // ==================== 组合设置 ====================
  const setupFileDropListener = async () => {
    // 1. 设置 H5 原生监听器（提供精准的 DOM 级拖拽反馈）
    setupNativeListeners();

    // 2. 设置 Tauri custom-drag-* 事件监听器（Tauri 拖拽拦截器启用时的兜底）
    await setupTauriCustomListeners();

    // 3. 设置 Tauri webview.onDragDropEvent（最底层，提供绝对路径）
    await setupWebviewDragDropListener();
  };

  // 清理监听器
  const cleanup = () => {
    // 清理 H5 原生监听器
    nativeListenerCleanups.forEach((cleanup) => cleanup());
    nativeListenerCleanups.length = 0;

    // 清理 Tauri 事件监听器
    unlistenDrop?.();
    unlistenDragEnter?.();
    unlistenDragOver?.();
    unlistenDragLeave?.();

    // 清理 webview 事件监听器
    unlistenWebviewDragDrop?.();

    // 清除挂起的 drop
    clearPendingDrop();
  };

  // 生命周期
  onMounted(async () => {
    await setupFileDropListener();
  });

  onUnmounted(() => {
    cleanup();
  });

  // 返回状态和方法
  return {
    // 状态
    isDraggingOver,
    isProcessing,
    lastDroppedPaths,
    // 方法
    handleFileDrop,
    cleanup,
    // 重新初始化
    reinitialize: setupFileDropListener,
  };
}

/**
 * 创建一个简单的路径输入拖放功能
 * @param pathRef 路径引用
 * @param options 额外选项
 */
export function usePathDrop(
  pathRef: Ref<string>,
  options: Omit<FileDropOptions, "onDrop"> & {
    autoLoad?: () => void | Promise<void>;
  } = {}
) {
  return useFileDrop({
    ...options,
    multiple: false,
    onDrop: async (paths) => {
      if (paths.length > 0) {
        pathRef.value = paths[0];
        const fileName = paths[0].split(/[/\\]/).pop() || paths[0];
        customMessage.success(`已设置路径: ${fileName}`);

        // 自动加载
        if (options.autoLoad) {
          setTimeout(() => {
            options.autoLoad!();
          }, 500);
        }
      }
    },
  });
}

/**
 * 创建一个文件列表拖放功能
 * @param filesRef 文件列表引用
 * @param options 额外选项
 */
export function useFileListDrop<T = string>(
  filesRef: Ref<T[]>,
  options: Omit<FileDropOptions, "onDrop"> & {
    // 转换函数，将路径转换为自定义类型
    transformer?: (path: string) => T;
    // 去重键函数
    keyGetter?: (item: T) => string;
  } = {}
) {
  return useFileDrop({
    multiple: true,
    ...options,
    onDrop: async (paths) => {
      const transformer =
        options.transformer || ((path: string) => path as unknown as T);
      const keyGetter = options.keyGetter || ((item: T) => String(item));

      const newItems = paths.map(transformer);

      // 去重
      const existingKeys = new Set(filesRef.value.map(keyGetter));
      const uniqueNewItems = newItems.filter(
        (item) => !existingKeys.has(keyGetter(item))
      );

      if (uniqueNewItems.length > 0) {
        filesRef.value.push(...uniqueNewItems);
        customMessage.success(`已添加 ${uniqueNewItems.length} 个项目`);
      } else {
        customMessage.info("所有项目都已存在");
      }
    },
  });
}
