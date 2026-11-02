export type ToolSummaryItem = {
  label: string;
  toolName: string;
  status: "success" | "error" | "info";
  statusLabel: string;
};

type NormalizedToolStatus = "success" | "error" | "info";

const SUMMARY_STATUS_PATTERN =
  /(成功|完成|失败|错误|异常|超时|拒绝|取消|中止|跳过)(?:\s*[（(]记录ID[:：][^）)]*[）)])?$/;

export function normalizeToolStatus(statusText: string): NormalizedToolStatus {
  if (/成功|完成|success|succeeded|ok/i.test(statusText)) {
    return "success";
  }

  if (
    /失败|错误|异常|超时|拒绝|取消|中止|error|fail|failed|timeout|rejected|cancel/i.test(
      statusText
    )
  ) {
    return "error";
  }

  return "info";
}

export function parseToolSummaryItems(content: string): ToolSummaryItem[] {
  return content
    .split(/[；;]/)
    .map((item) => item.trim().replace(/[。.\s]+$/g, ""))
    .filter(Boolean)
    .map((label) => {
      const match = new RegExp(
        `^(.*?)\\s*调用\\s*${SUMMARY_STATUS_PATTERN.source}`
      ).exec(label);
      const toolName = match?.[1]?.trim() || label;
      const statusLabel = match?.[2] || "摘要";
      const status = normalizeToolStatus(statusLabel);

      return {
        label,
        toolName,
        status,
        statusLabel,
      };
    });
}
