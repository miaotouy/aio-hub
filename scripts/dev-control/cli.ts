import fs from "node:fs/promises";
import { parseArgs } from "node:util";
import { executeRequest } from "./commands";
import { DevConnection } from "./connection";
import { getInstance, listInstances } from "./discovery";
import { ControlError, errorResult } from "./errors";
import {
  validateRequest,
  type ControlStep,
  type ControlTarget,
} from "./protocol";

const help = `AIO Hub 开发界面控制

启动：bun run dev -- --agent [--agent-instance <名称>]
静态：bun run dev:static -- --agent [--agent-instance <名称>]

用法：bun scripts/dev-control/cli.ts <操作> [参数]

instances                         查看开发实例
windows                           查看应用窗口及就绪状态
navigate /settings                跳转应用路由
inspect [--limit 60]               读取精简界面结构
observe [--no-screenshot]          读取结构并保存 PNG
screenshot [--mask <CSS>]          保存视口或元素 PNG
click <定位参数>                  点击控件
dblclick <定位参数>               双击控件
fill <定位参数> --text <内容>      输入文本，也可 --text-file <文件>
press [定位参数] --key Enter       按键
select <定位参数> --value <值>     选择原生 select 选项
scroll [定位参数] --delta-y 600    滚动
wait [定位参数 | --route /path]    等待控件、路由或应用就绪
state ui                          读取开发状态；capabilities 查看可用适配器
action <名称> [--args-file <JSON>] 执行已注册应用动作
eval --expression <JS>            显式页面脚本求值
batch --stdin | --file <JSON>      连续执行 JSON steps，失败即停止

定位：--testid <id> / --role button --name 保存 / --label <标签>
      --placeholder <提示> / --css <selector>；--scope <CSS> 限定区域
点击：--modifiers Alt；多个修饰键重复传入 --modifiers
公共：--instance <名称> --window main --timeout 15000

结果以 JSON 输出，截图返回本机绝对路径。仅连接明确开启控制的开发实例。`;

