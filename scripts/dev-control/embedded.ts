import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ControlStep, ControlTarget } from "./protocol";
import type { DevControlDescription } from "../../src/dev/control/protocol";
import { CONTROL_ROOT, validateInstance, type DevInstance } from "./discovery";
import { ControlError } from "./errors";
import { matchesIdentity } from "./connection";
import { readPageDescription } from "./page-description";
import { inspectElement } from "./dom-inspect";
import { runDomOperation } from "./dom-operations";
import {
  resolveDomRoot,
  screenshotPlan,
  redactScreenshot,
} from "./screenshot-page";
import { resizeWindow, readDiagnostics } from "./page-actions";

export class EmbeddedConnection {
  private sessionId = "";
  private label = "main";
  private pending = new Set<AbortController>();
  private closed = false;
  private constructor(readonly instance: DevInstance) {}
  static async attach(instance: DevInstance, timeout: number) {
    validateInstance(instance);
    const connection = new EmbeddedConnection(instance);
    const value = await connection.request<{ sessionId: string }>(
      "POST",
      "/session",
      { capabilities: { alwaysMatch: { browserName: "tauri" } } },
      timeout
    );
    connection.sessionId = value.sessionId;
    if (!connection.sessionId)
      throw new ControlError(
        "CONNECTION_FAILED",
        "WebDriver 未返回 session 身份。"
      );
    return connection;
  }
  private async request<T>(
    method: string,
    route: string,
    body?: unknown,
    timeout = 15000
  ): Promise<T> {
    if (this.closed)
      throw new ControlError("CONNECTION_CLOSED", "控制会话已关闭。");
    const abort = new AbortController();
    this.pending.add(abort);
    const timer = setTimeout(() => abort.abort(), Math.max(1, timeout));
    try {
      const response = await fetch(this.instance.endpoint + route, {
        method,
        headers: { "Content-Type": "application/json; charset=utf-8" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: abort.signal,
        redirect: "error",
      });
      const result = (await response.json()) as {
        value?: T & { error?: string; message?: string };
        error?: string;
      };
      if (
        !response.ok ||
        result.error ||
        typeof result.value?.error === "string"
      ) {
        const error = result.value?.error;
        throw new ControlError(
          error === "invalid session id" ? "SESSION_EXPIRED" : "DRIVER_ERROR",
          "WebDriver 操作失败。",
          "重新 observe 核对状态；写操作可能已经生效。",
          { status: response.status, driverError: error }
        );
      }
      return result.value as T;
    } catch (error) {
      if (error instanceof ControlError) throw error;
      throw new ControlError(
        abort.signal.aborted ? "COMMAND_TIMEOUT" : "CONNECTION_FAILED",
        "嵌入式 WebDriver 连接中断或超时。",
        "确认应用仍运行，再 observe；写操作请先核对结果。"
      );
    } finally {
      clearTimeout(timer);
      this.pending.delete(abort);
    }
  }
  async evaluate<T>(
    expression: string,
    timeout = 15000,
    label = this.label
  ): Promise<T> {
    // Keep errors inside the callback value so the direct endpoint preserves typed errors.
    const script =
      "const done=arguments[arguments.length-1];Promise.resolve().then(async()=>{return (" +
      expression +
      ");}).then(value=>{JSON.stringify(value);done({ok:true,value:{ok:true,value:value===undefined?null:value}});}).catch(error=>done({ok:true,value:{ok:false,error:{code:typeof error.code==='string'?error.code:'OPERATION_FAILED',message:String(error.message||error).split(String.fromCharCode(10))[0].slice(0,300)}}}));";
    const result = await this.request<{
      ok: boolean;
      value: T;
      error?: { code: string; message: string };
    }>(
      "POST",
      "/wdio/eval",
      { script, window_label: label, timeout_ms: timeout },
      timeout
    );
    if (!result?.ok)
      throw new ControlError(
        result?.error?.code ?? "OPERATION_FAILED",
        result?.error?.message ?? "页面操作失败。",
        "重新观察页面后再决定是否重试。"
      );
    return result.value;
  }
  async call<A, T>(
    fn: (arg: A) => T,
    arg: A,
    timeout = 15000
  ): Promise<Awaited<T>> {
    return this.evaluate<Awaited<T>>(
      "(()=>{const resolveDomRoot=" +
        resolveDomRoot.toString() +
        ";return (" +
        fn.toString() +
        ")(" +
        JSON.stringify(arg) +
        ");})()",
      timeout
    );
  }
  private async describeLabel(label: string, timeout: number) {
    const locationCheck =
      this.instance.frontendMode === "bundled-debug"
        ? "location.protocol==='tauri:' && location.hostname==='localhost'"
        : "location.origin===" + JSON.stringify(this.instance.frontendUrl);
    const description = await this.evaluate<DevControlDescription | null>(
      "(" +
        locationCheck +
        ") ? (" +
        readPageDescription.toString() +
        ")() : null",
      timeout,
      label
    );
    if (description && !matchesIdentity(this.instance, description))
      throw new ControlError(
        "IDENTITY_MISMATCH",
        "窗口身份与目标开发实例不一致。",
        "重新启动目标实例。"
      );
    return description;
  }
  async windows(timeout = 5000) {
    const deadline = Date.now() + timeout;
    const labels = await this.request<string[]>(
      "GET",
      "/session/" + this.sessionId + "/window/handles",
      undefined,
      timeout
    );
    const windows: DevControlDescription[] = [];
    for (const label of labels.filter((label) => label !== "background-js")) {
      try {
        const description = await this.describeLabel(
          label,
          Math.max(1, Math.min(1500, deadline - Date.now()))
        );
        if (description) windows.push(description);
      } catch (error) {
        if (error instanceof ControlError && error.code === "IDENTITY_MISMATCH")
          throw error;
      }
      if (Date.now() >= deadline) break;
    }
    return windows;
  }
  async select(label: string, timeout: number) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (
        (await this.windows(Math.max(1, deadline - Date.now()))).some(
          (w) => w.windowLabel === label
        )
      ) {
        await this.request(
          "POST",
          "/session/" + this.sessionId + "/window",
          { handle: label },
          Math.max(1, deadline - Date.now())
        );
        this.label = label;
        return;
      }
      await Bun.sleep(100);
    }
    throw new ControlError(
      "WINDOW_NOT_FOUND",
      "目标窗口尚未就绪或已关闭。",
      "使用 windows 查看窗口状态。"
    );
  }
  async description(timeout = 1500) {
    return this.describeLabel(this.label, timeout);
  }
  async verify(timeout = 1500) {
    const description = await this.description(timeout);
    if (!description)
      throw new ControlError(
        "PAGE_RELOADING",
        "页面正在刷新或身份暂不可用。",
        "等待后重新 observe。"
      );
    if (description.windowLabel !== this.label)
      throw new ControlError("IDENTITY_MISMATCH", "目标窗口身份发生变化。");
    return description;
  }
  async screenshot(
    target: ControlTarget | undefined,
    mask: string[] | undefined,
    timeout: number
  ) {
    const deadline = Date.now() + timeout;
    const left = () => {
      const time = deadline - Date.now();
      if (time <= 0)
        throw new ControlError("COMMAND_TIMEOUT", "截图超时，已中止保存。");
      return time;
    };
    const input = { target, mask };
    const plan = await this.call(screenshotPlan, input, left());
    const raw = await this.request<string>(
      "GET",
      "/session/" + this.sessionId + "/screenshot",
      undefined,
      left()
    );
    const after = await this.call(screenshotPlan, input, left());
    if (JSON.stringify(plan) !== JSON.stringify(after))
      throw new ControlError(
        "SCREENSHOT_CHANGED",
        "截图期间敏感区域或视口发生变化，已中止保存。",
        "等待界面稳定后重试。"
      );
    const png = await this.call(redactScreenshot, { png: raw, plan }, left());
    const bytes = Buffer.from(png, "base64");
    if (
      bytes.length < 24 ||
      !bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      throw new ControlError("SCREENSHOT_FAILED", "截图编码无效，已中止保存。");
    left();
    const dir = path.join(CONTROL_ROOT, "artifacts", this.instance.startupId);
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(
      dir,
      "screenshot-" + Date.now() + "-" + randomUUID().slice(0, 8) + ".png"
    );
    await fs.writeFile(file, bytes);
    return {
      path: file,
      kind: target ? "element" : "viewport",
      observedAt: new Date().toISOString(),
      redacted: true,
    };
  }
  async execute(step: ControlStep, timeout: number): Promise<unknown> {
    const deadline = Date.now() + timeout;
    const left = () => {
      const time = deadline - Date.now();
      if (time <= 0)
        throw new ControlError(
          "COMMAND_TIMEOUT",
          "操作超时，请先 observe 核对结果。"
        );
      return time;
    };
    if (step.op === "inspect" || step.op === "observe") {
      const snapshot = await this.evaluate(
        "(()=>{const resolveDomRoot=" +
          resolveDomRoot.toString() +
          ";return (" +
          inspectElement.toString() +
          ")(resolveDomRoot(" +
          JSON.stringify(step.target) +
          ")," +
          (step.limit ?? 60) +
          ");})()",
        left()
      );
      return step.op === "inspect"
        ? snapshot
        : {
            snapshot,
            screenshot:
              step.screenshot === false
                ? undefined
                : await this.screenshot(step.target, undefined, left()),
          };
    }
    if (step.op === "screenshot")
      return this.screenshot(step.target, step.mask, left());
    if (step.op === "eval") return this.evaluate(step.expression, left());
    if (step.op === "resize")
      return this.call(
        resizeWindow,
        { width: step.width, height: step.height, timeoutMs: left() },
        left()
      );
    if (step.op === "diagnostics")
      return this.call(
        readDiagnostics,
        {
          since: step.since ?? 0,
          limit: step.limit ?? 30,
          documentId: step.documentId,
        },
        left()
      );
    if (["navigate", "state", "action"].includes(step.op)) {
      while (!(await this.verify(left())).bridgeAvailable)
        await Bun.sleep(Math.min(100, left()));
      if (step.op === "navigate")
        return this.call(
          async ({ path, timeout }) =>
            window.__AIO_DEV_CONTROL__!.navigate(path, timeout),
          { path: step.path, timeout: left() },
          left()
        );
      if (step.op === "state") {
        if (step.scope === "capabilities")
          return {
            ...((await this.call(
              (scope) => window.__AIO_DEV_CONTROL__!.readState(scope),
              step.scope,
              left()
            )) as object),
            transport: "embedded-webdriver",
            inputBackend: "dom",
            locators: ["css", "testid", "placeholder"],
            unsupported: ["role", "label", "press", "dblclick", "modifiers"],
          };
        return this.call(
          (scope) => window.__AIO_DEV_CONTROL__!.readState(scope),
          step.scope,
          left()
        );
      }
      if (step.op === "action")
        return this.call(
          ({ name, args }) => window.__AIO_DEV_CONTROL__!.runAction(name, args),
          { name: step.name, args: step.args },
          left()
        );
    }
    do {
      const result = await this.evaluate(
        "(" +
          runDomOperation.toString() +
          ")(" +
          JSON.stringify(step) +
          "," +
          deadline +
          ")",
        left()
      );
      if (step.op !== "wait" || result) return result;
      await Bun.sleep(Math.min(100, left()));
    } while (left());
  }
  async close() {
    for (const pending of this.pending) pending.abort();
    try {
      if (!this.closed && this.sessionId)
        await this.request(
          "DELETE",
          "/session/" + this.sessionId,
          undefined,
          1000
        );
    } catch {
      /* Closing the client must leave the application running. */
    } finally {
      this.closed = true;
    }
  }
}
