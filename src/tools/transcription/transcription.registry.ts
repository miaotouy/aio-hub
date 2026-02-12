/**
 * 多模态转写 外观服务
 *
 * 轻量级外观服务，为外部调用提供对转写功能的编程接口。
 * 不包含核心业务逻辑，仅作为 useTranscriptionManager 的薄层封装。
 */

import { markRaw } from "vue";
import { FileAudio, FileText } from "lucide-vue-next";
import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { useTranscriptionManager } from "./composables/useTranscriptionManager";
import { useTranscriptionStore } from "./stores/transcriptionStore";
import { useTranscriptionViewer } from "@/composables/useTranscriptionViewer";
import { assetManagerEngine } from "@/composables/useAssetManager";
import { smartDecode } from "@/utils/encoding";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { ToolRegistry, ToolConfig } from "@/services/types";
import type { Asset, AssetSidecarAction } from "@/types/asset-management";
import type { TranscriptionConfig, TranscriptionTask } from "./types";

const logger = createModuleLogger("transcription/registry");
const errorHandler = createModuleErrorHandler("transcription/registry");

export default class TranscriptionRegistry implements ToolRegistry {
  public readonly id = "transcription";
  public readonly name = "多模态转写管理";
  public readonly description = "管理从图片、音频、视频和 PDF 中提取文本内容的转写任务";

  private _manager: ReturnType<typeof useTranscriptionManager> | null = null;

  /**
   * 获取转写管理器实例（惰性初始化）
   */
  private get manager() {
    if (!this._manager) {
      this._manager = useTranscriptionManager();
    }
    return this._manager;
  }

  // ==================== 核心业务方法 ====================

  /**
   * 添加转写任务
   * @param asset 资产对象
   * @param overrideConfig 覆盖配置
   * @param options 额外选项
   * @param options.activateWorkbench 是否请求工作台加载该资产（用于外部模块发送场景）
   */
  public addTask(
    asset: Asset,
    overrideConfig?: Partial<TranscriptionConfig>,
    options?: { activateWorkbench?: boolean }
  ): TranscriptionTask | null {
    return errorHandler.wrapSync(
      () => {
        logger.info("添加转写任务", { assetId: asset.id, assetName: asset.name, activateWorkbench: options?.activateWorkbench });
        const task = this.manager.addTask(asset, overrideConfig);

        // 如果请求激活工作台，设置 pending 标记
        if (options?.activateWorkbench) {
          const store = useTranscriptionStore();
          store.pendingWorkbenchAssetId = asset.id;
        }

        return task;
      },
      {
        userMessage: "添加转写任务失败",
        context: { assetId: asset.id },
      }
    );
  }

  /**
   * 获取转写文本
   * @param asset 资产对象
   */
  public async getTranscriptionText(asset: Asset): Promise<string | null> {
    return await errorHandler.wrapAsync(
      async () => {
        return await this.manager.getTranscriptionText(asset);
      },
      {
        userMessage: "获取转写文本失败",
        context: { assetId: asset.id },
      }
    );
  }

  /**
   * 重试转写任务
   * @param asset 资产对象
   * @param overrideConfig 覆盖配置
   */
  public retryTask(asset: Asset, overrideConfig?: Partial<TranscriptionConfig>): void {
    errorHandler.wrapSync(
      () => {
        logger.info("重试转写任务", { assetId: asset.id });
        this.manager.retryTask(asset, overrideConfig);
      },
      {
        userMessage: "重试转写任务失败",
        context: { assetId: asset.id },
      }
    );
  }

  /**
   * 取消转写任务
   * @param assetId 资产 ID
   */
  public cancelTask(assetId: string): void {
    errorHandler.wrapSync(
      () => {
        logger.info("取消转写任务", { assetId });
        this.manager.cancelTask(assetId);
      },
      {
        userMessage: "取消转写任务失败",
        context: { assetId },
      }
    );
  }

  /**
   * 打开转写查看器
   * 封装了从读取文件到保存的完整 UI 逻辑
   */
  public async openTranscriptionViewer(asset: Asset): Promise<void> {
    const derived = asset.metadata?.derived?.transcription;
    if (!derived || !derived.path) {
      customMessage.warning("该资产没有转写内容");
      return;
    }

    try {
      logger.debug("正在读取转写内容", { assetId: asset.id, path: derived.path });
      const buffer = await assetManagerEngine.getAssetBinary(derived.path);
      const text = smartDecode(buffer);

      const transcriptionViewer = useTranscriptionViewer();
      transcriptionViewer.show({
        asset,
        initialContent: text,
        showRegenerate: false,
        onSave: async (content) => {
          const d = asset.metadata?.derived?.transcription;
          if (!d || !d.path) return;

          const basePath = await assetManagerEngine.getAssetBasePath();
          const fullPath = await join(basePath, d.path);

          await writeTextFile(fullPath, content);

          // 更新元数据中的更新时间
          await invoke("update_asset_derived_data", {
            assetId: asset.id,
            key: "transcription",
            data: {
              ...d,
              updatedAt: new Date().toISOString(),
            },
          });

          customMessage.success("转写内容已保存");
          transcriptionViewer.close();
        },
      });
    } catch (error) {
      errorHandler.error(error, "读取转写内容失败");
    }
  }

  /**
   * 获取资产附属操作
   */
  public getAssetSidecarActions(): AssetSidecarAction[] {
    return [
      {
        id: "view-transcription",
        label: "查看转写",
        icon: markRaw(FileText),
        isVisible: (asset) => !!asset.metadata?.derived?.transcription?.path,
        handler: (asset) => this.openTranscriptionViewer(asset),
        divided: true,
        order: 100,
      },
    ];
  }
}

// 导出单例实例供直接使用
export const transcriptionRegistry = new TranscriptionRegistry();

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: "多模态转写",
  path: "/transcription",
  icon: markRaw(FileAudio),
  component: () => import("./TranscriptionTool.vue"),
  description: "从图片、音频、视频和 PDF 中提取文本内容",
  category: "AI 工具",
};