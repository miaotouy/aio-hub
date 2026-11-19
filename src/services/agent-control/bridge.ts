import { nextTick } from "vue";
import { invoke } from "@/platform/native/core";
import { listen } from "@/platform/native/events";
import router from "@/router";
import { useAppInitStore } from "@/stores/appInitStore";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { ControlDom } from "./dom";
import { LayoutRecorder } from "./recorder";
import { redactOutput } from "./redact";
import {
  CONTROL_EVENT,
  controlFailure,
  type ControlStatus,
  type ControlDelivery,
  type ControlReply,
} from "./protocol";

const errorHandler = createModuleErrorHandler("AgentControl");
const dom = new ControlDom();
const recorder = new LayoutRecorder();
let dispose: (() => void) | undefined;
let enabled = false;
let busy = false;
let active: AbortController | undefined;
export const captureControlEvidence = () => recorder.mark();

async function execute(
  { command: c, expiresAt }: ControlDelivery,
  signal: AbortSignal
): Promise<unknown> {
  if (Date.now() >= expiresAt)
    throw Object.assign(new Error("指令已超时，请重新操作。"), {
      code: "COMMAND_TIMEOUT",
    });
  const appInit = useAppInitStore();
  if (c.op === "state")
    return {
      ready: appInit.isReady,
      route: router.currentRoute.value.path,
      viewport: { width: innerWidth, height: innerHeight },
      recording: recorder.read().running,
    };
  if (c.op === "diagnostics") return recorder.read();
  if (c.op === "mark") return recorder.mark();
  if (c.op === "observe")
    return {
      route: router.currentRoute.value.path,
      ready: appInit.isReady,
      ...dom.observe(c.limit),
    };
  if (c.op === "navigate") {
    if (!appInit.isReady)
      throw Object.assign(new Error("应用仍在初始化。"), {
        code: "APP_NOT_READY",
      });
    const path = c.path || "";
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\"))
      throw Object.assign(new Error("请使用应用内部路径。"), {
        code: "INVALID_ROUTE",
      });
    const match = router.resolve(path);
    if (
      !match.matched.length ||
      match.matched.some((r) => r.name === "NotFound")
    )
      throw Object.assign(new Error("应用路径不存在。"), {
        code: "UNKNOWN_ROUTE",
      });
    await router.push(path);
    await nextTick();
    return { route: router.currentRoute.value.path };
  }
  if (c.op === "actions" || c.op === "action") {
    if (!appInit.isReady)
      throw Object.assign(new Error("应用仍在初始化。"), {
        code: "APP_NOT_READY",
      });
    const { toolRegistryManager } = await import("@/services/registry");
    if (c.op === "actions")
      return toolRegistryManager.getAllTools().flatMap((tool) =>
        (tool.getMetadata?.().methods || [])
          .filter((m) => m.agentCallable === true)
          .map((m) => ({
            tool: tool.id,
            method: m.name,
            description: m.description,
            parameters: m.parameters.map((p) => ({
              name: p.name,
              type: p.type,
              description: p.description,
              required: p.required,
            })),
          }))
      );
    const tool = toolRegistryManager.getRegistry(c.tool || "");
    const metadata = tool
      .getMetadata?.()
      .methods.find((m) => m.name === c.method && m.agentCallable === true);
    if (!metadata)
      throw Object.assign(new Error("方法未开放给 Agent 调用。"), {
        code: "ACTION_UNAVAILABLE",
      });
    // Reuse registry entry points. Async methods retain their existing task lifecycle.
    if (metadata.executionMode === "async") {
      const { taskManager } =
        await import("@/tools/tool-calling/core/async-task");
      return {
        taskId: await taskManager.submitTask(
          tool.id,
          metadata.name,
          c.args || {},
          crypto.randomUUID()
        ),
      };
    }
    const method = (tool as unknown as Record<string, unknown>)[metadata.name];
    if (typeof method !== "function") throw new Error("工具方法不可用。");
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(
      () => controller.abort(),
      Math.max(0, expiresAt - Date.now())
    );
    try {
      await method.call(tool, c.args || {}, {
        requestId: crypto.randomUUID(),
        isAsync: false,
        signal: controller.signal,
        reportStatus: () => {},
      });
      // Tool outputs can contain arbitrary user data. UI state and task IDs are the observation surface.
      return { executed: true };
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  }
  return dom.operate(c, expiresAt, signal);
}
export async function startAgentControlBridge(): Promise<void> {
  dispose?.();
  const unlisten = await listen<ControlDelivery>(
    CONTROL_EVENT,
    ({ payload }) => {
      void (async () => {
        let reply: ControlReply;
        if (!enabled)
          reply = controlFailure(
            "CONTROL_DISABLED",
            "请在设置中开启本机调试接管。"
          );
        else if (busy)
          reply = controlFailure(
            "CONTROL_BUSY",
            "上一条指令仍在执行，请稍后再试。"
          );
        else {
          busy = true;
          active = new AbortController();
          try {
            reply = {
              ok: true,
              result: redactOutput(await execute(payload, active.signal)),
            };
          } catch (error) {
            // Error messages from tools may contain arbitrary response bodies / credentials.
            const code =
              typeof (error as { code?: unknown })?.code === "string"
                ? (error as { code: string }).code
                : "COMMAND_FAILED";
            const message = cSafeMessage(code);
            reply = controlFailure(
              message ? code : "COMMAND_FAILED",
              message || "指令执行失败，请检查参数与当前界面。"
            );
          } finally {
            busy = false;
            active = undefined;
          }
        }
        await invoke("agent_control_reply", { id: payload.id, reply });
      })().catch((error) => errorHandler.warn(error, "调试指令回复失败"));
    }
  );
  const unstatus = await listen<ControlStatus>(
    "agent-control:status",
    ({ payload }) => applyStatus(payload)
  );
  const onKey = (event: KeyboardEvent) => {
    if (
      !enabled ||
      !event.ctrlKey ||
      !event.altKey ||
      !event.shiftKey ||
      event.code !== "KeyD"
    )
      return;
    event.preventDefault();
    const evidence = recorder.mark();
    void (async () => {
      const [
        { getAppConfigDir },
        { join },
        { mkdir, writeTextFile },
        { customMessage },
      ] = await Promise.all([
        import("@/utils/appPath"),
        import("@/platform/native/path"),
        import("@/platform/native/fs"),
        import("@/utils/customMessage"),
      ]);
      const directory = await join(await getAppConfigDir(), "diagnostics");
      await mkdir(directory, { recursive: true });
      await writeTextFile(
        await join(directory, `layout-${Date.now()}.json`),
        JSON.stringify(evidence, null, 2)
      );
      customMessage.success(
        "现场记录已保存，可在应用数据目录的 diagnostics 中查看"
      );
    })().catch((error) =>
      errorHandler.error(error, "现场记录保存失败，请在日志与诊断页面重试")
    );
  };
  window.addEventListener("keydown", onKey, true);
  dispose = () => {
    window.removeEventListener("keydown", onKey, true);
    active?.abort();
    unlisten();
    unstatus();
    recorder.stop(false);
  };
  try {
    applyStatus(await invoke<ControlStatus>("agent_control_ready"));
  } catch (error) {
    dispose();
    dispose = undefined;
    throw error;
  }
}
function cSafeMessage(code: string) {
  const messages: Record<string, string> = {
    INVALID_SELECTOR: "CSS 选择器格式无效，请检查后重试。",
    TARGET_PROTECTED: "该区域已排除界面控制。",
    TARGET_READONLY: "输入框为只读。",
    UNKNOWN_OPTION: "选项无效或已禁用。",
    UNSUPPORTED_KEY: "支持 Enter、Escape、方向键、Home、End 和空格。",
    UNKNOWN_COMMAND: "未知操作，请使用 --help 查看支持的命令。",
    INVALID_ROUTE: "需要应用内部路径，例如 /settings。",
    UNKNOWN_ROUTE: "应用路径不存在，请核对路径。",
    ACTION_UNAVAILABLE:
      "方法未开放给 Agent 调用，请通过 actions 查看可用方法。",
    CONTROL_DISABLED: "本机调试接管已关闭。",
    STALE_SNAPSHOT: "界面引用已过期，请重新 observe。",
    TARGET_CHANGED: "目标已变化，请重新 observe。",
    TARGET_AMBIGUOUS: "目标需要唯一匹配，请细化 css。",
    TARGET_HIDDEN: "目标当前不可见。",
    TARGET_DISABLED: "目标处于禁用状态。",
    TARGET_OBSCURED: "目标被弹层遮挡，请重新 observe。",
    TARGET_REQUIRED: "需要 ref 与 snapshotId，或唯一 css。",
    COMMAND_TIMEOUT: "指令超时；请先观察当前状态，避免重复执行。",
    APP_NOT_READY: "应用仍在初始化。",
    UNSUPPORTED_TARGET:
      "该控件请使用 click 或 fill；Element Plus 下拉框先 click 打开，再 observe 点击选项。",
  };
  return messages[code];
}
function applyStatus(status: ControlStatus) {
  enabled = status.enabled;
  if (enabled) recorder.start();
  else {
    active?.abort();
    dom.reset();
    recorder.stop();
  }
}
if (import.meta.hot) import.meta.hot.dispose(() => dispose?.());
