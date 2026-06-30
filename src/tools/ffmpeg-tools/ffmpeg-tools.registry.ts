import { markRaw } from "vue";
import { Video } from "lucide-vue-next";
import type {
  ToolRegistry,
  ToolConfig,
  ServiceMetadata,
  ToolContext,
} from "@/services/types";
import { createModuleLogger } from "@/utils/logger";
import { normalizeAgentBooleanFields } from "@/utils/agentArgs";
import * as actions from "./actions";

const logger = createModuleLogger("ffmpeg-tools/registry");

export default class FFmpegToolsRegistry implements ToolRegistry {
  public readonly id = "ffmpeg-tools";
  public readonly name = "FFmpeg 多媒体工作台";
  public readonly description =
    "高效的音视频压缩、转换与处理工具，支持任意 FFmpeg 命令编排";

  public async initialize() {
    logger.info("FFmpeg 工具初始化");
  }

  // ==================== Agent 方法 ====================

  /**
   * [Agent] 执行单条 FFmpeg 命令
   */
  public executeCommand(
    args: actions.ExecuteCommandArgs,
    context?: ToolContext
  ): Promise<string> {
    const normalizedArgs = normalizeAgentBooleanFields(
      args as unknown as Record<string, unknown>,
      ["hwaccel"]
    ) as unknown as actions.ExecuteCommandArgs;
    return actions.executeCommand(normalizedArgs, context);
  }

  /**
   * [Agent] 执行多步串行 FFmpeg 管道
   */
  public executePipeline(
    args: actions.ExecutePipelineArgs,
    context?: ToolContext
  ): Promise<string> {
    const normalizedArgs = normalizeAgentBooleanFields(
      args as unknown as Record<string, unknown>,
      ["cleanupIntermediates"]
    ) as unknown as actions.ExecutePipelineArgs;
    normalizedArgs.steps = normalizedArgs.steps?.map((step) =>
      normalizeAgentBooleanFields(step as unknown as Record<string, unknown>, [
        "hwaccel",
      ])
    ) as unknown as actions.PipelineStep[];
    return actions.executePipeline(normalizedArgs, context);
  }

  /**
   * [Agent] 获取媒体文件信息
   */
  public getMediaInfo(args: actions.GetMediaInfoArgs): Promise<string> {
    const normalizedArgs = normalizeAgentBooleanFields(
      args as unknown as Record<string, unknown>,
      ["detailed"]
    ) as unknown as actions.GetMediaInfoArgs;
    return actions.getMediaInfo(normalizedArgs);
  }

  // ==================== 元数据 ====================

  public getMetadata(): ServiceMetadata {
    return {
      methods: [
        {
          name: "executeCommand",
          displayName: "执行 FFmpeg 命令",
          description:
            "执行单条 FFmpeg 命令。传入参数数组（不含 ffmpeg 本身、-i 输入路径和输出路径），系统自动拼接完整命令并执行。适用于视频压缩、格式转换、音频提取等任意 FFmpeg 操作。",
          agentCallable: true,
          executionMode: "async",
          asyncConfig: {
            hasProgress: true,
            cancellable: true,
            estimatedDuration: 60,
          },
          parameters: [
            {
              name: "args",
              type: "ExecuteCommandArgs",
              description: "命令参数",
              properties: [
                {
                  name: "inputPath",
                  type: "string",
                  description: "输入文件的完整路径",
                  required: true,
                  uiHint: "path",
                },
                {
                  name: "outputPath",
                  type: "string",
                  description:
                    "输出文件路径（可选，不填则在输入文件同目录自动生成 _processed 后缀文件）",
                  required: false,
                  uiHint: "path",
                },
                {
                  name: "args",
                  type: "string[]",
                  description:
                    'FFmpeg 参数数组，不含 ffmpeg 本身、-i 和输出路径。例如: ["-c:v", "libx264", "-crf", "23", "-c:a", "aac", "-b:a", "128k"]',
                  required: true,
                },
                {
                  name: "hwaccel",
                  type: "boolean",
                  description: "是否启用硬件加速（默认 true）",
                  required: false,
                  defaultValue: true,
                },
                {
                  name: "taskName",
                  type: "string",
                  description: "任务显示名称（可选）",
                  required: false,
                },
              ],
            },
          ],
          returnType: "Promise<string>",
          example:
            'executeCommand({ inputPath: "C:/video.mp4", args: ["-c:v", "libx264", "-crf", "23", "-c:a", "aac"] })',
        },
        {
          name: "executePipeline",
          displayName: "执行 FFmpeg 管道",
          description:
            '执行多步串行 FFmpeg 命令管道。每步可引用上一步输出（inputPath 设为 "$prev"），支持自动清理中间文件。适用于需要多次处理的复杂场景，如：提取音频→转码→合并，或视频裁剪→压缩→加水印。',
          agentCallable: true,
          executionMode: "async",
          asyncConfig: {
            hasProgress: true,
            cancellable: true,
            estimatedDuration: 120,
          },
          parameters: [
            {
              name: "args",
              type: "ExecutePipelineArgs",
              description: "管道参数",
              properties: [
                {
                  name: "steps",
                  type: "PipelineStep[]",
                  description:
                    '管道步骤列表。每步包含 name（步骤名）、inputPath（输入路径，后续步骤可用 "$prev"）、args（FFmpeg 参数数组）。可选：outputPath、outputExt、hwaccel',
                  required: true,
                },
                {
                  name: "pipelineName",
                  type: "string",
                  description: "管道名称（用于显示）",
                  required: false,
                },
                {
                  name: "cleanupIntermediates",
                  type: "boolean",
                  description: "是否在完成后清理中间临时文件（默认 true）",
                  required: false,
                  defaultValue: true,
                },
              ],
            },
          ],
          returnType: "Promise<string>",
          example:
            'executePipeline({ steps: [{ name: "压缩视频", inputPath: "C:/input.mp4", args: ["-c:v", "libx264", "-crf", "28"] }, { name: "提取音频", inputPath: "$prev", outputExt: "mp3", args: ["-vn", "-c:a", "libmp3lame", "-b:a", "192k"] }] })',
        },
        {
          name: "getMediaInfo",
          displayName: "获取媒体信息",
          description:
            "获取媒体文件的元数据（时长、分辨率、编码器、码率等）。设置 detailed=true 可获取完整的流信息（需要 ffprobe）。",
          agentCallable: true,
          parameters: [
            {
              name: "args",
              type: "GetMediaInfoArgs",
              description: "查询参数",
              properties: [
                {
                  name: "path",
                  type: "string",
                  description: "媒体文件路径",
                  required: true,
                  uiHint: "path",
                },
                {
                  name: "detailed",
                  type: "boolean",
                  description: "是否返回详细流信息（默认 false）",
                  required: false,
                  defaultValue: false,
                },
              ],
            },
          ],
          returnType: "Promise<string>",
          example: 'getMediaInfo({ path: "C:/video.mp4", detailed: true })',
        },
      ],
    };
  }
}

export const ffmpegToolsRegistry = new FFmpegToolsRegistry();

export const toolConfig: ToolConfig = {
  name: "FFmpeg 工具",
  path: "/ffmpeg-tools",
  icon: markRaw(Video),
  component: () => import("./FFmpegTool.vue"),
  description: "音视频压缩、提取音频、格式转换",
  category: ["媒体工具"],
  version: "1.0.6",
};
