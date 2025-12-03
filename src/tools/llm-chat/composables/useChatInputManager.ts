/**
 * 全局聊天输入管理器
 *
 * 功能：
 * - 管理输入框文本内容（全局单例）
 * - 管理附件列表（复用 useAttachmentManager）
 * - 支持 localStorage 持久化
 * - 支持跨窗口同步
 *
 * 设计理念：
 * - 单例模式：确保主窗口和分离窗口共享同一份状态
 * - 自动持久化：文本内容变化自动保存到 localStorage
 * - 自动同步：内容变化自动同步到其他窗口
 */

import { ref, watch, type Ref } from "vue";
import { getOrCreateInstance } from "@/utils/singleton";
import { useAttachmentManager, type UseAttachmentManagerReturn } from "./useAttachmentManager";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { registerSyncSource } from "@/composables/useStateSyncEngine";
import {
  calculateDiff,
  applyPatches,
  shouldUseDelta,
  VersionGenerator,
} from "@/utils/sync-helpers";
import { CHAT_STATE_KEYS } from "../types/sync";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { Asset } from "@/types/asset-management";
import type { StateSyncPayload, JsonPatchOperation } from "@/types/window-sync";
import type { ModelIdentifier } from "../types";

const logger = createModuleLogger("ChatInputManager");
const errorHandler = createModuleErrorHandler("ChatInputManager");

const STORAGE_KEY = "llm-chat-input-draft";

/**
 * 持久化的状态结构
 */
interface ChatInputDraft {
  text: string;
  attachments: Asset[];
  temporaryModel?: ModelIdentifier | null;
  timestamp: number;
}

/**
 * 聊天输入管理器类（单例）
 */
class ChatInputManager {
  // 输入框文本
  public inputText: Ref<string> = ref("");
  // 临时指定的模型
  public temporaryModel: Ref<ModelIdentifier | null> = ref(null);

  // 用于跨窗口同步的状态对象（可写的 ref）
  public syncState: Ref<{
    text: string;
    attachments: Asset[];
    temporaryModel: ModelIdentifier | null;
  }> = ref({
    text: "",
    attachments: [],
    temporaryModel: null,
  });

  // 附件管理器实例
  public attachmentManager: UseAttachmentManagerReturn;

  // 防抖保存计时器
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  // 标记是否正在应用同步状态（避免循环更新）
  private isApplyingSyncState = false;

  // 窗口同步总线
  private bus = useWindowSyncBus();

  // 状态版本号
  private stateVersion = 0;

  // 上次同步的值
  private lastSyncedValue: {
    text: string;
    attachments: Asset[];
    temporaryModel: ModelIdentifier | null;
  } = { text: "", attachments: [], temporaryModel: null };

  // 防抖推送计时器
  private pushTimer: ReturnType<typeof setTimeout> | null = null;

  // 监听器清理函数
  private unlistenStateSync: (() => void) | null = null;
  private unregisterSyncSource: (() => void) | null = null;

