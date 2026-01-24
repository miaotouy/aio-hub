/**
 * 媒体生成输入管理器
 *
 * 功能：
 * - 管理生成提示词 (对接 mediaGenStore)
 * - 管理参考图附件 (对接 mediaGenStore)
 * - 支持跨窗口同步
 */

import { watch } from "vue";
import { useMediaGenStore } from "../stores/mediaGenStore";
import type { Asset } from "@/types/asset-management";
import { createModuleLogger } from "@/utils/logger";
import { getOrCreateInstance } from "@/utils/singleton";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { registerSyncSource } from "@/composables/useStateSyncEngine";
import {
  calculateDiff,
  applyPatches,
  shouldUseDelta,
  VersionGenerator,
} from "@/utils/sync-helpers";
import { MEDIA_GEN_STATE_KEYS } from "../types";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { StateSyncPayload, JsonPatchOperation } from "@/types/window-sync";

const logger = createModuleLogger("media-generator/InputManager");
const errorHandler = createModuleErrorHandler("media-generator/InputManager");

class MediaGenInputManager {
  private store: ReturnType<typeof useMediaGenStore>;
  private bus = useWindowSyncBus();

  // 标记是否正在应用同步状态（避免循环更新）
  private isApplyingSyncState = false;

  // 状态版本号
  private stateVersion = 0;

  // 上次同步的值（用于计算增量）
  private lastSyncedValue: {
    prompt: string;
    attachments: Asset[];
  } = { prompt: "", attachments: [] };

  // 防抖推送计时器
  private pushTimer: ReturnType<typeof setTimeout> | null = null;

  // 监听器清理函数
  private unlistenStateSync: (() => void) | null = null;
  private unregisterSyncSource: (() => void) | null = null;

  constructor() {
    this.store = useMediaGenStore();

    // 初始化上次同步的值
    this.lastSyncedValue = {
      prompt: this.store.inputPrompt,
      attachments: [...this.store.attachments],
    };

    // 监听 store 中的变化并同步到其他窗口
    watch(
      () => this.store.inputPrompt,
      () => {
        if (!this.isApplyingSyncState) {
          this.debouncedPushState();
        }
      }
    );

    watch(
      () => this.store.attachments,
      () => {
        if (!this.isApplyingSyncState) {
          this.debouncedPushState();
        }
      },
      { deep: true }
    );

    // 监听来自其他窗口的状态同步
    this.unlistenStateSync = this.bus.onMessage<StateSyncPayload>("state-sync", (payload) => {
      if (payload.stateType !== MEDIA_GEN_STATE_KEYS.INPUT_STATE) return;

      if (payload.version <= this.stateVersion) {
        return;
      }

      this.isApplyingSyncState = true;
      try {
        let newState;
        if (payload.isFull) {
          newState = payload.data;
        } else {
          newState = applyPatches(
            { prompt: this.store.inputPrompt, attachments: [...this.store.attachments] },
            payload.patches as JsonPatchOperation[]
          );
        }

        // 更新 store
        if (newState.prompt !== undefined) {
          this.store.inputPrompt = newState.prompt;
        }
        if (newState.attachments !== undefined) {
          // 简单的附件同步，实际应用中可能需要更复杂的合并逻辑
          this.store.attachments = newState.attachments;
        }

        this.stateVersion = payload.version;
        this.lastSyncedValue = JSON.parse(JSON.stringify(newState));

        logger.debug("已应用来自其他窗口的输入状态", { version: payload.version });
      } catch (error) {
        errorHandler.handle(error as Error, { userMessage: "应用同步状态失败", showToUser: false });
      } finally {
        this.isApplyingSyncState = false;
      }
    });

    // 注册到全局同步源（仅主窗口和工具窗口）
    if (this.bus.windowType === "main" || this.bus.windowType === "detached-tool") {
      this.unregisterSyncSource = registerSyncSource({
        pushState: async (isFullSync, targetWindowLabel, silent) => {
          this.pushState(isFullSync, targetWindowLabel, silent);
        },
        stateKey: MEDIA_GEN_STATE_KEYS.INPUT_STATE,
      });
    }

    logger.info("MediaGenInputManager 初始化完成");
  }

  /**
   * 防抖推送状态
   */
  private debouncedPushState(): void {
    if (this.pushTimer) {
      clearTimeout(this.pushTimer);
    }
    this.pushTimer = setTimeout(() => {
      this.pushState();
    }, 100);
  }

