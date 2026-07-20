import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import {
  getAssetPreviewSource,
  listAssets,
  revokeAssetPreviewSource,
} from "@/tools/asset-manager/services/assetService";
import type {
  AssetRecord,
  AssetPreviewSource,
} from "@/tools/asset-manager/types";
import type {
  ValidationCommandResult,
  ValidationStepResult,
} from "../types/validation";

const logger = createModuleLogger("ui-tester/asset-preview");
const errorHandler = createModuleErrorHandler("ui-tester/asset-preview");
const RANGE_LENGTH = 32;

function step(
  id: string,
  label: string,
  status: ValidationStepResult["status"],
  summary: string,
  details?: ValidationStepResult["details"]
): ValidationStepResult {
  return { id, label, status, durationMs: 0, summary, details };
}

function selectCandidate(assets: AssetRecord[]): AssetRecord | undefined {
  return assets.find(
    (asset) =>
      asset.availability === "ready" &&
      asset.storageMode === "managed" &&
      asset.sizeBytes > 0
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runAssetPreviewProtocolValidation(): Promise<ValidationCommandResult> {
  const steps: ValidationStepResult[] = [];
  let preview: AssetPreviewSource | undefined;
  let revoked = false;
  try {
    const assets = await listAssets({
      includeUnavailable: false,
      limit: 100,
      offset: 0,
    });
    const candidate = selectCandidate(assets);
    if (!candidate) {
      return {
        status: "failed",
        steps: [
          step(
            "asset-candidate",
            "选择可预览资产",
            "failed",
            "资产库中没有可用的 managed/ready 原件，请先导入一个非空资产。"
          ),
        ],
        metrics: { candidateCount: 0 },
      };
    }
    steps.push(
      step(
        "asset-candidate",
        "选择可预览资产",
        "passed",
        `已选择 ${candidate.kind} 资产，大小 ${candidate.sizeBytes} bytes。`,
        {
          kind: candidate.kind,
          mimeType: candidate.mimeType,
          sizeBytes: candidate.sizeBytes,
        }
      )
    );

    preview = await getAssetPreviewSource(candidate.id);
    const rangeEnd = Math.min(
      RANGE_LENGTH - 1,
      Math.max(0, preview.sizeBytes - 1)
    );
    const rangeResponse = await fetch(preview.url, {
      cache: "no-store",
      headers: { Range: `bytes=0-${rangeEnd}` },
    });
    const rangeBody = await rangeResponse.arrayBuffer();
    const expectedLength = rangeEnd + 1;
    const rangePassed =
      rangeResponse.status === 206 &&
      rangeBody.byteLength === expectedLength &&
      rangeResponse.headers.get("accept-ranges") === "bytes" &&
      (rangeResponse.headers.get("content-range") ?? "").startsWith(
        `bytes 0-${rangeEnd}/`
      );
    steps.push(
      step(
        "asset-range-cors",
        "跨源 Range 读取",
        rangePassed ? "passed" : "failed",
        rangePassed
          ? `收到 206 与 ${rangeBody.byteLength} bytes，跨源响应头可读取。`
          : `Range 响应不符合预期：status=${rangeResponse.status}，bytes=${rangeBody.byteLength}。`,
        {
          status: rangeResponse.status,
          bytes: rangeBody.byteLength,
          expectedBytes: expectedLength,
          acceptRanges: rangeResponse.headers.get("accept-ranges") ?? "",
          contentRange: rangeResponse.headers.get("content-range") ?? "",
        }
      )
    );

    const headResponse = await fetch(preview.url, {
      method: "HEAD",
      cache: "no-store",
    });
    const headBody = await headResponse.arrayBuffer();
    const headContentLength = headResponse.headers.get("content-length") ?? "";
    const headPassed =
      headResponse.status === 200 &&
      headBody.byteLength === 0 &&
      headResponse.headers.get("accept-ranges") === "bytes";
    steps.push(
      step(
        "asset-head",
        "HEAD 元数据读取",
        headPassed ? "passed" : "failed",
        headPassed
          ? `HEAD 返回 200 与空 body；WebView 可见长度为 ${headContentLength || "未知"}。`
          : `HEAD 响应不符合预期：status=${headResponse.status}，body=${headBody.byteLength} bytes。`,
        {
          status: headResponse.status,
          bodyBytes: headBody.byteLength,
          acceptRanges: headResponse.headers.get("accept-ranges") ?? "",
          contentLength: headContentLength,
          expectedLength: preview.sizeBytes,
        }
      )
    );

    revoked = await revokeAssetPreviewSource(preview.id);
    const revokedResponse = await fetch(preview.url, { cache: "no-store" });
    const revokePassed = revoked && revokedResponse.status === 404;
    steps.push(
      step(
        "asset-revoke",
        "撤销预览令牌",
        revokePassed ? "passed" : "failed",
        revokePassed
          ? "主动撤销后原预览 URL 返回 404，不暴露令牌历史状态。"
          : `撤销结果不符合预期：revoked=${revoked}，status=${revokedResponse.status}。`,
        { revoked, status: revokedResponse.status }
      )
    );

    const status = steps.every((item) => item.status === "passed")
      ? "passed"
      : "failed";
    return {
      status,
      steps,
      metrics: {
        kind: candidate.kind,
        mimeType: candidate.mimeType,
        sizeBytes: candidate.sizeBytes,
        rangeBytes: expectedLength,
      },
    };
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "资产预览协议验证失败",
      showToUser: false,
    });
    logger.warn("资产预览协议验证失败", { message: errorMessage(error) });
    return {
      status: "failed",
      steps: [
        ...steps,
        step(
          "asset-preview-command",
          "执行预览协议验证",
          "failed",
          errorMessage(error)
        ),
      ],
      metrics: {},
    };
  } finally {
    if (preview && !revoked) {
      await revokeAssetPreviewSource(preview.id).catch((error) => {
        logger.warn("清理资产预览令牌失败", { message: errorMessage(error) });
      });
    }
  }
}