  constructor() {
    // 创建附件管理器
    this.attachmentManager = useAttachmentManager({
      maxCount: 20,
      maxFileSize: 50 * 1024 * 1024,
    });

    // 从 localStorage 恢复状态
    this.restoreFromStorage();

    // 初始化同步状态（从 attachmentManager 获取当前附件）
    this.syncState.value = {
      text: this.inputText.value,
      attachments: [...this.attachmentManager.attachments.value],
      temporaryModel: this.temporaryModel.value,
    };
    this.lastSyncedValue = {
      text: this.inputText.value,
      attachments: [...this.attachmentManager.attachments.value],
      temporaryModel: this.temporaryModel.value,
    };

    // 监听输入框文本变化，同步到 syncState（用于跨窗口同步）
    watch(this.inputText, (newText) => {
      if (!this.isApplyingSyncState) {
        this.syncState.value = {
          ...this.syncState.value,
          text: newText,
        };
        // 防抖推送到其他窗口
        this.debouncedPushState();
      }
      this.debouncedSaveToStorage();
    });

    // 监听附件变化，同步到 syncState 和 localStorage
    watch(
      () => this.attachmentManager.attachments.value,
      (newAttachments) => {
        if (!this.isApplyingSyncState) {
          this.syncState.value = {
            ...this.syncState.value,
            attachments: [...newAttachments],
          };
          // 防抖推送到其他窗口
          this.debouncedPushState();
          // 附件变化也需要保存到 localStorage
          this.debouncedSaveToStorage();
        }
      },
      { deep: true }
    );

    // 监听临时模型变化
    watch(this.temporaryModel, (newModel) => {
      if (!this.isApplyingSyncState) {
        this.syncState.value = {
          ...this.syncState.value,
          temporaryModel: newModel,
        };
        this.debouncedPushState();
      }
      this.debouncedSaveToStorage();
    });

    // 监听 syncState 变化，同步回 inputText 和附件（来自其他窗口的更新）
    watch(
      this.syncState,
      (newState) => {
        this.isApplyingSyncState = true;

        // 同步文本
        if (newState.text !== this.inputText.value) {
          this.inputText.value = newState.text;
          logger.debug("从同步状态更新输入框", { textLength: newState.text.length });
        }

        // 同步附件
        if (
          JSON.stringify(newState.attachments) !==
          JSON.stringify(this.attachmentManager.attachments.value)
        ) {
          // 清空现有附件
          this.attachmentManager.clearAttachments();
          // 添加新附件
          if (newState.attachments.length > 0) {
            this.attachmentManager.addAssets(newState.attachments);
            logger.debug("从同步状态更新附件", { count: newState.attachments.length });
          }
        }

        // 同步临时模型
        if (JSON.stringify(newState.temporaryModel) !== JSON.stringify(this.temporaryModel.value)) {
          this.temporaryModel.value = newState.temporaryModel;
          logger.debug("从同步状态更新临时模型", { model: newState.temporaryModel });
        }

        this.isApplyingSyncState = false;
      },
      { deep: true }
    );

    // 监听来自其他窗口的状态同步
    this.unlistenStateSync = this.bus.onMessage<StateSyncPayload>("state-sync", (payload) => {
      if (payload.stateType !== CHAT_STATE_KEYS.INPUT_STATE) return;
      if (payload.version <= this.stateVersion) {
        logger.warn("收到旧版本状态，已忽略", {
          currentVersion: this.stateVersion,
          receivedVersion: payload.version,
        });
        return;
      }

      this.isApplyingSyncState = true;
      try {
        if (payload.isFull) {
          this.syncState.value = payload.data as typeof this.syncState.value;
          logger.info("已应用全量输入状态", {
            version: payload.version,
            textLength: this.syncState.value.text.length,
            attachmentCount: this.syncState.value.attachments.length,
          });
        } else {
          this.syncState.value = applyPatches(
            this.syncState.value,
            payload.patches as JsonPatchOperation[]
          );
          logger.info("已应用增量输入状态", {
            version: payload.version,
            textLength: this.syncState.value.text.length,
            attachmentCount: this.syncState.value.attachments.length,
          });
        }
        this.stateVersion = payload.version;
        this.lastSyncedValue = JSON.parse(JSON.stringify(this.syncState.value));
      } catch (error) {
        errorHandler.error(error as Error, "应用输入状态更新失败", { showToUser: false });
      } finally {
        this.isApplyingSyncState = false;
      }
    });

    // 注册到全局同步源（仅主窗口和工具窗口）
    // 这样当有新窗口请求初始状态时，InputManager 也能自动响应
    if (this.bus.windowType === 'main' || this.bus.windowType === 'detached-tool') {
      this.unregisterSyncSource = registerSyncSource({
        pushState: async (isFullSync, targetWindowLabel, silent) => {
          this.pushState(isFullSync, targetWindowLabel, silent);
        },
        stateKey: CHAT_STATE_KEYS.INPUT_STATE
      });
    }

    logger.info("ChatInputManager 初始化完成，包含跨窗口同步");
  }

  /**
   * 防抖推送状态到其他窗口
   */
  public debouncedPushState(): void {
    if (this.pushTimer) {
      clearTimeout(this.pushTimer);
    }

    this.pushTimer = setTimeout(() => {
      this.pushState();
    }, 100); // 100ms 防抖
  }

