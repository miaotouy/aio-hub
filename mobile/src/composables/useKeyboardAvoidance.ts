import { ref } from "vue";
import { createModuleLogger } from "@/utils/logger";
import { listen } from "@tauri-apps/api/event";

const logger = createModuleLogger("KeyboardAvoidance");

/**
 * 全局键盘避让 composable
 *
 * 核心原理：
 * - 使用 window.visualViewport API 精确计算键盘高度
 * - 公式：keyboardHeight = window.innerHeight - visualViewport.height - visualViewport.offsetTop
 * - 剔除 visualViewport.offsetTop 以排除状态栏/地址栏偏移干扰
 * - 使用 requestAnimationFrame 节流，确保高度变化与屏幕刷新同步
 *
 * 建议配合 AndroidManifest.xml 中的 windowSoftInputMode="adjustResize" 使用。
 */

// 单例状态
const keyboardHeight = ref(0);
const isKeyboardVisible = ref(false);
// 记录最大高度，用于在各种模式下准确计算键盘高度
let maxWindowHeight = window.innerHeight;

let rafId: number | null = null;
let isInitialized = false;

/** 核心更新函数 */
const updateHeight = () => {
  const vv = window.visualViewport;
  if (!vv) return;

  // 动态更新最大高度，防止初始化时高度捕获不准（比如在有工具栏的情况下加载）
  // 只有当 vv.height 明显大于当前记录的最大高度时才更新，确保记录的是无键盘状态
  if (vv.height > maxWindowHeight) {
    maxWindowHeight = vv.height;
  }

  // 核心公式：
  // 在 enableEdgeToEdge 模式下，window.innerHeight 可能会被系统锁死在全屏高度。
  // 我们使用初始化时捕获的 maxWindowHeight 作为绝对基准。
  // 键盘高度 = 基准高度 - 当前可见高度 - 偏移量
  // 注意：减去 vv.offsetTop 是为了排除状态栏/沉浸式区域的干扰
  const currentVVHeight = vv.height;
  const currentVVOffset = vv.offsetTop;

  // 计算逻辑：即使窗口没被压缩，vv.height 也会因为键盘弹出而缩减
  const rawHeight = maxWindowHeight - currentVVHeight - currentVVOffset;

  // 阈值过滤：小于 40px 视为 viewport 抖动（如地址栏伸缩），忽略处理
  const height = rawHeight < 40 ? 0 : rawHeight;
  const visible = height > 0;

  // 如果状态没变，跳过更新
  if (keyboardHeight.value === height && isKeyboardVisible.value === visible) return;

  keyboardHeight.value = height;
  isKeyboardVisible.value = visible;

  // 同步到 CSS 变量，供全局使用
  document.documentElement.style.setProperty("--keyboard-height", `${height}px`);

  // class 控制
  document.documentElement.classList.toggle("keyboard-visible", visible);

  logger.debug("Keyboard state updated", {
    height,
    visible,
    windowInnerHeight: window.innerHeight,
    maxWindowHeight,
    vvHeight: vv.height,
    vvOffset: vv.offsetTop,
    docClientHeight: document.documentElement.clientHeight,
    docOffsetHeight: document.documentElement.offsetHeight,
    bodyClientHeight: document.body.clientHeight,
  });
};

/** RAF 节流的 resize handler */
const handleViewportResize = () => {
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    updateHeight();
  });
};

/** focusin 兜底：确保焦点切换时即时触发高度重算 */
const handleFocusIn = (e: FocusEvent) => {
  const target = e.target as HTMLElement;
  if (!target) return;

  // 只对会唤起键盘的元素做响应
  const isInputish =
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable ||
    target.closest(".var-input") !== null ||
    target.classList.contains("var-input__input") ||
    target.classList.contains("native-input");

  if (!isInputish) return;

  // 延迟一小段时间，让键盘状态稳定后再计算
  // 注意：直接使用 RAF 而不是 setTimeout，保证与下一帧同步
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      updateHeight();
    });
  });
};

