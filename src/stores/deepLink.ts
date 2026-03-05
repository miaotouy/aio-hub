import { defineStore } from "pinia";
import { ref } from "vue";
import type { LlmProfile } from "@/types/llm-profiles";

export const useDeepLinkStore = defineStore("deepLink", () => {
  const isConfirmVisible = ref(false);
  const pendingProfile = ref<LlmProfile | null>(null);
  const pendingUrl = ref<string>("");

  /**
   * 显示确认弹窗
   */
  const showConfirm = (profile: LlmProfile, url: string) => {
    pendingProfile.value = profile;
    pendingUrl.value = url;
    isConfirmVisible.value = true;
  };

  /**
   * 关闭确认弹窗
   */
  const closeConfirm = () => {
    isConfirmVisible.value = false;
    // 延迟清空，防止关闭动画中内容消失
    setTimeout(() => {
      if (!isConfirmVisible.value) {
        pendingProfile.value = null;
        pendingUrl.value = "";
      }
    }, 300);
  };

  return {
    isConfirmVisible,
    pendingProfile,
    pendingUrl,
    showConfirm,
    closeConfirm,
  };
});