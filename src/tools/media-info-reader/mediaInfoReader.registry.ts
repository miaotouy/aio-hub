import type { ToolConfig, ToolRegistry } from "@/services/types";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler, ErrorLevel } from "@/utils/errorHandler";
import { readFile } from '@tauri-apps/plugin-fs';
import { useMediaInfoParser } from './composables/useMediaInfoParser';
import type { ImageMetadataResult, WebUIInfo } from './types';
import { markRaw } from "vue";
import { PictureFilled } from '@element-plus/icons-vue';

const logger = createModuleLogger("services/media-info-reader");
const errorHandler = createModuleErrorHandler("services/media-info-reader");

// ==================== 导出类型 ====================

export type { ImageMetadataResult, WebUIInfo };

// ==================== 服务类 ====================

/**
 * 媒体信息解析服务
 *
 * 提供从 AI 生成图片、SillyTavern 角色卡以及 AioBundle (AIO 角色包) 等文件中提取元数据的能力。
 * 服务层作为薄层入口，核心业务逻辑由各个 parser 实现。
 */
export default class MediaInfoReaderRegistry implements ToolRegistry {
  public readonly id = "media-info-reader";
  public readonly name = "AI 信息解析器";
  public readonly description = "解析 AI 图片（SD/ComfyUI）、SillyTavern 角色卡及 AioBundle (AIO 角色包) 的元数据与 Prompt。";

  // ==================== 高级封装方法 (Agent 调用接口) ====================

  /**
   * [Agent Friendly] 从图片文件路径读取并解析元数据
   * @param filePath 图片的绝对路径
   * @returns 解析后的元数据，如果失败则返回 null
   */
  public async readImageMetadata(filePath: string): Promise<ImageMetadataResult | null> {
    logger.info(`开始读取图片元数据: ${filePath}`);

    return await errorHandler.wrapAsync(
      async () => {
        const buffer = await readFile(filePath);
        const { parseImageBuffer } = useMediaInfoParser();
        const result = await parseImageBuffer(buffer);

        logger.info("图片元数据解析完成", { filePath });
        return result;
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: "读取或解析图片元数据失败",
        context: { filePath },
      }
    );
  }

  /**
   * [应用内部调用] 直接从图片 buffer 中解析元数据
   * @param buffer 图片文件的 Uint8Array buffer
   * @returns 解析后的元数据，如果失败则返回 null
   */
  public async parseImageBuffer(buffer: Uint8Array): Promise<ImageMetadataResult | null> {
    logger.info("开始解析图片 buffer");

    return await errorHandler.wrapAsync(
      async () => {
        const { parseImageBuffer } = useMediaInfoParser();
        const result = await parseImageBuffer(buffer);

        logger.info("图片 buffer 解析完成");
        return result;
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: "解析图片 buffer 失败",
      }
    );
  }

  // ==================== 元数据 ====================

  public getMetadata() {
    return {
      methods: [
        {
          name: "readImageMetadata",
          description: "[Agent 调用] 从指定的图片文件路径读取并解析 AI 元数据。",
          parameters: [
            {
              name: "filePath",
              type: "string",
              description: "图片的完整文件路径。",
            },
          ],
          returnType: "Promise<ImageMetadataResult | null>",
          example: `
const result = await service.readImageMetadata("C:/path/to/your/image.png");
if (result) {
  console.log(result.webuiInfo.positivePrompt);
  console.log(result.comfyuiWorkflow);
}`,
        },
        {
          name: "parseImageBuffer",
          description: "[应用内部] 直接从图片的 Uint8Array buffer 中解析 AI 元数据。适用于从浏览器或其他来源获取的图片数据。",
          parameters: [
            {
              name: "buffer",
              type: "Uint8Array",
              description: "图片文件的二进制数据。",
            },
          ],
          returnType: "Promise<ImageMetadataResult | null>",
          example: `
const buffer = new Uint8Array([...]); // 从某处获取的图片数据
const result = await service.parseImageBuffer(buffer);
if (result) {
  console.log(result.webuiInfo.positivePrompt);
}`,
        },
      ],
    };
  }
}

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: '媒体信息解析',
  path: '/media-info-reader',
  icon: markRaw(PictureFilled),
  component: () => import('./MediaInfoReader.vue'),
  description: '深度解析 AI 图片元数据、SillyTavern 角色卡及 AioBundle (AIO 角色包) 信息',
  category: 'AI 工具'
};