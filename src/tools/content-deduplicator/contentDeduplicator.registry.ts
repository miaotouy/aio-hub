import type { ToolRegistry, ToolConfig } from "@/services/types";
import { markRaw } from "vue";
import { FileSearch } from "lucide-vue-next";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler, ErrorLevel } from "@/utils/errorHandler";
import { useDeduplicatorRunner } from "./composables/useDeduplicatorRunner";
import { useContentDeduplicatorStore } from "./stores/store";
import { getConfigFromPreset } from "./config/presets";
import { formatBytes } from "@/tools/directory-janitor/utils/utils";
import type { SimilarityConfig, DedupAnalysisResult } from "./types";

const logger = createModuleLogger("tools/content-deduplicator");
const errorHandler = createModuleErrorHandler("tools/content-deduplicator");

// ==================== Agent 调用接口类型 ====================

export interface ScanDuplicatesOptions {
  /** 扫描路径 */
  path: string;
  /** 预设名称 */
  preset?: string;
  /** 完整配置（优先级高于 preset） */
  config?: Partial<SimilarityConfig>;
}

export interface FormattedDedupResult {
  summary: string;
  details: {
    totalFilesScanned: number;
    totalGroups: number;
    totalDuplicates: number;
    totalWastedBytes: number;
    groups: Array<{
      representativeFile: string;
      duplicateCount: number;
      wastedBytes: number;
      matchType: string;
    }>;
  };
}

// ==================== 注册器类 ====================

export default class ContentDeduplicatorRegistry implements ToolRegistry {
  public readonly id = "content-deduplicator";
  public readonly name = "内容查重";
  public readonly description = "扫描目录中的重复文本文件，支持精确匹配和规范化匹配";

  /**
   * [Agent Friendly] 扫描目录查找重复文件
   */
  public async scanDuplicates(
    options: ScanDuplicatesOptions
  ): Promise<FormattedDedupResult | null> {
    logger.info("开始查重扫描 (Agent 调用)", { path: options.path });

    return await errorHandler.wrapAsync(
      async () => {
        const store = useContentDeduplicatorStore();
        const runner = useDeduplicatorRunner();
        await runner.initialize();

        try {
          // 构建配置
          const baseConfig = getConfigFromPreset(options.preset ?? "relaxed");
          store.scanPath = options.path;
          store.config = options.config
            ? {
                ...baseConfig,
                ...options.config,
                normalizeOptions: {
                  ...baseConfig.normalizeOptions,
                  ...options.config.normalizeOptions,
                },
              }
            : baseConfig;

          const result = await runner.scanDirectory();
          if (!result) return null;

          return this.formatResult(result);
        } finally {
          await runner.dispose();
        }
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: "查重扫描失败",
        context: options,
      }
    );
  }

  private formatResult(result: DedupAnalysisResult): FormattedDedupResult {
    const { statistics, groups } = result;

    const summary =
      statistics.totalGroups > 0
        ? `扫描 ${statistics.totalFilesScanned} 个文件，发现 ${statistics.totalGroups} 组重复（${statistics.totalDuplicates} 个冗余文件），可释放 ${formatBytes(statistics.totalWastedBytes)}`
        : `扫描 ${statistics.totalFilesScanned} 个文件，未发现重复`;

    return {
      summary,
      details: {
        totalFilesScanned: statistics.totalFilesScanned,
        totalGroups: statistics.totalGroups,
        totalDuplicates: statistics.totalDuplicates,
        totalWastedBytes: statistics.totalWastedBytes,
        groups: groups.slice(0, 20).map((g) => ({
          representativeFile: g.representativeFile.path,
          duplicateCount: g.similarFiles.length,
          wastedBytes: g.metadata.totalWastedBytes,
          matchType: g.similarFiles[0]?.matchType ?? "exact",
        })),
      },
    };
  }

  public getMetadata() {
    return {
      methods: [
        {
          name: "scanDuplicates",
          description: "[Agent 调用] 扫描目录查找重复文本文件",
          parameters: [
            {
              name: "options",
              type: "ScanDuplicatesOptions",
              description: "扫描选项",
              properties: [
                { name: "path", type: "string", description: "扫描路径", required: true },
                {
                  name: "preset",
                  type: "string",
                  description: "预设: relaxed | strict | code | document",
                  required: false,
                },
                {
                  name: "config",
                  type: "Partial<SimilarityConfig>",
                  description: "自定义配置（覆盖预设）",
                  required: false,
                },
              ],
            },
          ],
          returnType: "Promise<FormattedDedupResult | null>",
          example: `
const result = await service.scanDuplicates({
  path: 'D:/projects/my-app/src',
  preset: 'code',
});

if (result) {
  console.log(result.summary);
  // "扫描 1200 个文件，发现 5 组重复（8 个冗余文件），可释放 45.2 KB"
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
  name: "内容查重",
  path: "/content-deduplicator",
  icon: markRaw(FileSearch),
  component: () => import("./ContentDeduplicator.vue"),
  description: "扫描目录中的重复文本文件，支持多种匹配模式和预设",
  category: "文件管理",
};
