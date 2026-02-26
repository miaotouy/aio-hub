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

import { ref, watch, nextTick, type Ref } from "vue";
import { listen } from "@tauri-apps/api/event";
import { getOrCreateInstance } from "@/utils/singleton";
import { useAttachmentManager, type UseAttachmentManagerReturn } from "../features/useAttachmentManager";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { registerSyncSource } from "@/composables/useStateSyncEngine";
import { calculateDiff, applyPatches, shouldUseDelta, VersionGenerator } from "@/utils/sync-helpers";
import { CHAT_STATE_KEYS } from "../../types/sync";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { deepEqual } from "@/utils/sync-helpers";
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
  // 最后已知的光标位置
  public lastCursorPosition: Ref<number> = ref(0);
  // 聚焦请求信号
  public focusRequest: Ref<number> = ref(0);
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

  // 扫描修复计时器
  private scanFixTimer: ReturnType<typeof setTimeout> | null = null;

  // 记录所有 oldId -> newId 的历史映射，供二次扫描使用
  private idUpdateLog: Map<string, string> = new Map();

  /**
   * 判断是否为临时 ID (NanoID 或包含 pending/importing)
   */
  private isTempId(id: string): boolean {
    return id.length === 21 || id.includes("pending") || id.includes("importing");
  }

  /**
   * 根据资产状态获取对应的占位符
   */
  private getPlaceholder(asset: Asset): string {
    return this.isTempId(asset.id) ? generateUploadingPlaceholder(asset.id) : generateAssetPlaceholder(asset.id);
  }

  // 监听器清理函数
  private unlistenStateSync: (() => void) | null = null;
  private unlistenAssetImport: (() => void) | null = null;
  private unregisterSyncSource: (() => void) | null = null;

  constructor() {
    // 创建附件管理器
    this.attachmentManager = useAttachmentManager({
      maxCount: 100,
      maxFileSize: 50 * 1024 * 1024,
    });

    // 注册导入完成的回调，统一处理所有来源的占位符更新
    this.attachmentManager.onImportComplete((oldId, newAsset) => {
      logger.info("[ChatInputManager] 监听到资产导入完成，触发占位符更新", {
        oldId,
        newId: newAsset.id,
      });
      this.updatePlaceholderId(oldId, newAsset.id);
    });

    // 监听上传状态，当所有上传完成时，进行一次延迟扫描修复
    watch(this.attachmentManager.isProcessing, (isProcessing) => {
      if (!isProcessing) {
        if (this.scanFixTimer) clearTimeout(this.scanFixTimer);
        this.scanFixTimer = setTimeout(() => {
          this.scanAndFixPlaceholders();
        }, 1000); // 上传完成后 1s 进行二次检查
      }
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
        if (JSON.stringify(newState.continuationModel) !== JSON.stringify(this.continuationModel.value)) {
          this.continuationModel.value = newState.continuationModel;
          logger.debug("从同步状态更新续写模型", { model: newState.continuationModel });
        }

        // 使用 nextTick 确保在 Vue 响应式更新循环结束后再重置标志位
        // 这可以防止由于同步操作触发的 watch 再次产生不必要的 pushState
        nextTick(() => {
          this.isApplyingSyncState = false;
        });
      },
      { deep: true }
    );

    // 监听全局资产导入完成事件（用于粘贴等直接导入场景的占位符替换）
    listen<{ asset: Asset; tempId: string }>("asset-imported", (event) => {
      const { asset, tempId } = event.payload;
      if (tempId && asset.sourceModule === "llm-chat") {
        logger.info("[ChatInputManager] 收到全局资产导入事件，触发占位符更新", {
          tempId,
          newId: asset.id,
        });
        this.updatePlaceholderId(tempId, asset.id);
      }
    }).then((unlisten) => {
      this.unlistenAssetImport = unlisten;
    });

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
          this.syncState.value = applyPatches(this.syncState.value, payload.patches as JsonPatchOperation[]);
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

    // 性能优化：如果数据没有变化，跳过同步计算
    if (!isFullSync && deepEqual(this.lastSyncedValue, newValue)) {
      return;
    }
    const newVersion = VersionGenerator.next();

    const shouldForceFullSync = isFullSync || !shouldUseDelta([], newValue, 0.5);

    if (shouldForceFullSync) {
      this.bus.syncState(CHAT_STATE_KEYS.INPUT_STATE, newValue, newVersion, true, targetWindowLabel);
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
      this.bus.syncState(CHAT_STATE_KEYS.INPUT_STATE, patches, newVersion, false, targetWindowLabel);
      if (!silent)
        logger.debug("执行增量输入状态同步", {
          version: newVersion,
          patchesCount: patches.length,
          targetWindow: targetWindowLabel,
        });
    }

    this.stateVersion = newVersion;
    // 使用序列化进行深拷贝以断开引用，虽然有开销但能确保后续对比准确
    // 仅在数据确实变化后执行一次，开销可控
    try {
      this.lastSyncedValue = JSON.parse(JSON.stringify(newValue));
    } catch (e) {
      logger.error("快照状态失败", e);
    }
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
    if (this.scanFixTimer) {
      clearTimeout(this.scanFixTimer);
    }
    if (this.unlistenStateSync) {
      this.unlistenStateSync();
    }
    if (this.unlistenAssetImport) {
      this.unlistenAssetImport();
    }
    if (this.unregisterSyncSource) {
      this.unregisterSyncSource();
    }
    this.idUpdateLog.clear();
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
    // 清空 ID 变更历史，避免内存泄漏
    this.idUpdateLog.clear();
    // 注意：临时模型不在此处清除，保持"粘性"，允许用户连续使用同一模型发送多条消息
    // 立即保存清空状态
    this.saveToStorageImmediate();
    logger.info("清空输入框和附件（保留临时模型）");
  }

  /**
   /**
    * 准备要插入的占位符文本（含前缀后缀换行逻辑）
    * @param assets 附件列表
    * @param cursorPosition 当前光标位置
    */
  preparePlaceholderInsert(assets: Asset[], cursorPosition: number): { text: string; from: number; to: number } {
    if (assets.length === 0) return { text: "", from: cursorPosition, to: cursorPosition };

    const placeholders = assets.map((asset) => this.getPlaceholder(asset));
    const placeholderText = placeholders.join("\n");

    const currentText = this.inputText.value;
    const pos = cursorPosition;

    const before = currentText.substring(0, pos);
    const after = currentText.substring(pos);

    const insertPrefix = before && !before.endsWith("\n") && !before.endsWith(" ") ? "\n" : "";
    const insertSuffix = after && !after.startsWith("\n") ? "\n" : "";
    return {
      text: insertPrefix + placeholderText + insertSuffix,
      from: pos,
      to: pos,
    };
  }

  /**
   * 在当前光标位置插入资产占位符（直接修改 inputText）
   * 注意：在 UI 组件中建议优先使用 preparePlaceholderInsert + editor.insertText 以获得更好的光标体验
   */
  insertAssetPlaceholders(assets: Asset[], cursorPosition?: number): number {
    const pos = cursorPosition ?? this.lastCursorPosition.value ?? this.inputText.value.length;
    const { text, from, to } = this.preparePlaceholderInsert(assets, pos);
    if (!text) return pos;

    const currentText = this.inputText.value;
    this.inputText.value = currentText.substring(0, from) + text + currentText.substring(to);
    return from + text.length;
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
    const pathRegex = /(?:file:\/\/\/?|[a-zA-Z]:[\\\/])(?:[^\s"<>|?*【】]+(?:\s[^\s"<>|?*【】]+)*)/g;

    const matches = Array.from(text.matchAll(pathRegex));
    if (matches.length === 0) return { successCount: 0, failedCount: 0, totalCount: 0 };

    let successCount = 0;
    let failedCount = 0;

    const uniquePaths = Array.from(new Set(matches.map((m) => m[0].trim())));

    for (const rawPath of uniquePaths) {
      try {
        logger.info("[convertPaths] 处理路径", { rawPath });
        let cleanPath = rawPath;
        if (cleanPath.startsWith("file://")) {
          cleanPath = cleanPath.replace(/^file:\/\/\/?/, "");
          if (cleanPath.startsWith("/") && cleanPath.charAt(2) === ":") {
            cleanPath = cleanPath.substring(1);
          }
        }
        cleanPath = cleanPath.replace(/\//g, "\\");

        const beforeIds = new Set(this.attachmentManager.attachments.value.map((a) => a.id));
        await this.attachmentManager.addAttachments([cleanPath]);

        // 重新获取最新的 attachments 引用
        const afterAssets = this.attachmentManager.attachments.value;
        // 优先找新加的，找不到找已存在的
        const targetAsset =
          afterAssets.find(
            (a) => !beforeIds.has(a.id) && (a.path === cleanPath || a.name === cleanPath.split("\\").pop())
          ) || afterAssets.find((a) => a.path === cleanPath);

        if (targetAsset) {
          logger.info("[convertPaths] 匹配到资产", {
            id: targetAsset.id,
            status: targetAsset.importStatus,
          });

          const placeholder = this.getPlaceholder(targetAsset);
          const escapedPath = rawPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          this.inputText.value = this.inputText.value.replace(new RegExp(escapedPath, "g"), placeholder);
          successCount++;
        } else {
          failedCount++;
        }
      } catch (error) {
        logger.error("转换路径失败", error, { path: rawPath });
        failedCount++;
      }
    }

    return {
      successCount,
      failedCount,
      totalCount: uniquePaths.length,
    };
  }

  /**
   * 统一处理资产添加后的占位符插入和 ID 监听
   * 用于拖拽、粘贴、文件选择等场景
   *
   * @param addedAssets 新添加的资产列表
   * @param textareaRef 编辑器引用，用于插入文本
   * @param autoInsert 是否自动插入占位符
   */
  handleAssetsAddition(addedAssets: Asset[], textareaRef: any, autoInsert: boolean): void {
    if (!autoInsert || addedAssets.length === 0) return;

    const cursorPos = textareaRef?.getSelectionRange()?.start ?? this.inputText.value.length;

    // 统一生成插入信息，内部会自动判断是普通占位符还是上传中占位符
    const insertInfo = this.preparePlaceholderInsert(addedAssets, cursorPos);
    if (insertInfo.text) {
      textareaRef?.insertText(insertInfo.text, insertInfo.from, insertInfo.to);
    }
  }

  /**
   * 全量扫描并修复输入框中的占位符
   * 利用 idUpdateLog 中记录的历史映射，以及当前附件列表，对所有残留的 uploading 占位符进行二次替换
   * 主要用于应对上传完成时用户正在打字导致的 Vue 响应式竞态问题
   */
  scanAndFixPlaceholders(): void {
    const text = this.inputText.value;
    if (!text.includes("file::uploading:")) return;

    // 匹配 【file::uploading:ID】
    const uploadingRegex = /【file::uploading:([a-zA-Z0-9_-]+)】/g;
    const matches = Array.from(text.matchAll(uploadingRegex));
    if (matches.length === 0) return;

    let newText = text;
    let fixedCount = 0;

    // 获取当前附件列表，建立 ID 映射
    const currentAttachments = this.attachmentManager.attachments.value;

    for (const match of matches) {
      const tempId = match[1];
      let realId = this.idUpdateLog.get(tempId);

      // 如果日志里没找到，尝试从当前附件列表中找已经完成的资产
      if (!realId) {
        const completedAsset = currentAttachments.find(
          (a) => a.importStatus === "complete" && !this.isTempId(a.id)
          // 注意：这里我们无法 100% 确定哪个正式 ID 对应哪个临时 ID，
          // 但通常情况下，如果只有一个上传任务，或者是根据文件名/大小匹配
        );
        // 如果只有一个附件且已完成，大概率就是它
        if (currentAttachments.length === 1 && completedAsset) {
          realId = completedAsset.id;
        }
      }

      if (!realId) continue;

      const uploadingPlaceholder = generateUploadingPlaceholder(tempId);
      const realPlaceholder = generateAssetPlaceholder(realId);
      newText = newText.split(uploadingPlaceholder).join(realPlaceholder);
      fixedCount++;
    }

    if (fixedCount > 0) {
      this.inputText.value = newText;
      logger.info("[scanAndFixPlaceholders] 二次扫描修复了残留占位符", { fixedCount });
    } else {
      logger.debug("[scanAndFixPlaceholders] 扫描完成，无需修复");
    }
  }

  /**
   * 更新输入框中占位符的 asset ID
   * 优先匹配 uploading 格式的占位符，回退到普通格式
   * 用于 asset 导入完成后，临时 ID 变为真实 ID 时同步更新占位符
   */
  updatePlaceholderId(oldId: string, newId: string): void {
    if (!oldId || !newId || oldId === newId) return;

    // 始终记录 ID 变更历史，供 scanAndFixPlaceholders 二次扫描使用
    this.idUpdateLog.set(oldId, newId);

    const newPlaceholder = generateAssetPlaceholder(newId);
    const beforeValue = this.inputText.value;

    // 1. 优先匹配标准的 uploading 格式：【file::uploading:tempId】 -> 【file::realId】
    const uploadingPlaceholder = generateUploadingPlaceholder(oldId);
    if (beforeValue.includes(uploadingPlaceholder)) {
      this.inputText.value = beforeValue.split(uploadingPlaceholder).join(newPlaceholder);
      logger.info("更新占位符 ID (uploading -> real)", { oldId, newId });
      return;
    }

    // 2. 增强匹配：如果用户不小心删掉了部分字符，或者正则匹配
    // 匹配包含 oldId 的 uploading 占位符
    const fuzzyUploadingRegex = new RegExp(`【file::uploading:${oldId}】`, "g");
    if (fuzzyUploadingRegex.test(beforeValue)) {
      this.inputText.value = beforeValue.replace(fuzzyUploadingRegex, newPlaceholder);
      logger.info("更新占位符 ID (模糊匹配 uploading)", { oldId, newId });
      return;
    }

    // 3. 回退：匹配普通格式（兼容非粘贴场景）
    const oldPlaceholder = generateAssetPlaceholder(oldId);
    if (beforeValue.includes(oldPlaceholder)) {
      this.inputText.value = beforeValue.split(oldPlaceholder).join(newPlaceholder);
      logger.info("更新占位符 ID (standard -> real)", { oldId, newId });
    } else {
      // 4. 最后的挣扎：直接替换所有出现的 oldId 占位符（如果它看起来像个占位符）
      const anyPlaceholderRegex = new RegExp(`【file::(?:uploading:)?${oldId}】`, "g");
      if (anyPlaceholderRegex.test(beforeValue)) {
        this.inputText.value = beforeValue.replace(anyPlaceholderRegex, newPlaceholder);
        logger.info("更新占位符 ID (正则全量替换)", { oldId, newId });
      } else {
        logger.warn("[updatePlaceholderId] 未找到任何匹配的占位符，已记录映射供后续扫描", {
          oldId,
          newId,
        });
      }
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
    /** 准备要插入的占位符信息 */
    preparePlaceholderInsert: manager.preparePlaceholderInsert.bind(manager),
    /** 直接插入占位符（修改状态） */
    insertAssetPlaceholders: manager.insertAssetPlaceholders.bind(manager),
    /** 转换文本中的路径为附件 */
    convertPathsToAttachments: manager.convertPathsToAttachments.bind(manager),
    /** 更新占位符中的 asset ID（临时 ID -> 真实 ID） */
    updatePlaceholderId: manager.updatePlaceholderId.bind(manager),
    /** 全量扫描并修复残留的 uploading 占位符（发送前兜底） */
    scanAndFixPlaceholders: manager.scanAndFixPlaceholders.bind(manager),
    /** 更新最后已知的光标位置 */
    updateLastCursorPosition: (pos: number) => (manager.lastCursorPosition.value = pos),
    /** 请求编辑器聚焦 */
    requestEditorFocus: () => manager.focusRequest.value++,
    /** 聚焦请求信号（只读） */
    focusRequest: manager.focusRequest,
    /** 统一处理资产添加后的占位符插入和 ID 监听 */
    handleAssetsAddition: manager.handleAssetsAddition.bind(manager),

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
