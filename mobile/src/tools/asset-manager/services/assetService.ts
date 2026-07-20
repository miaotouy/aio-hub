import { invoke } from "@tauri-apps/api/core";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import type {
  AssetDetail,
  AssetImportResult,
  AssetImportSource,
  AssetListQuery,
  AssetRecord,
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