  /**
   * 推送状态到其他窗口
   */
  public pushState(isFullSync = false, targetWindowLabel?: string, silent = false): void {
    if (this.isApplyingSyncState) return;

    const newValue = this.syncState.value;
    const newVersion = VersionGenerator.next();

    const shouldForceFullSync = isFullSync || !shouldUseDelta([], newValue, 0.5);

    if (shouldForceFullSync) {
      this.bus.syncState(CHAT_STATE_KEYS.INPUT_STATE, newValue, newVersion, true, targetWindowLabel);
      if (!silent) logger.debug("执行全量输入状态同步", { version: newVersion, targetWindow: targetWindowLabel });
    } else {
      const patches = calculateDiff(this.lastSyncedValue, newValue);
      if (patches.length === 0) {
        if (!silent) logger.debug("输入状态无变化，跳过同步");
        return;
      }
      this.bus.syncState(CHAT_STATE_KEYS.INPUT_STATE, patches, newVersion, false, targetWindowLabel);
      if (!silent) logger.debug("执行增量输入状态同步", { version: newVersion, patchesCount: patches.length, targetWindow: targetWindowLabel });
    }

    this.stateVersion = newVersion;
    this.lastSyncedValue = JSON.parse(JSON.stringify(newValue));
  }

  /**
   * 清理资源
   */
  destroy(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    if (this.pushTimer) {
      clearTimeout(this.pushTimer);
    }
    if (this.unlistenStateSync) {
      this.unlistenStateSync();
    }
    if (this.unregisterSyncSource) {
      this.unregisterSyncSource();
    }
    logger.info("ChatInputManager 已清理");
  }

  /**
   * 从 localStorage 恢复状态
   */
  private restoreFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const draft: ChatInputDraft = JSON.parse(stored);
        this.inputText.value = draft.text || "";
        this.temporaryModel.value = draft.temporaryModel || null;

        // 恢复附件列表
        if (draft.attachments && Array.isArray(draft.attachments)) {
          this.attachmentManager.addAssets(draft.attachments);
          logger.info("从 localStorage 恢复输入状态（含附件和临时模型）", {
            textLength: this.inputText.value.length,
            attachmentCount: draft.attachments.length,
            temporaryModel: this.temporaryModel.value,
            timestamp: draft.timestamp,
          });
        } else {
          logger.info("从 localStorage 恢复输入状态", {
            textLength: this.inputText.value.length,
            timestamp: draft.timestamp,
          });
        }
      }
    } catch (error) {
      errorHandler.error(error, "恢复输入状态失败", { showToUser: false });
    }
  }

  /**
   * 保存状态到 localStorage（防抖）
   */
  private debouncedSaveToStorage(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(() => {
      this.saveToStorageImmediate();
    }, 300); // 300ms 防抖
  }

  /**
   * 立即保存状态到 localStorage
   */
  private saveToStorageImmediate(): void {
    try {
      const draft: ChatInputDraft = {
        text: this.inputText.value,
        attachments: [...this.attachmentManager.attachments.value],
        temporaryModel: this.temporaryModel.value,
        timestamp: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      logger.debug("保存输入状态到 localStorage", {
        textLength: this.inputText.value.length,
        attachmentCount: this.attachmentManager.attachments.value.length,
        temporaryModel: this.temporaryModel.value,
      });
    } catch (error) {
      errorHandler.error(error, "保存输入状态失败", { showToUser: false });
    }
  }

  /**
   * 向输入框添加内容
   */
  addContent(content: string, position: "append" | "prepend" = "append"): void {
    if (!content) return;

    if (position === "append") {
      // 如果已有内容且最后没有空行，添加换行
      if (this.inputText.value && !this.inputText.value.endsWith("\n")) {
        this.inputText.value += "\n";
      }
      this.inputText.value += content;
    } else {
      // 如果新内容最后没有换行，添加换行
      const contentToAdd = content.endsWith("\n") ? content : content + "\n";
      this.inputText.value = contentToAdd + this.inputText.value;
    }

    logger.info("添加内容到输入框", {
      position,
      contentLength: content.length,
      totalLength: this.inputText.value.length,
    });
  }

  /**
   * 设置输入框内容（完全覆盖）
   */
  setContent(content: string): void {
    this.inputText.value = content;
    logger.info("设置输入框内容", { contentLength: content.length });
  }

  /**
   * 获取输入框内容
   */
  getContent(): string {
    return this.inputText.value;
  }

  /**
   * 清空输入框和附件
   */
  clear(): void {
    this.inputText.value = "";
    this.attachmentManager.clearAttachments();
    // 注意：临时模型不在此处清除，保持"粘性"，允许用户连续使用同一模型发送多条消息
    // 立即保存清空状态
    this.saveToStorageImmediate();
    logger.info("清空输入框和附件（保留临时模型）");
  }

  /**
   * 添加附件
   */
  async addAttachments(paths: string[]): Promise<void> {
    await this.attachmentManager.addAttachments(paths);
  }

  /**
   * 添加单个资产
   */
  addAsset(asset: Asset): boolean {
    return this.attachmentManager.addAsset(asset);
  }

  /**
   * 批量添加资产
   */
  addAssets(assets: Asset[]): number {
    return this.attachmentManager.addAssets(assets);
  }

  /**
   * 移除附件
   * @returns 是否成功移除
   */
  removeAttachment(assetId: string): boolean {
    const beforeCount = this.attachmentManager.count.value;
    this.attachmentManager.removeAttachmentById(assetId);
    const afterCount = this.attachmentManager.count.value;
    return beforeCount > afterCount;
  }

  /**
   * 获取所有附件
   */
  getAttachments(): readonly Asset[] {
    return this.attachmentManager.attachments.value;
  }

  // ========== 临时模型操作 ==========
  setTemporaryModel(modelIdentifier: ModelIdentifier | null): void {
    this.temporaryModel.value = modelIdentifier;
  }

  clearTemporaryModel(): void {
    this.temporaryModel.value = null;
  }
}