/** focusout：失去焦点时检查是否需要关闭键盘状态 */
const handleFocusOut = () => {
  setTimeout(() => {
    const activeEl = document.activeElement;
    if (
      activeEl &&
      (activeEl.tagName === "INPUT" ||
        activeEl.tagName === "TEXTAREA" ||
        activeEl.closest(".var-input") ||
        activeEl.classList.contains("native-input"))
    ) {
      return; // 焦点仍然在某个输入框上，不关闭
    }
    updateHeight();
  }, 200);
};

/**
 * 全局键盘避让 composable
 *
 * 单例模式：在整个应用生命周期中只注册一次事件监听，
 * 所有调用方共享同一份键盘高度状态。
 */
export function useKeyboardAvoidance() {
  // 仅在首次调用时注册监听
  if (!isInitialized) {
    isInitialized = true;

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleViewportResize);
      window.visualViewport.addEventListener("scroll", handleViewportResize);
    }
    // 兜底：focusin 和 resize 事件
    window.addEventListener("resize", handleViewportResize);
    window.addEventListener("focusin", handleFocusIn);
    window.addEventListener("focusout", handleFocusOut);

    // 初始化时尝试从 CSS 获取初始安全区（兜底）
    const detector = document.createElement("div");
    detector.style.paddingTop = "env(safe-area-inset-top, 0px)";
    detector.style.paddingBottom = "env(safe-area-inset-bottom, 0px)";
    detector.style.visibility = "hidden";
    detector.style.position = "absolute";
    document.body.appendChild(detector);
    const s = getComputedStyle(detector);
    document.documentElement.style.setProperty("--safe-area-inset-top", s.paddingTop);
    document.documentElement.style.setProperty("--safe-area-inset-bottom", s.paddingBottom);
    document.body.removeChild(detector);

    // 统一处理 Insets 变化
    const handleInsetsChange = (payload: {
      top: number;
      bottom: number;
      imeVisible: boolean;
      imeHeight: number;
      density: number;
    }) => {
      const { imeHeight, imeVisible, top, bottom, density } = payload;

      // 原生层传过来的是 px (像素)，转换为 CSS 像素
      const height = imeHeight / density;
      const safeTop = top / density;
      const safeBottom = bottom / density;

      // 同步安全区到 CSS 变量
      // 注意：由于原生端已经对 WebView 容器应用了 padding-bottom，
      // 这里的 safeBottom 仅作为元数据同步，前端不应再次将其加在 App 容器上。
      document.documentElement.style.setProperty("--safe-area-inset-top", `${safeTop}px`);
      document.documentElement.style.setProperty("--safe-area-inset-bottom", `${safeBottom}px`);

      // 实时键盘高度（仅供某些特殊 UI 偏移使用，App 主容器不再依赖此变量避让）
      const currentKeyboardHeight = imeVisible ? height : 0;

      if (keyboardHeight.value === currentKeyboardHeight && isKeyboardVisible.value === imeVisible) return;

      keyboardHeight.value = currentKeyboardHeight;
      isKeyboardVisible.value = imeVisible;

      document.documentElement.style.setProperty("--keyboard-height", `${currentKeyboardHeight}px`);
      document.documentElement.classList.toggle("keyboard-visible", imeVisible);

      logger.debug("Keyboard state updated from Android Insets", {
        height: currentKeyboardHeight,
        visible: imeVisible,
        safeTop,
        safeBottom,
      });
    };

    // 监听来自 Android 原生层的 Insets 变化事件 (Tauri Event)
    listen<any>("android-insets-changed", (event) => {
      handleInsetsChange(event.payload);
    });

    // 监听来自 Android 原生层的 Insets 变化事件 (Window CustomEvent - 兜底)
    window.addEventListener("android-insets-changed", (event: any) => {
      handleInsetsChange(event.detail);
    });

    // 初始化时立即计算一次
    updateHeight();

    // 尝试从全局变量读取初始 Insets (由原生端注入)
    if ((window as any).__ANDROID_INSETS__) {
      logger.info("Initial Insets found in window.__ANDROID_INSETS__");
      handleInsetsChange((window as any).__ANDROID_INSETS__);
    }

    logger.info("Keyboard avoidance initialized (VisualViewport + Android Insets)", { maxWindowHeight });
  }

  return {
    keyboardHeight,
    isKeyboardVisible,
  };
}