  /**
   * 推送状态到其他窗口
   */
  public pushState(isFullSync = false, targetWindowLabel?: string, silent = false): void {
    if (this.isApplyingSyncState) return;

    const newValue = {
      prompt: this.store.inputPrompt,
      attachments: [...this.store.attachments],
    };

    const newVersion = VersionGenerator.next();
    const shouldForceFullSync = isFullSync || !shouldUseDelta([], newValue, 0.5);

    if (shouldForceFullSync) {
      this.bus.syncState(
        MEDIA_GEN_STATE_KEYS.INPUT_STATE,
        newValue,
        newVersion,
        true,
        targetWindowLabel
      );
      if (!silent)
        logger.debug("执行全量输入状态同步", {
          version: newVersion,
          targetWindow: targetWindowLabel,
        });
    } else {
      const patches = calculateDiff(this.lastSyncedValue, newValue);
      if (patches.length === 0) return;
      this.bus.syncState(
        MEDIA_GEN_STATE_KEYS.INPUT_STATE,
        patches,
        newVersion,
        false,
        targetWindowLabel
      );
      if (!silent)
        logger.debug("执行增量输入状态同步", {
          version: newVersion,
          patchesCount: patches.length,
          targetWindow: targetWindowLabel,
        });
    }

    this.stateVersion = newVersion;
    this.lastSyncedValue = JSON.parse(JSON.stringify(newValue));
  }

  /**
   * 清理资源
   */
  public destroy(): void {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    if (this.unlistenStateSync) this.unlistenStateSync();
    if (this.unregisterSyncSource) this.unregisterSyncSource();
  }
}

export function useMediaGenInputManager() {
  const store = useMediaGenStore();
  const manager = getOrCreateInstance("MediaGenInputManager", () => new MediaGenInputManager());

  /**
   * 向输入框添加内容
   */
  const addContent = (content: string, position: "append" | "prepend" = "append") => {
    if (!content) return;

    if (position === "append") {
      if (store.inputPrompt && !store.inputPrompt.endsWith("\n")) {
        store.inputPrompt += "\n";
      }
      store.inputPrompt += content;
    } else {
      const contentToAdd = content.endsWith("\n") ? content : content + "\n";
      store.inputPrompt = contentToAdd + store.inputPrompt;
    }

    logger.info("添加内容到输入框", {
      position,
      contentLength: content.length,
    });
  };

  /**
   * 设置输入框内容（完全覆盖）
   */
  const setContent = (content: string) => {
    store.inputPrompt = content;
    logger.info("设置输入框内容", { contentLength: content.length });
  };

  /**
   * 获取输入框内容
   */
  const getContent = () => {
    return store.inputPrompt;
  };

  /**
   * 清空输入框和附件
   */
  const clear = () => {
    store.inputPrompt = "";
    store.clearAttachments();
    logger.info("清空输入框和附件");
  };

  /**
   * 添加单个资产
   */
  const addAsset = (asset: Asset) => {
    return store.addAsset(asset);
  };

  /**
   * 批量添加资产
   */
  const addAssets = (assets: Asset[]) => {
    let successCount = 0;
    for (const asset of assets) {
      if (store.addAsset(asset)) {
        successCount++;
      }
    }
    logger.info("批量添加资产", { count: assets.length, success: successCount });
    return successCount;
  };

  /**
   * 移除附件
   */
  const removeAttachment = (assetId: string) => {
    store.removeAttachment(assetId);
  };

  /**
   * 清空所有附件
   */
  const clearAttachments = () => {
    store.clearAttachments();
  };

  /**
   * 获取所有附件
   */
  const getAttachments = () => {
    return store.attachments;
  };

  return {
    // 状态
    inputPrompt: store.inputPrompt,
    attachments: store.attachments,
    attachmentCount: store.attachmentCount,
    hasAttachments: store.hasAttachments,
    isAttachmentsFull: store.isAttachmentsFull,
    maxAttachmentCount: store.maxAttachmentCount,

    // 方法
    addContent,
    setContent,
    getContent,
    clear,
    addAsset,
    addAssets,
    removeAttachment,
    clearAttachments,
    getAttachments,

    // 同步
    pushState: manager.pushState.bind(manager),
  };
}
