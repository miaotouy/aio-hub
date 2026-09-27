import { open } from "@tauri-apps/plugin-dialog";
import type { AssetImportSource } from "../types";
import { capturePhoto } from "./assetService";

export type AssetImportPickerSource = "file" | "photo" | "camera";

export interface ResolveAssetImportSourcesOptions {
  /** 写入资产来源的模块标识，默认沿用资产管理器自身。 */
  sourceModule?: string;
}

/**
 * 从系统选择器返回的引用提取展示名，供导入源使用。
 * 只处理引用字符串本身，不解析或持久化真实路径。
 */
export function fileNameFromReference(reference: string): string {
  try {
    return (
      decodeURIComponent(reference.replace(/\\/g, "/")).split("/").pop() ||
      "未命名文件"
    );
  } catch {
    return reference.split("/").pop() || "未命名文件";
  }
}

/**
 * 复用资产管理器的系统入口获得导入源：系统文件选择器、媒体选择器或相机。
 * 用户取消时返回 null，调用方不应启动导入任务。
 */
export async function resolveAssetImportSources(
  source: AssetImportPickerSource,
  options: ResolveAssetImportSourcesOptions = {}
): Promise<AssetImportSource[] | null> {
  const sourceModule = options.sourceModule ?? "asset-manager";
  if (source === "camera") {
    const cameraSource = await capturePhoto();
    return cameraSource ? [cameraSource] : null;
  }

  const selection = await open({
    multiple: true,
    directory: false,
    pickerMode: source === "photo" ? "media" : "document",
    fileAccessMode: source === "file" ? "scoped" : "copy",
    filters:
      source === "photo"
        ? [{ name: "照片和视频", extensions: ["image/*", "video/*"] }]
        : undefined,
  });
  if (!selection) return null;

  const references = Array.isArray(selection) ? selection : [selection];
  return references.map((reference) => ({
    reference,
    originKind: source === "photo" ? "photo_picker" : "file_picker",
    sourceModule,
    originalName: fileNameFromReference(reference),
  }));
}
