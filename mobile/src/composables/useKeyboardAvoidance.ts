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
      const vv = window.visualViewport;
      const diff = Math.max(0, initialHeight - vv.height);
      
      if (diff > 80 || vv.offsetTop > 40) {
        const finalHeight = diff > 80 ? diff : vv.offsetTop;
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
          const estimatedHeight = Math.floor(initialHeight * 0.4);
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
    initialHeight = window.innerHeight;

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
