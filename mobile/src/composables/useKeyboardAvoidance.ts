import { ref } from "vue";
import { createModuleLogger } from "@/utils/logger";

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
  // 截图显示 vv.height 可能会失效（保持不变），此时尝试对比 window.innerHeight
  // 在 adjustResize 模式下，window.innerHeight 应该会变小
  const docHeight = document.documentElement.clientHeight;
  const currentHeight = Math.min(vv.height, window.innerHeight, docHeight);
  const rawHeight = maxWindowHeight - currentHeight - vv.offsetTop;

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
    bodyClientHeight: document.body.clientHeight
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

    // 初始化时立即计算一次
    updateHeight();

    logger.info("Keyboard avoidance initialized (VisualViewport + RAF)", { maxWindowHeight });
  }

  return {
    keyboardHeight,
    isKeyboardVisible,
  };
}
