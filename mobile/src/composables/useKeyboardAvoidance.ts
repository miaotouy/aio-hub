import { ref, onMounted } from "vue";
import { debounce } from "lodash-es";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("KeyboardAvoidance");

// 单例状态
const keyboardHeight = ref(0);
const isKeyboardVisible = ref(false);
const isSimulated = ref(false);
let initialHeight = window.innerHeight;
let isInitialized = false;

/**
 * 全局键盘避让 composable
 * 综合利用 visualViewport, resize, focus 事件以及 MutationObserver
 * 确保在真机和各种模拟器环境下都能尽可能准确地检测键盘状态
 */
export function useKeyboardAvoidance() {
  const setKeyboardState = (visible: boolean, height: number, simulated = false) => {
    if (isKeyboardVisible.value === visible && keyboardHeight.value === height && isSimulated.value === simulated) {
      return;
    }

    logger.debug("Keyboard state changing", { visible, height, simulated });

    isKeyboardVisible.value = visible;
    keyboardHeight.value = height;
    isSimulated.value = simulated;

    document.documentElement.style.setProperty("--keyboard-height", `${height}px`);

    // 计算可用视口高度：在模拟模式下需要减去预估高度，非模拟模式下 window.innerHeight 已经反映了变化
    let viewportH = initialHeight;
    if (visible) {
      if (simulated) {
        // 关键修复：模拟模式下，因为 window.innerHeight 没变，必须手动减去预估高度
        viewportH = initialHeight - height;
      } else {
        viewportH = window.visualViewport?.height || window.innerHeight;
      }
    }

    document.documentElement.style.setProperty("--viewport-height", `${viewportH}px`);

    if (visible) {
      document.documentElement.classList.add("keyboard-visible");
      if (simulated) {
        document.documentElement.classList.add("keyboard-simulated");
      } else {
        document.documentElement.classList.remove("keyboard-simulated");
      }
    } else {
      document.documentElement.classList.remove("keyboard-visible");
      document.documentElement.classList.remove("keyboard-simulated");
    }
  };

  const updateKeyboardState = () => {
    // 1. 优先尝试 visualViewport (真机/现代浏览器)
    if (window.visualViewport) {
      const vv = window.visualViewport;
      // 注意：在 iOS 上，vv.height 会随键盘弹出而减小
      // 但在某些 Android 浏览器上，vv.height 不变，而是整个 body 被推上去
      const diff = Math.max(0, initialHeight - vv.height);

      // 降低阈值到 50，并增加对 offsetTop 的敏感度
      if (diff > 50 || vv.offsetTop > 20) {
        const finalHeight = diff > 50 ? diff : vv.offsetTop;
        logger.debug("Detected via visualViewport", {
          initialHeight,
          innerHeight: window.innerHeight,
          vvHeight: vv.height,
          vvOffset: vv.offsetTop,
          finalHeight
        });
        setKeyboardState(true, finalHeight, false);

        // 精准避让逻辑
        const activeEl = document.activeElement as HTMLElement;
        if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.closest('.var-input'))) {
          setTimeout(() => {
            const rect = activeEl.getBoundingClientRect();
            const realViewportHeight = window.visualViewport?.height || window.innerHeight;
            const effectiveViewportHeight = isSimulated.value
              ? realViewportHeight - keyboardHeight.value
              : realViewportHeight;

            const isObscured = rect.bottom > (effectiveViewportHeight - 20) || rect.top < 60;

            if (isObscured) {
              activeEl.scrollIntoView({ block: "center", behavior: "smooth" });
            }
          }, 300);
        }
        return;
      }
    }

    // 2. 尝试 window.innerHeight 差值 (Android 模拟器常用)
    const currentHeight = window.innerHeight;
    const heightDiff = initialHeight - currentHeight;

    // 如果当前高度明显大于初始高度，说明初始高度记录错了（可能记录到了带键盘的高度）
    if (currentHeight > initialHeight + 50) {
      logger.info("Updating initialHeight (was too small)", { old: initialHeight, new: currentHeight });
      initialHeight = currentHeight;
    }

    if (heightDiff > 150) {
      setKeyboardState(true, heightDiff, false);
      return;
    }

    // 3. 检查当前是否有聚焦的输入框 (保底逻辑)
    const activeEl = document.activeElement;
    const isInputFocused = !!(activeEl && (
      activeEl.tagName === "INPUT" ||
      activeEl.tagName === "TEXTAREA" ||
      (activeEl as HTMLElement).isContentEditable ||
      activeEl.closest('.var-input') ||
      // 增加对 Varlet 输入框内部 input 的识别
      activeEl.classList.contains('var-input__input')
    ));

    // 关键修正：只要输入框还聚焦，绝对不允许关闭键盘状态
    if (isInputFocused) {
      if (isKeyboardVisible.value) return; // 已经开了就别动了

      // 如果没开，但我们确定它聚焦了，说明系统没给高度反馈
      // 这里的逻辑交给 handleFocusIn 去处理强制开启
      return;
    }

    // 只有在确定没有输入框聚焦时，才允许关闭
    setKeyboardState(false, 0);
  };

  const debouncedUpdate = debounce(updateKeyboardState, 150);

  const handleFocusIn = (e: FocusEvent) => {
    logger.debug("FocusIn detected", { target: (e.target as HTMLElement).tagName });

    setTimeout(() => {
      updateKeyboardState();

      setTimeout(() => {
        const activeEl = document.activeElement;
        if (activeEl === e.target && !isKeyboardVisible.value) {
          logger.info("Force enabling keyboard state via focus (Viewport height unchange)");
          // 增加预估高度到 45% 或最小 300px，确保能顶起来
          const estimatedHeight = Math.max(300, Math.floor(initialHeight * 0.45));
          setKeyboardState(true, estimatedHeight, true);

          if (activeEl instanceof HTMLElement) {
            logger.debug("Force scrolling after simulated focus");
            activeEl.scrollIntoView({ block: "center", behavior: "smooth" });
          }
        }
      }, 100);
    }, 100);
  };

  const handleFocusOut = () => {
    setTimeout(() => {
      const activeEl = document.activeElement;
      const isStillInput = activeEl && (
        activeEl.tagName === "INPUT" ||
        activeEl.tagName === "TEXTAREA" ||
        activeEl.closest('.var-input')
      );
      if (!isStillInput) {
        setKeyboardState(false, 0);
      }
    }, 200);
  };

  let observer: MutationObserver | null = null;

  onMounted(() => {
    if (isInitialized) return;
    isInitialized = true;

    // 只有在确定没有键盘时才更新初始高度
    if (!isKeyboardVisible.value) {
      initialHeight = window.innerHeight;
    }

    window.addEventListener("resize", debouncedUpdate);
    window.addEventListener("focusin", handleFocusIn);
    window.addEventListener("focusout", handleFocusOut);

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", debouncedUpdate);
      window.visualViewport.addEventListener("scroll", debouncedUpdate);
    }

    observer = new MutationObserver(debouncedUpdate);
    observer.observe(document.body, { attributes: true, childList: true, subtree: true });

    updateKeyboardState();
  });

  // 注意：单例模式下通常不需要在组件卸载时移除监听，除非是 App 卸载

  return {
    keyboardHeight,
    isKeyboardVisible,
    isSimulated,
  };
}
