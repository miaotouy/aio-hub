import type { ControlRequest, ControlStep, StepResult } from "./protocol";
import { validateRequest } from "./protocol";
import { connectSession, type ControlSession } from "./session";
import { acquireWindowLock, getInstance } from "./discovery";
import { ControlError, errorResult, withinTimeout } from "./errors";

/** Stop at the first failure; completed interactions retain their actual side effects. */
export async function runBatch(
  request: ControlRequest,
  execute: (step: ControlStep, index: number) => Promise<unknown>
) {
  const steps: StepResult[] = [];
  for (const [index, step] of request.steps.entries()) {
    try {
      const result = await execute(step, index);
      try {
        JSON.stringify(result);
      } catch {
        throw new ControlError(
          "NON_JSON_RESULT",
          "操作返回值无法表达为 JSON。",
          "将返回值整理为简单对象、数组或字符串后重试。此前的业务副作用保留。"
        );
      }
      steps.push({
        index,
        op: step.op,
        mode: ["navigate", "state", "action"].includes(step.op)
          ? "appAction"
          : step.op === "eval"
            ? "eval"
            : "ui",
        result,
      });
    } catch (error) {
      return {
        ok: false,
        steps,
        failedStep: { index, op: step.op },
        error: errorResult(error),
      };
    }
  }
  return { ok: true, steps };
}

export async function executeRequest(input: unknown) {
  const request = validateRequest(input);
  const startedAt = new Date().toISOString(),
    started = Date.now();
  const deadline = started + (request.timeoutMs ?? 15000);
  const instance = getInstance(request.instance),
    label = request.window ?? "main";
  const mutating = request.steps.some(
    (step) => !["inspect", "state", "wait", "diagnostics"].includes(step.op)
  );
  let release: (() => void) | undefined;
  let connection: ControlSession | undefined;
  let lastRoute: string | undefined;
  const remaining = () => {
    const time = deadline - Date.now();
    if (time <= 0)
      throw new ControlError(
        "COMMAND_TIMEOUT",
        "指令执行超时。",
        "先 observe 确认当前状态。"
      );
    return time;
  };
  try {
    if (mutating) release = await acquireWindowLock(instance, label);
    connection = await connectSession(instance, remaining());
    await connection.select(label, remaining());
    const result = await runBatch(request, async (step) => {
      const description = await withinTimeout(
        connection!.verify(remaining()),
        remaining()
      );
      lastRoute = description.route;
      const time = remaining();
      return withinTimeout(
        connection!.execute(
          step,
          Math.max(1, time - Math.min(100, Math.floor(time / 10)))
        ),
        time
      );
    });
    const description = result.ok
      ? await withinTimeout(connection.description(remaining()), remaining())
      : undefined;
    return {
      ...result,
      instance: instance.instanceId,
      window: label,
      transport: instance.transport ?? "cdp",
      inputBackend: instance.transport === "embedded-webdriver" ? "dom" : "cdp",
      route: description?.route ?? lastRoute,
      startedAt,
      elapsedMs: Date.now() - started,
    };
  } finally {
    try {
      await connection?.close();
    } finally {
      release?.();
    }
  }
}
