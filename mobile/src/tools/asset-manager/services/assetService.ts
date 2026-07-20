import { invoke } from "@tauri-apps/api/core";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import type {
  AssetDeleteAnalysis,
  AssetDeleteResult,
  AssetDetail,
  AssetImportResult,
  AssetImportSource,
  AssetListQuery,
  AssetRecord,
  AssetRepairReport,
  AssetRetentionPolicy,
  AssetStorageSummary,
  AssetUsageInput,
} from "../types";

const logger = createModuleLogger("asset-manager/service");
const errorHandler = createModuleErrorHandler("asset-manager/service");

export async function importAssetSources(
  sources: AssetImportSource[]
): Promise<AssetImportResult[]> {
  try {
    const results = await invoke<AssetImportResult[]>("asset_import_sources", {
      sources,
    });
    logger.info("资产导入批次完成", {
      total: results.length,
      succeeded: results.filter((result) => result.status !== "failed").length,
      failed: results.filter((result) => result.status === "failed").length,
    });
    return results;
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "资产导入服务不可用",
      showToUser: false,
    });
    throw error;
  }
}

export async function listAssets(
  query: AssetListQuery = {}
): Promise<AssetRecord[]> {
  try {
    return await invoke<AssetRecord[]>("asset_list", { query });
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "无法读取资产列表",
      showToUser: false,
    });
    throw error;
  }
}

export async function getAssetDetail(assetId: string): Promise<AssetDetail> {
  try {
    return await invoke<AssetDetail>("asset_get_detail", { assetId });
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "无法读取资产详情",
      showToUser: false,
    });
    throw error;
  }
}

export async function replaceEntityAssetUsages(
  moduleId: string,
  entityType: string,
  entityId: string,
  usages: AssetUsageInput[]
): Promise<number> {
  try {
    const result = await invoke<{ usageCount: number }>(
      "asset_replace_entity_usages",
      { moduleId, entityType, entityId, usages }
    );
    return result.usageCount;
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "无法同步资产使用关系",
      showToUser: false,
    });
    throw error;
  }
}

export async function analyzeAssetDeletion(
  assetIds: string[]
): Promise<AssetDeleteAnalysis> {
  try {
    return await invoke<AssetDeleteAnalysis>("asset_analyze_delete", {
      assetIds,
    });
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "无法分析资产删除影响",
      showToUser: false,
    });
    throw error;
  }
}

export async function setAssetRetentionPolicy(
  assetIds: string[],
  retentionPolicy: AssetRetentionPolicy
): Promise<number> {
  try {
    const result = await invoke<{ updatedCount: number }>(
      "asset_set_retention_policy",
      { assetIds, retentionPolicy }
    );
    return result.updatedCount;
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "无法更新资产保留策略",
      showToUser: false,
    });
    throw error;
  }
}

export async function deleteAssets(
  assetIds: string[],
  confirmAdvisory = false
): Promise<AssetDeleteResult> {
  try {
    return await invoke<AssetDeleteResult>("asset_delete", {
      assetIds,
      confirmAdvisory,
    });
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "无法删除资产原件",
      showToUser: false,
    });
    throw error;
  }
}

export async function getAssetStorageSummary(): Promise<AssetStorageSummary> {
  try {
    return await invoke<AssetStorageSummary>("asset_get_storage_summary");
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "无法读取资产存储统计",
      showToUser: false,
    });
    throw error;
  }
}

export async function repairAssetLibrary(): Promise<AssetRepairReport> {
  try {
    return await invoke<AssetRepairReport>("asset_repair_library");
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "无法修复资产库",
      showToUser: false,
    });
    throw error;
  }
}
