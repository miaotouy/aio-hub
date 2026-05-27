/**
 * FFmpeg Agent Action: 执行多步串行管道
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  basename,
  dirname,
  extname,
  join,
  appDataDir,
} from "@tauri-apps/api/path";
import { useFFmpegStore } from "../ffmpegStore";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { ToolContext } from "@/services/types";
import type { FFmpegParams, FFmpegProgress } from "../types";

const logger = createModuleLogger("ffmpeg-tools/actions/executePipeline");
const errorHandler = createModuleErrorHandler(
  "ffmpeg-tools/actions/executePipeline"
);

export interface PipelineStep {
  /** 步骤名称（用于进度显示） */
  name: string;
  /**
   * 输入路径。
   * - 第一步：必须是实际文件路径
   * - 后续步骤：使用 "$prev" 表示上一步的输出
   */
  inputPath: string;
  /** 输出路径（可选，不填则自动生成临时文件） */
  outputPath?: string;
  /** 输出文件扩展名（当 outputPath 为空时用于确定格式，默认 "mp4"） */
  outputExt?: string;
  /** FFmpeg 参数数组 */
  args: string[];
  /** 是否启用硬件加速（默认 true） */
  hwaccel?: boolean;
}

export interface ExecutePipelineArgs {
  /** 管道步骤列表（按顺序串行执行） */
  steps: PipelineStep[];
  /** 管道名称（可选） */
  pipelineName?: string;
  /** 是否在完成后清理中间文件（默认 true） */
  cleanupIntermediates?: boolean;
}

/**
 * 生成临时文件路径
 */
async function generateTempPath(
  stepIndex: number,
  ext: string
): Promise<string> {
  const appData = await appDataDir();
  const tempDir = await join(appData, "ffmpeg-temp");
  // 确保临时目录存在
  await invoke("create_dir_force", { path: tempDir }).catch(() => {
    // 目录可能已存在，忽略
  });
  const timestamp = Date.now();
  const fileName = `pipeline_step${stepIndex}_${timestamp}.${ext}`;
  return await join(tempDir, fileName);
}

/**
 * 删除临时文件（移动到回收站）
 */
async function cleanupTempFiles(paths: string[]): Promise<void> {
  for (const filePath of paths) {
    try {
      await invoke("delete_file_to_trash", { filePath });
    } catch {
      // 忽略清理失败
    }
  }
}

