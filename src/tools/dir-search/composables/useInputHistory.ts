import { ref, type Ref } from "vue";
import { watchDebounced } from "@vueuse/core";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("dir-search/useInputHistory");

/**
 * 键盘历史记录回溯 composable
 *
 * 在输入框中通过 ArrowUp/ArrowDown 切换历史记录，
 * 零 UI 负担，不增加任何下拉框或弹出层。
 *
 * 交互逻辑：
 * - 光标在首行 + ArrowUp → 切换到上一条历史记录
 * - 光标在末行 + ArrowDown → 切换到下一条历史记录
 * - Escape → 退出历史浏览，恢复当前输入
 * - 任何其他按键 → 退出历史浏览模式（不恢复，允许在历史值基础上编辑）
 *
 * 设计决策：不使用 watch 监听 currentValue 变化，
 * 因为 defineModel 的多层传播链会导致 watch 时序不可控。
 * 改为纯 keydown 驱动的状态机。
 */
export function useInputHistory(historyArray: Ref<string[]>, currentValue: Ref<string>) {
  /** 当前浏览的历史索引，-1 表示不在历史浏览模式 */
  const historyIndex = ref(-1);
  /** 进入历史浏览前保存的原始输入 */
  let savedInput = "";

  /**
   * 检测光标是否在 textarea 的首行
   */
  function isCursorOnFirstLine(el: HTMLTextAreaElement | HTMLInputElement): boolean {
    if (el.tagName === "INPUT") return true;
    const textarea = el as HTMLTextAreaElement;
    const cursorPos = textarea.selectionStart ?? 0;
    const textBefore = textarea.value.substring(0, cursorPos);
    return !textBefore.includes("\n");
  }

  /**
   * 检测光标是否在 textarea 的末行
   */
  function isCursorOnLastLine(el: HTMLTextAreaElement | HTMLInputElement): boolean {
    if (el.tagName === "INPUT") return true;
    const textarea = el as HTMLTextAreaElement;
    const cursorPos = textarea.selectionEnd ?? 0;
    const textAfter = textarea.value.substring(cursorPos);
    return !textAfter.includes("\n");
  }

  /**
   * 绑定到输入框的 keydown 事件处理器
   */
  function onKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLTextAreaElement | HTMLInputElement;
    const history = historyArray.value;

    // 导航键处理
    if (e.key === "ArrowUp" && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (!isCursorOnFirstLine(target)) return; // 多行 textarea 内部移动，不拦截
      if (history.length === 0) {
        logger.debug("ArrowUp 但历史为空，跳过", { historyArrayLength: history.length });
        return;
      }

      e.preventDefault();

      if (historyIndex.value === -1) {
        savedInput = currentValue.value;
        // 如果当前为空，第一下 ArrowUp 直接显示最近的一条历史 (索引 0)
        // 如果当前不为空，第一下 ArrowUp 也是显示最近的一条历史
        historyIndex.value = 0;
      } else if (historyIndex.value < history.length - 1) {
        historyIndex.value++;
      } else {
        return; // 已到最旧记录
      }

      currentValue.value = history[historyIndex.value];
      logger.debug(`历史↑ [${historyIndex.value}/${history.length}]`, {
        value: history[historyIndex.value],
        allHistory: formatHistoryForLog(history),
      });
      return;
    }

    if (e.key === "ArrowDown" && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (historyIndex.value === -1) {
        logger.debug("ArrowDown 但不在历史模式，跳过");
        return;
      }
      if (!isCursorOnLastLine(target)) return;

      e.preventDefault();

      if (historyIndex.value > 0) {
        historyIndex.value--;
        currentValue.value = history[historyIndex.value];
        logger.debug(`历史↓ [${historyIndex.value}/${history.length}]`, {
          value: history[historyIndex.value],
          allHistory: formatHistoryForLog(history),
        });
      } else {
        // 回到原始输入
        historyIndex.value = -1;
        currentValue.value = savedInput;
        logger.debug("历史↓ 退出，恢复原始输入", {
          savedInput,
          allHistory: formatHistoryForLog(history),
        });
      }
      return;
    }

    if (e.key === "Escape" && historyIndex.value !== -1) {
      e.preventDefault();
      historyIndex.value = -1;
      currentValue.value = savedInput;
      logger.debug("Escape 退出历史模式");
      return;
    }

    // 其他任何产生输入的按键 → 退出历史模式（不恢复值，允许在历史值基础上编辑）
    if (historyIndex.value !== -1 && !isModifierOnly(e)) {
      logger.debug("非导航键退出历史模式", { key: e.key });
      historyIndex.value = -1;
    }
  }

  return {
    onKeydown,
    historyIndex,
  };
}

/**
 * 自动保存历史记录的 Composable
 *
 * 交互逻辑：
 * - 监听 currentValue 变化
 * - 停止输入 2.5s 后，如果值不为空且与历史记录不重复，则推入历史
 */
export function useAutoSaveHistory(
  historyArray: Ref<string[]>,
  currentValue: Ref<string>,
  options: { maxLength?: number; debounce?: number } = {}
) {
  const { maxLength = 20, debounce = 2500 } = options;

  watchDebounced(
    currentValue,
    (newValue) => {
      if (newValue.trim()) {
        pushToHistory(historyArray, newValue, maxLength);
      }
    },
    { debounce }
  );
}

/** 判断是否为纯修饰键（不产生输入） */
function isModifierOnly(e: KeyboardEvent): boolean {
  return (
    e.key === "Shift" ||
    e.key === "Control" ||
    e.key === "Alt" ||
    e.key === "Meta" ||
    e.key === "CapsLock" ||
    e.key === "Tab" ||
    // Ctrl/Alt/Meta 组合键不退出（如 Ctrl+C 复制）
    e.ctrlKey ||
    e.altKey ||
    e.metaKey
  );
}

/**
 * 格式化历史记录用于日志打印（带序号）
 */
function formatHistoryForLog(arr: string[]) {
  return arr.map((item, i) => `${i}: ${item}`);
}

/**
 * 向历史数组中推入新记录
 *
 * 优化逻辑以解决“乱序”感：
 * 1. 如果值已在历史中（无论在哪），则保持现状，不重排。
 *    这是为了防止自动搜索（watchDebounced）在用户翻阅历史时把当前项提到第一位，
 *    导致用户脚下的数组索引发生偏移，产生“滚动感”。
 * 2. 只有全新的值才会 unshift 到最前面。
 */
export function pushToHistory(historyArray: Ref<string[]>, value: string, maxLength: number = 20) {
  const trimmed = value.trim();
  if (!trimmed) return;

  const arr = historyArray.value;

  // 如果值已经存在于历史中，保持顺序不动，避免导航时索引偏移
  if (arr.includes(trimmed)) {
    return;
  }

  // 全新值：推入最前 + 截断
  const newArr = [trimmed, ...arr].slice(0, maxLength);

  // 一次性赋值，确保原子性
  historyArray.value = newArr;

  logger.debug("pushToHistory (New Value)", {
    pushed: trimmed,
    allHistory: formatHistoryForLog(newArr),
  });
}
