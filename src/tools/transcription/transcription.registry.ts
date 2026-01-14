/**
 * 多模态转写 外观服务
 *
 * 轻量级外观服务，为外部调用提供对转写功能的编程接口。
 * 不包含核心业务逻辑，仅作为 useTranscriptionManager 的薄层封装。
 */

import { markRaw } from "vue";
import { FileAudio } from "lucide-vue-next";
import { useTranscriptionManager } from "./composables/useTranscriptionManager";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { ToolRegistry, ToolConfig } from "@/services/types";
import type { Asset } from "@/types/asset-management";
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
   */
  public addTask(asset: Asset, overrideConfig?: Partial<TranscriptionConfig>): TranscriptionTask | null {
    return errorHandler.wrapSync(
      () => {
        logger.info("添加转写任务", { assetId: asset.id, assetName: asset.name });
        return this.manager.addTask(asset, overrideConfig);
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