/**
 * 使用聊天输入管理器（Composable）
 *
 * 这是一个全局单例，所有调用此函数的组件都会共享同一个状态。
 * 适用于主窗口和分离窗口的 MessageInput 组件。
 *
 * **跨窗口同步：**
 * - 主窗口和分离窗口共享同一份输入框内容
 * - 在任一窗口输入都会同步到另一个窗口
 * - 发送消息后清空状态会同步到所有窗口
 */
export function useChatInputManager() {
  const manager = getOrCreateInstance("ChatInputManager", () => new ChatInputManager());

  return {
    // ========== 输入框文本 ==========
    /** 输入框文本内容（响应式） */
    inputText: manager.inputText,
    /** 临时指定的模型 */
    temporaryModel: manager.temporaryModel,

    // ========== 附件管理 ==========
    /** 附件列表（只读） */
    attachments: manager.attachmentManager.attachments,
    /** 是否正在处理附件 */
    isProcessingAttachments: manager.attachmentManager.isProcessing,
    /** 是否有附件 */
    hasAttachments: manager.attachmentManager.hasAttachments,
    /** 附件数量 */
    attachmentCount: manager.attachmentManager.count,
    /** 附件是否已满 */
    isAttachmentsFull: manager.attachmentManager.isFull,

    // ========== 内容操作方法 ==========
    /** 向输入框添加内容 */
    addContent: manager.addContent.bind(manager),
    /** 设置输入框内容（完全覆盖） */
    setContent: manager.setContent.bind(manager),
    /** 获取输入框内容 */
    getContent: manager.getContent.bind(manager),
    /** 清空输入框和附件 */
    clear: manager.clear.bind(manager),

    // ========== 附件操作方法 ==========
    /** 添加附件（从文件路径） */
    addAttachments: manager.addAttachments.bind(manager),
    /** 添加单个资产 */
    addAsset: manager.addAsset.bind(manager),
    /** 批量添加资产 */
    addAssets: manager.addAssets.bind(manager),
    /** 移除附件 */
    removeAttachment: manager.removeAttachment.bind(manager),
    /** 清空附件 */
    clearAttachments: manager.attachmentManager.clearAttachments,
    /** 获取所有附件 */
    getAttachments: manager.getAttachments.bind(manager),

    // ========== 临时模型操作 ==========
    /** 设置临时模型 */
    setTemporaryModel: manager.setTemporaryModel.bind(manager),
    /** 清除临时模型 */
    clearTemporaryModel: manager.clearTemporaryModel.bind(manager),

    // 暴露给 useLlmChatSync 用于手动触发推送
    pushState: manager.pushState.bind(manager),
  };
}
