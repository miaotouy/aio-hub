import { ref, onMounted, onUnmounted } from "vue";
import { debounce } from "lodash-es";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("KeyboardAvoidance");

/**
 * 全局键盘避让 composable
 * 综合利用 visualViewport, resize, focus 事件以及 MutationObserver
 * 确保在真机和各种模拟器环境下都能尽可能准确地检测键盘状态
 */
export function useKeyboardAvoidance() {
  const keyboardHeight = ref(0);
  const isKeyboardVisible = ref(false);
  const isSimulated = ref(false);

  // 记录初始高度（无键盘状态）
  let initialHeight = window.innerHeight;

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
    const viewportH = visible
      ? (window.visualViewport?.height || window.innerHeight)
      : initialHeight;

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
      const diff = window.innerHeight - window.visualViewport.height;
      if (diff > 80) {
        logger.debug("Detected via visualViewport", {
          innerHeight: window.innerHeight,
          viewportHeight: window.visualViewport.height,
          diff
        });
        setKeyboardState(true, diff, false);
        return;
      }
    }

    // 2. 尝试 window.innerHeight 差值 (Android 模拟器常用)
    const currentHeight = window.innerHeight;
    const heightDiff = initialHeight - currentHeight;

    // 如果高度减少超过 150px，通常是键盘弹出
    if (heightDiff > 150) {
      setKeyboardState(true, heightDiff, false);
      return;
    }

    // 3. 检查当前是否有聚焦的输入框 (保底逻辑)
    const activeEl = document.activeElement;
    const isInputFocused = activeEl && (
      activeEl.tagName === "INPUT" ||
      activeEl.tagName === "TEXTAREA" ||
      (activeEl as HTMLElement).isContentEditable ||
      activeEl.closest('.var-input')
    );

    if (!isInputFocused) {
      setKeyboardState(false, 0);
    }
  };

  const debouncedUpdate = debounce(updateKeyboardState, 150);

  const handleFocusIn = (e: FocusEvent) => {
    // 模拟器可能不触发 resize，我们在 focus 后延迟强制检查一次
    setTimeout(() => {
      updateKeyboardState();
      // 如果 250ms 后还是没检测到高度变化，但输入框确实聚焦了，启动模拟模式
      // 缩短时间以配合组件内部的滚动逻辑
      setTimeout(() => {
        if (!isKeyboardVisible.value && document.activeElement === e.target) {
          logger.info("No height change detected after focus, using simulation");
          // 预估键盘高度为屏幕的 40%
          setKeyboardState(true, Math.floor(initialHeight * 0.4), true);
        }
      }, 150);
    }, 100);
  };

  const handleFocusOut = () => {
    // 延迟检查，防止从一个输入框跳到另一个时闪烁
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
    initialHeight = window.innerHeight;

    window.addEventListener("resize", debouncedUpdate);
    window.addEventListener("focusin", handleFocusIn);
    window.addEventListener("focusout", handleFocusOut);

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", debouncedUpdate);
      window.visualViewport.addEventListener("scroll", debouncedUpdate);
    }

    // 监听 body 属性变化作为最后的保底
    observer = new MutationObserver(debouncedUpdate);
    observer.observe(document.body, { attributes: true, childList: true, subtree: true });

    updateKeyboardState();
  });

  onUnmounted(() => {
    window.removeEventListener("resize", debouncedUpdate);
    window.removeEventListener("focusin", handleFocusIn);
    window.removeEventListener("focusout", handleFocusOut);

    if (window.visualViewport) {
      window.visualViewport.removeEventListener("resize", debouncedUpdate);
      window.visualViewport.removeEventListener("scroll", debouncedUpdate);
    }

    observer?.disconnect();
  });

  return {
    keyboardHeight,
    isKeyboardVisible,
    isSimulated,
  };
}