export async function executePipeline(
  args: ExecutePipelineArgs,
  context?: ToolContext
): Promise<string> {
  const {
    steps,
    pipelineName = "FFmpeg 管道",
    cleanupIntermediates = true,
  } = args;

  // 参数验证
  if (!steps || !Array.isArray(steps) || steps.length === 0) {
    return JSON.stringify({
      success: false,
      error: "缺少必需参数: steps（管道步骤列表）",
    });
  }

  if (steps[0].inputPath === "$prev") {
    return JSON.stringify({
      success: false,
      error: "第一步的 inputPath 不能是 $prev",
    });
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step.args || !Array.isArray(step.args) || step.args.length === 0) {
      return JSON.stringify({
        success: false,
        error: `步骤 ${i + 1} (${step.name}) 缺少 args 参数`,
      });
    }
  }

  if (!context?.isAsync) {
    return JSON.stringify({
      success: false,
      error: "此方法必须作为异步任务执行",
    });
  }

  const result = await errorHandler.wrapAsync(
    async () => {
      const store = useFFmpegStore();
      const startTime = Date.now();
      const intermediateFiles: string[] = [];
      const stepResults: Array<{
        name: string;
        status: string;
        outputPath?: string;
        error?: string;
      }> = [];
      let prevOutputPath = "";

      // 验证第一步输入文件存在
      const firstInputExists = await invoke<boolean>("path_exists", {
        path: steps[0].inputPath,
      });
      if (!firstInputExists) {
        return JSON.stringify({
          success: false,
          error: `输入文件不存在: ${steps[0].inputPath}`,
        });
      }

      context.reportStatus(
        `开始执行管道: ${pipelineName} (${steps.length} 步)`,
        0
      );
      logger.info("Agent 启动 FFmpeg 管道", {
        pipelineName,
        stepCount: steps.length,
      });

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const isLastStep = i === steps.length - 1;

        // 检查取消信号
        if (context.signal?.aborted) {
          // 清理已生成的中间文件
          if (cleanupIntermediates) {
            await cleanupTempFiles(intermediateFiles);
          }
          const abortError = new Error("任务已取消");
          abortError.name = "AbortError";
          throw abortError;
        }

        // 解析输入路径
        const inputPath =
          step.inputPath === "$prev" ? prevOutputPath : step.inputPath;
        if (!inputPath) {
          stepResults.push({
            name: step.name,
            status: "failed",
            error: "输入路径为空",
          });
          break;
        }

        // 解析输出路径
        let outputPath: string;
        if (step.outputPath) {
          outputPath = step.outputPath;
        } else if (isLastStep) {
          // 最后一步：输出到第一步输入文件的同目录
          const firstInput = steps[0].inputPath;
          const dir = await dirname(firstInput);
          const name = await basename(firstInput);
          const nameWithoutExt = name.substring(0, name.lastIndexOf("."));
          const ext = step.outputExt || (await extname(firstInput));
          outputPath = await join(dir, `${nameWithoutExt}_pipeline.${ext}`);
        } else {
          // 中间步骤：输出到临时目录
          const ext = step.outputExt || "mp4";
          outputPath = await generateTempPath(i, ext);
          intermediateFiles.push(outputPath);
        }

        // 构建参数
        const params: FFmpegParams = {
          mode: "custom",
          inputPath,
          outputPath,
          ffmpegPath: store.config.ffmpegPath,
          hwaccel: step.hwaccel ?? true,
          customArgs: step.args,
        };

        // 创建任务
        const task = store.addTask({
          name: `[${pipelineName}] ${step.name}`,
          inputPath,
          outputPath,
          mode: "custom",
        });

        const stepProgress = (percent: number) => {
          // 计算整体进度：每步占 100/totalSteps 的比例
          const stepWeight = 100 / steps.length;
          const overallPercent = Math.floor(
            i * stepWeight + (percent / 100) * stepWeight
          );
          context.reportStatus(
            `步骤 ${i + 1}/${steps.length}: ${step.name} (${percent.toFixed(1)}%)`,
            overallPercent
          );
        };

        stepProgress(0);

        // 监听进度
        const unlistenProgress = await listen<{
          taskId: string;
          progress: FFmpegProgress;
        }>("ffmpeg-progress", (event) => {
          if (event.payload.taskId === task.id) {
            const p = event.payload.progress;
            store.updateTaskProgress(task.id, p);
            stepProgress(p.percent);
          }
        });

        const unlistenLog = await listen<{ taskId: string; message: string }>(
          "ffmpeg-log",
          (event) => {
            if (event.payload.taskId === task.id) {
              store.addTaskLog(task.id, event.payload.message);
            }
          }
        );

        try {
          store.updateTask(task.id, { status: "processing" });
          store.addTaskLog(
            task.id,
            `[Pipeline] 步骤 ${i + 1}/${steps.length}: ${step.name}`
          );
          store.addTaskLog(task.id, `[Pipeline] 参数: ${step.args.join(" ")}`);

          const outputResult = await invoke<string>("process_media", {
            taskId: task.id,
            params,
          });

          store.updateTask(task.id, {
            status: "completed",
            outputPath: outputResult,
          });
          prevOutputPath = outputResult;
          stepResults.push({
            name: step.name,
            status: "completed",
            outputPath: outputResult,
          });
          stepProgress(100);
        } catch (error: any) {
          if (error.name === "AbortError") {
            try {
              await invoke("kill_ffmpeg_process", { taskId: task.id });
            } catch {
              // 忽略
            }
            store.updateTask(task.id, { status: "cancelled" });
            if (cleanupIntermediates) {
              await cleanupTempFiles(intermediateFiles);
            }
            throw error;
          }

          const errorMsg = error?.toString() || "未知错误";
          store.updateTask(task.id, { status: "failed", error: errorMsg });
          store.addTaskLog(task.id, `[Error] ${errorMsg}`);
          stepResults.push({
            name: step.name,
            status: "failed",
            error: errorMsg,
          });

          // 管道中断
          logger.error("管道步骤失败", error, { step: i, stepName: step.name });
          break;
        } finally {
          unlistenProgress();
          unlistenLog();
        }
      }

      // 清理中间文件
      if (cleanupIntermediates && intermediateFiles.length > 0) {
        await cleanupTempFiles(intermediateFiles);
        logger.info("已清理中间文件", { count: intermediateFiles.length });
      }

      // 构建结果
      const completedSteps = stepResults.filter(
        (r) => r.status === "completed"
      ).length;
      const totalSteps = steps.length;
      const allSuccess = completedSteps === totalSteps;
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      const finalOutputPath = allSuccess
        ? stepResults[stepResults.length - 1]?.outputPath
        : undefined;

      context.reportStatus(
        allSuccess
          ? "管道处理完成"
          : `管道处理中断: ${completedSteps}/${totalSteps} 步完成`,
        allSuccess ? 100 : Math.floor((completedSteps / totalSteps) * 100)
      );

      return JSON.stringify(
        {
          success: allSuccess,
          pipelineName,
          completedSteps,
          totalSteps,
          finalOutputPath,
          duration: `${duration}秒`,
          message: allSuccess
            ? `管道处理完成：${totalSteps} 步骤全部成功`
            : `管道处理中断：${completedSteps}/${totalSteps} 步骤完成`,
          stepResults,
        },
        null,
        2
      );
    },
    { userMessage: "执行 FFmpeg 管道失败" }
  );

  return result ?? JSON.stringify({ success: false, error: "管道执行失败" });
}