async function stdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
    if (chunks.reduce((sum, item) => sum + item.length, 0) > 2_000_000)
      throw new ControlError("INVALID_REQUEST", "输入 JSON 超过 2 MB。");
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function main(
  args = process.argv.slice(2).filter((arg) => arg !== "--")
): Promise<unknown> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: "boolean", short: "h" },
      instance: { type: "string" },
      window: { type: "string" },
      timeout: { type: "string" },
      testid: { type: "string" },
      role: { type: "string" },
      name: { type: "string" },
      label: { type: "string" },
      placeholder: { type: "string" },
      css: { type: "string" },
      scope: { type: "string" },
      "no-exact": { type: "boolean" },
      limit: { type: "string" },
      "no-screenshot": { type: "boolean" },
      mask: { type: "string", multiple: true },
      modifiers: { type: "string", multiple: true },
      text: { type: "string" },
      "text-file": { type: "string" },
      key: { type: "string" },
      value: { type: "string", multiple: true },
      "delta-x": { type: "string" },
      "delta-y": { type: "string" },
      route: { type: "string" },
      state: { type: "string" },
      "args-file": { type: "string" },
      expression: { type: "string" },
      file: { type: "string" },
      stdin: { type: "boolean" },
    },
  });
  if (values.help || !positionals.length) return { ok: true, help };
  const targeting = [
    "testid",
    "role",
    "name",
    "label",
    "placeholder",
    "css",
    "scope",
    "no-exact",
  ];
  const allowedOptions: Record<string, string[]> = {
    instances: [],
    windows: [],
    navigate: [],
    inspect: [...targeting, "limit"],
    observe: [...targeting, "limit", "no-screenshot"],
    screenshot: [...targeting, "mask"],
    click: [...targeting, "modifiers"],
    dblclick: [...targeting, "modifiers"],
    fill: [...targeting, "text", "text-file"],
    press: [...targeting, "key"],
    select: [...targeting, "value"],
    scroll: [...targeting, "delta-x", "delta-y"],
    wait: [...targeting, "route", "state"],
    state: [],
    action: ["args-file"],
    eval: ["expression"],
    batch: ["file", "stdin"],
  };
  const [command, argument, ...extra] = positionals;
  if (!Object.hasOwn(allowedOptions, command))
    throw new ControlError("INVALID_REQUEST", "未知操作，请查看 --help。");
  for (const key of Object.keys(values)) {
    if (
      ![
        "help",
        "instance",
        "window",
        "timeout",
        ...allowedOptions[command],
      ].includes(key)
    )
      throw new ControlError(
        "INVALID_REQUEST",
        `${command} 不接受 --${key} 参数。`
      );
  }
  validateRequest({
    instance: values.instance,
    window: values.window,
    timeoutMs:
      values.timeout === undefined ? undefined : Number(values.timeout),
    steps: [{ op: "wait" }],
  });
  if (
    argument !== undefined &&
    !["navigate", "press", "state", "action", "eval"].includes(command)
  )
    throw new ControlError(
      "INVALID_REQUEST",
      "此操作使用命名参数，请查看 --help。"
    );
  if (extra.length) throw new ControlError("INVALID_REQUEST", "位置参数过多。");
  if (command === "instances")
    return {
      ok: true,
      instances: listInstances().map(
        ({ instanceId, status, frontendMode, startedAt, error }) => ({
          instanceId,
          status,
          frontendMode,
          startedAt,
          error,
        })
      ),
    };
  if (command === "windows") {
    const instance = getInstance(values.instance);
    const connection = await DevConnection.attach(
      instance,
      Number(values.timeout ?? 15000)
    );
    try {
      return {
        ok: true,
        instance: instance.instanceId,
        windows: (await connection.windows()).map(
          ({ description: { windowLabel, route, ready } }) => ({
            windowLabel,
            route,
            ready,
          })
        ),
      };
    } finally {
      await connection.close();
    }
  }
  if (command === "batch") {
    if (Boolean(values.stdin) === Boolean(values.file))
      throw new ControlError(
        "INVALID_REQUEST",
        "batch 需要选择 --stdin 或 --file。"
      );
    const input = JSON.parse(
      values.file ? await fs.readFile(values.file, "utf8") : await stdin()
    );
    const request = validateRequest(input);
    return executeRequest({
      ...request,
      ...(values.instance ? { instance: values.instance } : {}),
      ...(values.window ? { window: values.window } : {}),
      ...(values.timeout ? { timeoutMs: Number(values.timeout) } : {}),
    });
  }
  const target: ControlTarget = {};
  for (const key of [
    "testid",
    "role",
    "name",
    "label",
    "placeholder",
    "css",
  ] as const)
    if (values[key] !== undefined) target[key] = values[key];
  if (values.scope && Object.keys(target).length) target.scope = values.scope;
  if (values["no-exact"]) target.exact = false;
  const hasTarget = Object.keys(target).length > 0;
  if (
    values.scope &&
    !hasTarget &&
    [
      "inspect",
      "observe",
      "screenshot",
      "click",
      "dblclick",
      "fill",
      "press",
      "select",
      "scroll",
      "wait",
    ].includes(command)
  )
    target.css = values.scope;
  const step: Record<string, unknown> = { op: command };
  if (Object.keys(target).length) step.target = target;
  if (values.modifiers) step.modifiers = values.modifiers;
  if (command === "navigate") step.path = argument;
  if (command === "inspect" || command === "observe") {
    if (values.scope && !hasTarget) step.target = { css: values.scope };
    if (values.limit !== undefined) step.limit = Number(values.limit);
    if (command === "observe" && values["no-screenshot"])
      step.screenshot = false;
  }
  if (command === "screenshot" && values.mask) step.mask = values.mask;
  if (command === "fill") {
    if (values.text !== undefined && values["text-file"])
      throw new ControlError(
        "INVALID_REQUEST",
        "fill 请选择 --text 或 --text-file。"
      );
    step.text = values["text-file"]
      ? await fs.readFile(values["text-file"], "utf8")
      : values.text;
  }
  if (command === "press") step.key = values.key ?? argument;
  if (command === "select")
    step.value = values.value?.length === 1 ? values.value[0] : values.value;
  if (command === "scroll") {
    if (values["delta-x"] !== undefined)
      step.deltaX = Number(values["delta-x"]);
    if (values["delta-y"] !== undefined)
      step.deltaY = Number(values["delta-y"]);
  }
  if (command === "wait") {
    if (values.route !== undefined) step.route = values.route;
    if (values.state !== undefined) step.state = values.state;
  }
  if (command === "state") step.scope = argument;
  if (command === "action") {
    step.name = argument;
    if (values["args-file"])
      step.args = JSON.parse(await fs.readFile(values["args-file"], "utf8"));
  }
  if (command === "eval") step.expression = values.expression ?? argument;
  return executeRequest({
    instance: values.instance,
    window: values.window,
    timeoutMs:
      values.timeout === undefined ? undefined : Number(values.timeout),
    steps: [step as ControlStep],
  });
}

if (import.meta.main) {
  try {
    const result = await main();
    // Serialization is inside the error boundary (eval can return a non-JSON value).
    console.log(JSON.stringify(result, null, 2));
    if (result && typeof result === "object" && "ok" in result && !result.ok)
      process.exitCode = 1;
  } catch (error) {
    console.log(
      JSON.stringify({ ok: false, error: errorResult(error) }, null, 2)
    );
    process.exitCode = 1;
  }
}
