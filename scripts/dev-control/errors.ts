export class ControlError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly hint?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ControlError";
  }
}

export function errorResult(error: unknown) {
  if (error instanceof ControlError) {
    return {
      code: error.code,
      message: error.message,
      hint: error.hint,
      details: error.details,
    };
  }
  // Playwright call logs can include input text; expose only the first diagnostic line.
  const message = (error instanceof Error ? error.message : String(error))
    .split("\n")[0]
    .slice(0, 500);
  const diagnostic = error instanceof Error ? error.message : String(error);
  if (diagnostic.includes("strict mode violation"))
    return {
      code: "TARGET_AMBIGUOUS",
      message: "目标匹配到多个元素。",
      hint: "添加 scope 或使用更精确的定位方式。",
    };
  if (diagnostic.includes("element is not enabled"))
    return {
      code: "TARGET_DISABLED",
      message: "目标控件处于禁用状态。",
      hint: "先完成页面需要的前置操作。",
    };
  if (diagnostic.includes("intercepts pointer events"))
    return {
      code: "TARGET_OBSCURED",
      message: "目标控件被其他元素遮挡。",
      hint: "检查弹窗、菜单或覆盖区域。",
    };
  if (diagnostic.includes("element is not visible"))
    return {
      code: "TARGET_HIDDEN",
      message: "目标控件当前不可见。",
      hint: "确认目标所在面板已打开。",
    };
  if (diagnostic.includes("Execution context was destroyed"))
    return {
      code: "PAGE_RELOADING",
      message: "页面正在刷新。",
      hint: "等待后重新 observe；写操作可能已生效。",
    };
  if (error instanceof Error && error.name === "TimeoutError") {
    return {
      code: "COMMAND_TIMEOUT",
      message: "指令执行超时。",
      hint: "操作可能已生效，请先 observe 确认当前状态。",
    };
  }
  const known = message.match(
    /(UNKNOWN_ACTION|UNKNOWN_SCOPE|UNKNOWN_ROUTE|APP_NOT_READY|INVALID_ROUTE|NAVIGATION_FAILED):/
  );
  return {
    code: known?.[1] ?? "OPERATION_FAILED",
    message,
    hint: "读取当前页面状态后再决定下一步操作。",
  };
}

export async function withinTimeout<T>(
  work: Promise<T>,
  timeoutMs: number
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new ControlError(
                "COMMAND_TIMEOUT",
                "指令执行超时。",
                "操作可能已生效，请先 observe 确认当前状态。"
              )
            ),
          Math.max(1, timeoutMs)
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
