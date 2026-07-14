import { computed, type MaybeRef, toValue } from "vue";
import type { PresetMessage, PresetMessageGroup } from "../types/agent";

/**
 * 不依赖运行时服务的轻量估算。中文、英文混排场景以约 3.5 字符/token 作为提示值，
 * 它只用于编辑期预警，实际请求 token 仍由模型服务端计算。
 */
export function usePresetTokenCalculator(
  messages: MaybeRef<PresetMessage[] | undefined>,
  groups?: MaybeRef<PresetMessageGroup[] | undefined>
) {
  const totalTokens = computed(() =>
    (toValue(messages) || [])
      .filter((message) => {
        if (message.isEnabled === false) return false;
        const group = (toValue(groups) || []).find((item) => item.id === message.groupId);
        return group?.enabled !== false;
      })
      .reduce((sum, message) => sum + Math.ceil(message.content.length / 3.5), 0)
  );

  function estimate(content: string): number {
    return Math.ceil(content.length / 3.5);
  }

  return { totalTokens, estimate };
}
