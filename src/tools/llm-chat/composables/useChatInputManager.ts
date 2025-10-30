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
import {
  calculateDiff,
  applyPatches,
  shouldUseDelta,
  VersionGenerator,
} from "@/utils/sync-helpers";
import { CHAT_STATE_KEYS } from "../types/sync";
import { createModuleLogger } from "@/utils/logger";
import type { Asset } from "@/types/asset-management";
import type { StateSyncPayload, JsonPatchOperation } from "@/types/window-sync";

const logger = createModuleLogger("ChatInputManager");

const STORAGE_KEY = "llm-chat-input-draft";

/**
 * 持久化的状态结构
 */
interface ChatInputDraft {
  text: string;
  timestamp: number;
}

/**
 * 聊天输入管理器类（单例）
 */
class ChatInputManager {
  // 输入框文本
  public inputText: Ref<string> = ref("");

  // 用于跨窗口同步的状态对象（可写的 ref）
  public syncState: Ref<{ text: string }> = ref({ text: "" });

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
  private lastSyncedValue: { text: string } = { text: "" };

  // 防抖推送计时器
  private pushTimer: ReturnType<typeof setTimeout> | null = null;

  // 监听器清理函数
  private unlistenStateSync: (() => void) | null = null;

  constructor() {
    // 创建附件管理器
    this.attachmentManager = useAttachmentManager({
      maxCount: 20,
      maxFileSize: 50 * 1024 * 1024,
    });

    // 从 localStorage 恢复状态
    this.restoreFromStorage();

    // 初始化同步状态
    this.syncState.value = { text: this.inputText.value };
    this.lastSyncedValue = { text: this.inputText.value };

    // 监听输入框文本变化，同步到 syncState（用于跨窗口同步）
    watch(this.inputText, (newText) => {
      if (!this.isApplyingSyncState) {
        this.syncState.value = { text: newText };
        // 防抖推送到其他窗口
        this.debouncedPushState();
      }
      this.debouncedSaveToStorage();
    });

    // 监听 syncState 变化，同步回 inputText（来自其他窗口的更新）
    watch(
      this.syncState,
      (newState) => {
        if (newState.text !== this.inputText.value) {
          this.isApplyingSyncState = true;
          this.inputText.value = newState.text;
          logger.debug("从同步状态更新输入框", { textLength: newState.text.length });
          this.isApplyingSyncState = false;
        }
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
          this.syncState.value = payload.data as { text: string };
          logger.info("已应用全量输入状态", { version: payload.version });
        } else {
          this.syncState.value = applyPatches(
            this.syncState.value,
            payload.patches as JsonPatchOperation[]
          );
          logger.info("已应用增量输入状态", { version: payload.version });
        }
        this.stateVersion = payload.version;
        this.lastSyncedValue = JSON.parse(JSON.stringify(this.syncState.value));
      } catch (error) {
        logger.error("应用输入状态更新失败", error as Error);
      } finally {
        this.isApplyingSyncState = false;
      }
    });

    // 如果不是主窗口，请求初始状态
    if (this.bus.windowType !== "main") {
      this.bus.requestSpecificState(CHAT_STATE_KEYS.INPUT_STATE);
    }

    logger.info("ChatInputManager 初始化完成，包含跨窗口同步");
  }

  /**
   * 防抖推送状态到其他窗口
   */
  private debouncedPushState(): void {
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
  private pushState(): void {
    if (this.isApplyingSyncState) return;

    const newValue = this.syncState.value;
    const newVersion = VersionGenerator.next();

    // 计算差异
    const patches = calculateDiff(this.lastSyncedValue, newValue);
    if (patches.length === 0) {
      logger.debug("输入状态无变化，跳过同步");
      return;
    }

    // 决定使用全量还是增量同步
    const useDelta = shouldUseDelta(patches, newValue, 0.5);

    this.bus.syncState(
      CHAT_STATE_KEYS.INPUT_STATE,
      useDelta ? patches : newValue,
      newVersion,
      !useDelta
    );

    this.stateVersion = newVersion;
    this.lastSyncedValue = JSON.parse(JSON.stringify(newValue));

    logger.debug("已推送输入状态", { version: newVersion, useDelta });
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
        logger.info("从 localStorage 恢复输入状态", {
          textLength: this.inputText.value.length,
          timestamp: draft.timestamp,
        });
      }
    } catch (error) {
      logger.error("恢复输入状态失败", error);
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
        timestamp: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      logger.debug("保存输入状态到 localStorage", {
        textLength: this.inputText.value.length,
      });
    } catch (error) {
      logger.error("保存输入状态失败", error);
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
    // 立即保存清空状态
    this.saveToStorageImmediate();
    logger.info("清空输入框和附件");
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
  };
}
