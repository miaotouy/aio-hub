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
import {
  useAttachmentManager,
  type UseAttachmentManagerReturn,
} from "../features/useAttachmentManager";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { registerSyncSource } from "@/composables/useStateSyncEngine";
import {
  calculateDiff,
  applyPatches,
  shouldUseDelta,
  VersionGenerator,
} from "@/utils/sync-helpers";
import { CHAT_STATE_KEYS } from "../../types/sync";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { Asset } from "@/types/asset-management";
import type { StateSyncPayload, JsonPatchOperation } from "@/types/window-sync";
import type { ModelIdentifier } from "../../types";
import {
  generateAssetPlaceholder,
  generateUploadingPlaceholder,
} from "../../core/context-processors/transcription-processor";

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
  continuationModel?: ModelIdentifier | null;
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
  // 续写指定的模型
  public continuationModel: Ref<ModelIdentifier | null> = ref(null);

  // 用于跨窗口同步的状态对象（可写的 ref）
  public syncState: Ref<{
    text: string;
    attachments: Asset[];
    temporaryModel: ModelIdentifier | null;
    continuationModel: ModelIdentifier | null;
  }> = ref({
    text: "",
    attachments: [],
    temporaryModel: null,
    continuationModel: null,
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
    continuationModel: ModelIdentifier | null;
  } = { text: "", attachments: [], temporaryModel: null, continuationModel: null };

  // 防抖推送计时器
  private pushTimer: ReturnType<typeof setTimeout> | null = null;

  // 监听器清理函数
  private unlistenStateSync: (() => void) | null = null;
  private unregisterSyncSource: (() => void) | null = null;

  constructor() {
    // 创建附件管理器
    this.attachmentManager = useAttachmentManager({
      maxCount: 100,
      maxFileSize: 50 * 1024 * 1024,
    });

    // 从 localStorage 恢复状态
    this.restoreFromStorage();

    // 初始化同步状态（从 attachmentManager 获取当前附件）
    this.syncState.value = {
      text: this.inputText.value,
      attachments: [...this.attachmentManager.attachments.value],
      temporaryModel: this.temporaryModel.value,
      continuationModel: this.continuationModel.value,
    };
    this.lastSyncedValue = {
      text: this.inputText.value,
      attachments: [...this.attachmentManager.attachments.value],
      temporaryModel: this.temporaryModel.value,
      continuationModel: this.continuationModel.value,
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

    // 监听续写模型变化
    watch(this.continuationModel, (newModel) => {
      if (!this.isApplyingSyncState) {
        this.syncState.value = {
          ...this.syncState.value,
          continuationModel: newModel,
        };
        this.debouncedPushState();
      }
      this.debouncedSaveToStorage();
    });

    // 监听 syncState 变化，同步回 inputText 和附件（来自其他窗口的更新）
    watch(
      this.syncState,
      (newState) => {
        // 如果是本地修改导致的 syncState 变化（isApplyingSyncState 为 false 时触发的本地 push），
        // 我们不需要再同步回 inputText，否则会产生竞态
        if (!this.isApplyingSyncState && newState.text === this.inputText.value) {
          return;
        }

        this.isApplyingSyncState = true;

        // 同步文本
        // 只有当文本真的不同，且我们不是在处理本地修改时才同步
        if (newState.text !== this.inputText.value) {
          // 额外的保护：如果新值比旧值“旧”（比如包含 uploading 而当前已经替换了），且不是来自全量同步，则拒绝
          if (
            this.inputText.value.includes("file::") &&
            !this.inputText.value.includes("uploading:") &&
            newState.text.includes("uploading:")
          ) {
            logger.warn("[syncState watch] 拒绝将已完成的占位符回滚为上传中状态");
          } else {
            this.inputText.value = newState.text;
            logger.debug("从同步状态更新输入框", { textLength: newState.text.length });
          }
        }

        // 同步附件（使用智能合并，保留正在导入的资产引用）
        this.attachmentManager.syncAttachments(newState.attachments);

        // 同步临时模型
        if (JSON.stringify(newState.temporaryModel) !== JSON.stringify(this.temporaryModel.value)) {
          this.temporaryModel.value = newState.temporaryModel;
          logger.debug("从同步状态更新临时模型", { model: newState.temporaryModel });
        }

        // 同步续写模型
        if (
          JSON.stringify(newState.continuationModel) !==
          JSON.stringify(this.continuationModel.value)
        ) {
          this.continuationModel.value = newState.continuationModel;
          logger.debug("从同步状态更新续写模型", { model: newState.continuationModel });
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
        errorHandler.handle(error as Error, {
          userMessage: "应用输入状态更新失败",
          showToUser: false,
        });
      } finally {
        this.isApplyingSyncState = false;
      }
    });

    // 注册到全局同步源（仅主窗口和工具窗口）
    // 这样当有新窗口请求初始状态时，InputManager 也能自动响应
    if (this.bus.windowType === "main" || this.bus.windowType === "detached-tool") {
      this.unregisterSyncSource = registerSyncSource({
        pushState: async (isFullSync, targetWindowLabel, silent) => {
          this.pushState(isFullSync, targetWindowLabel, silent);
        },
        stateKey: CHAT_STATE_KEYS.INPUT_STATE,
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
      this.bus.syncState(
        CHAT_STATE_KEYS.INPUT_STATE,
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
      if (patches.length === 0) {
        if (!silent) logger.debug("输入状态无变化，跳过同步");
        return;
      }
      this.bus.syncState(
        CHAT_STATE_KEYS.INPUT_STATE,
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
        this.continuationModel.value = draft.continuationModel || null;

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
      errorHandler.handle(error as Error, { userMessage: "恢复输入状态失败", showToUser: false });
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
        continuationModel: this.continuationModel.value,
        timestamp: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      logger.debug("保存输入状态到 localStorage", {
        textLength: this.inputText.value.length,
        attachmentCount: this.attachmentManager.attachments.value.length,
        temporaryModel: this.temporaryModel.value,
      });
    } catch (error) {
      errorHandler.handle(error as Error, { userMessage: "保存输入状态失败", showToUser: false });
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
   * 在当前光标位置插入资产占位符
   * @param assets 附件列表
   * @param cursorPosition 当前光标位置（默认为文本末尾）
   */
  insertAssetPlaceholders(assets: Asset[], cursorPosition?: number): void {
    if (assets.length === 0) return;

    // 生成占位符列表
    const placeholders = assets.map((asset) => generateAssetPlaceholder(asset.id));
    const placeholderText = placeholders.join("\n");

    const currentText = this.inputText.value;
    const pos = cursorPosition ?? currentText.length;

    // 在光标位置插入占位符
    const before = currentText.substring(0, pos);
    const after = currentText.substring(pos);

    // 如果前面没有空格或换行，添加一个换行
    const insertPrefix = before && !before.endsWith("\n") && !before.endsWith(" ") ? "\n" : "";
    // 如果后面没有换行，添加一个换行
    const insertSuffix = after && !after.startsWith("\n") ? "\n" : "";

    this.inputText.value = before + insertPrefix + placeholderText + insertSuffix + after;

    logger.info("插入资产占位符", {
      count: assets.length,
      cursorPosition: pos,
    });
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
   * 扫描输入框中的本地路径并转换为附件占位符
   */
  async convertPathsToAttachments(): Promise<{
    successCount: number;
    failedCount: number;
    totalCount: number;
  }> {
    const text = this.inputText.value;
    if (!text) return { successCount: 0, failedCount: 0, totalCount: 0 };

    // 匹配 file:// 协议或 Windows 路径 (如 D:\path\to\file 或 C:/path/to/file)
    // 排除掉已经是占位符的内容 【file::...】
    const pathRegex =
      /(?:file:\/\/\/?|[a-zA-Z]:[\\\/])(?:[^\s"<>|?*【】]+(?:\s[^\s"<>|?*【】]+)*)/g;

    const matches = Array.from(text.matchAll(pathRegex));
    if (matches.length === 0) return { successCount: 0, failedCount: 0, totalCount: 0 };

    let currentText = text;
    let successCount = 0;
    let failedCount = 0;

    // 为了避免替换冲突，我们先收集所有路径，然后统一处理
    // 注意：路径可能包含空格，正则已经尽量处理了，但仍需小心
    const uniquePaths = Array.from(new Set(matches.map((m) => m[0].trim())));

    for (const rawPath of uniquePaths) {
      try {
        // 清理路径：去除 file:// 前缀
        let cleanPath = rawPath;
        if (cleanPath.startsWith("file://")) {
          cleanPath = cleanPath.replace(/^file:\/\/\/?/, "");
          // Windows 下 file:///C:/... 替换后可能是 C:/...
          // 这里简单处理，如果路径以 / 开头且第二个字符是 :，去掉开头的 /
          if (cleanPath.startsWith("/") && cleanPath.charAt(2) === ":") {
            cleanPath = cleanPath.substring(1);
          }
        }

        // 规范化路径分隔符
        cleanPath = cleanPath.replace(/\//g, "\\");

        // 尝试导入资产
        // 我们需要一个能返回 Asset 对象的导入方法，或者直接使用 addAttachments
        // 这里我们利用 attachmentManager.addAttachments 返回的是 Promise<void>
        // 为了拿到 ID，我们可能需要稍微改造下 attachmentManager 或者观察变化
        // 这里假设我们能通过路径匹配到新加入的资产
        const beforeIds = new Set(this.attachmentManager.attachments.value.map((a) => a.id));
        await this.attachmentManager.addAttachments([cleanPath]);
        const afterAssets = this.attachmentManager.attachments.value;
        const newAsset = afterAssets.find(
          (a) =>
            !beforeIds.has(a.id) && (a.path === cleanPath || a.name === cleanPath.split("\\").pop())
        );

        if (newAsset) {
          const placeholder = generateAssetPlaceholder(newAsset.id);
          // 全量替换该路径文本
          // 转义正则特殊字符
          const escapedPath = rawPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          currentText = currentText.replace(new RegExp(escapedPath, "g"), placeholder);
          successCount++;
        } else {
          // 检查是否已经是已存在的资产（重复路径）
          const existingAsset = afterAssets.find((a) => a.path === cleanPath);
          if (existingAsset) {
            const placeholder = generateAssetPlaceholder(existingAsset.id);
            const escapedPath = rawPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            currentText = currentText.replace(new RegExp(escapedPath, "g"), placeholder);
            successCount++;
          } else {
            failedCount++;
          }
        }
      } catch (error) {
        logger.error("转换路径失败", error, { path: rawPath });
        failedCount++;
      }
    }

    if (successCount > 0) {
      this.inputText.value = currentText;
    }

    return {
      successCount,
      failedCount,
      totalCount: uniquePaths.length,
    };
  }

  /**
   * 在当前光标位置插入上传中的资产占位符
   * 占位符带 uploading: 前缀，上传完成后通过 updatePlaceholderId 替换为正常格式
   * @param assets 附件列表
   * @param cursorPosition 当前光标位置（默认为文本末尾）
   */
  insertUploadingPlaceholders(assets: Asset[], cursorPosition?: number): void {
    if (assets.length === 0) return;

    const placeholders = assets.map((asset) => generateUploadingPlaceholder(asset.id));
    const placeholderText = placeholders.join("\n");

    const currentText = this.inputText.value;
    const pos = cursorPosition ?? currentText.length;

    const before = currentText.substring(0, pos);
    const after = currentText.substring(pos);

    const insertPrefix = before && !before.endsWith("\n") && !before.endsWith(" ") ? "\n" : "";
    const insertSuffix = after && !after.startsWith("\n") ? "\n" : "";

    this.inputText.value = before + insertPrefix + placeholderText + insertSuffix + after;

    logger.info("插入上传中占位符", {
      count: assets.length,
      cursorPosition: pos,
    });
  }

  /**
   * 更新输入框中占位符的 asset ID
   * 优先匹配 uploading 格式的占位符，回退到普通格式
   * 用于 asset 导入完成后，临时 ID 变为真实 ID 时同步更新占位符
   */
  updatePlaceholderId(oldId: string, newId: string): void {
    if (oldId === newId) return;
    const newPlaceholder = generateAssetPlaceholder(newId);

    const beforeValue = this.inputText.value;

    // 优先匹配 uploading 格式：【file::uploading:tempId】 -> 【file::realId】
    const uploadingPlaceholder = generateUploadingPlaceholder(oldId);
    if (beforeValue.includes(uploadingPlaceholder)) {
      const afterValue = beforeValue.split(uploadingPlaceholder).join(newPlaceholder);
      this.inputText.value = afterValue;
      logger.info("更新占位符 ID (uploading -> real)", { oldId, newId });
      return;
    }

    // 回退：匹配普通格式（兼容非粘贴场景）
    const oldPlaceholder = generateAssetPlaceholder(oldId);
    if (beforeValue.includes(oldPlaceholder)) {
      this.inputText.value = beforeValue.split(oldPlaceholder).join(newPlaceholder);
      logger.info("更新占位符 ID", { oldId, newId });
    } else {
      logger.warn("[updatePlaceholderId] 未找到任何匹配的占位符", {
        uploadingPlaceholder,
        oldPlaceholder,
        inputTextContent: beforeValue.substring(0, 300),
      });
    }
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

  // ========== 续写模型操作 ==========
  setContinuationModel(modelIdentifier: ModelIdentifier | null): void {
    this.continuationModel.value = modelIdentifier;
  }

  clearContinuationModel(): void {
    this.continuationModel.value = null;
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
    /** 续写指定的模型 */
    continuationModel: manager.continuationModel,

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
    /** 最大附件数量 */
    maxAttachmentCount: manager.attachmentManager.maxCount,

    // ========== 内容操作方法 ==========
    /** 向输入框添加内容 */
    addContent: manager.addContent.bind(manager),
    /** 设置输入框内容（完全覆盖） */
    setContent: manager.setContent.bind(manager),
    /** 获取输入框内容 */
    getContent: manager.getContent.bind(manager),
    /** 清空输入框和附件 */
    clear: manager.clear.bind(manager),
    /** 在当前光标位置插入资产占位符 */
    insertAssetPlaceholders: manager.insertAssetPlaceholders.bind(manager),
    /** 转换文本中的路径为附件 */
    convertPathsToAttachments: manager.convertPathsToAttachments.bind(manager),
    /** 插入上传中的资产占位符（带 uploading: 前缀） */
    insertUploadingPlaceholders: manager.insertUploadingPlaceholders.bind(manager),
    /** 更新占位符中的 asset ID（临时 ID -> 真实 ID） */
    updatePlaceholderId: manager.updatePlaceholderId.bind(manager),

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

    // ========== 续写模型操作 ==========
    /** 设置续写模型 */
    setContinuationModel: manager.setContinuationModel.bind(manager),
    /** 清除续写模型 */
    clearContinuationModel: manager.clearContinuationModel.bind(manager),

    // 暴露给 useLlmChatSync 用于手动触发推送
    pushState: manager.pushState.bind(manager),
  };
}
