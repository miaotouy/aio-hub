import type {
  ControlRequest,
  ControlStep,
  ControlTarget,
} from "../../src/dev/control/protocol";
import { ControlError } from "./errors";
export type { ControlRequest, ControlStep, ControlTarget };
export type { StepResult } from "../../src/dev/control/protocol";

export const INSTANCE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
export const STARTUP_ID_PATTERN = /^[a-f0-9-]{36}$/;

function invalid(message: string): never {
  throw new ControlError("INVALID_REQUEST", message);
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid("指令必须是 JSON 对象。");
  return value as Record<string, unknown>;
}
function text(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || !value.trim())
    invalid(`${name} 需要非空字符串。`);
}
function fields(value: Record<string, unknown>, allowed: string[]) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) invalid(`未知字段：${key}。`);
  }
}
function route(value: unknown) {
  text(value, "path / route");
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\"))
    invalid("路由需要以单个 / 开头的应用内部路径。");
}
export function validateTarget(value: unknown): ControlTarget {
  const target = object(value);
  fields(target, [
    "testid",
    "role",
    "name",
    "label",
    "placeholder",
    "css",
    "exact",
    "scope",
  ]);
  const selectors = ["testid", "role", "label", "placeholder", "css"].filter(
    (key) => target[key] !== undefined
  );
  if (selectors.length !== 1) invalid("target 需要且仅能指定一种定位方式。");
  for (const key of selectors) text(target[key], `target.${key}`);
  if (target.name !== undefined) {
    text(target.name, "target.name");
    if (!target.role) invalid("name 需要配合 role 使用。");
  }
  if (target.scope !== undefined) text(target.scope, "target.scope");
  if (target.exact !== undefined && typeof target.exact !== "boolean")
    invalid("exact 需要布尔值。");
  return target as ControlTarget;
}

const allowedFields: Record<ControlStep["op"], string[]> = {
  navigate: ["path"],
  inspect: ["target", "limit"],
  observe: ["target", "limit", "screenshot"],
  screenshot: ["target", "mask"],
  click: ["target", "modifiers"],
  dblclick: ["target", "modifiers"],
  fill: ["target", "text"],
  press: ["target", "key"],
  select: ["target", "value"],
  scroll: ["target", "deltaX", "deltaY"],
  wait: ["target", "route", "state"],
  state: ["scope"],
  action: ["name", "args"],
  eval: ["expression"],
};

export function validateRequest(value: unknown): ControlRequest {
  const request = object(value);
  fields(request, ["instance", "window", "timeoutMs", "steps"]);
  if (
    request.instance !== undefined &&
    (typeof request.instance !== "string" ||
      !INSTANCE_ID_PATTERN.test(request.instance))
  )
    invalid("instance 需要 1–64 位字母、数字、下划线或连字符。");
  if (request.window !== undefined) text(request.window, "window");
  if (
    request.timeoutMs !== undefined &&
    (!Number.isInteger(request.timeoutMs) ||
      Number(request.timeoutMs) < 100 ||
      Number(request.timeoutMs) > 120000)
  )
    invalid("timeoutMs 需要处于 100–120000 范围内的整数。");
  if (
    !Array.isArray(request.steps) ||
    request.steps.length < 1 ||
    request.steps.length > 50
  )
    invalid("steps 需要 1–50 条指令。");
  for (const value of request.steps) {
    const step = object(value);
    text(step.op, "op");
    if (!Object.hasOwn(allowedFields, step.op))
      invalid(`未知操作：${step.op}。`);
    fields(step, ["op", ...allowedFields[step.op as ControlStep["op"]]]);
    if (step.target !== undefined) validateTarget(step.target);
    if (
      ["click", "dblclick", "fill", "select"].includes(step.op) &&
      step.target === undefined
    )
      invalid(`${step.op} 需要 target。`);
    if (
      step.modifiers !== undefined &&
      (!Array.isArray(step.modifiers) ||
        step.modifiers.length > 4 ||
        step.modifiers.some(
          (modifier) => !["Alt", "Control", "Meta", "Shift"].includes(modifier)
        ) ||
        new Set(step.modifiers).size !== step.modifiers.length)
    )
      invalid("modifiers 需要由 Alt、Control、Meta、Shift 组成的无重复数组。");
    if (step.op === "navigate") route(step.path);
    if (step.op === "fill" && typeof step.text !== "string")
      invalid("fill.text 需要字符串。");
    if (step.op === "press") text(step.key, "press.key");
    if (step.op === "eval") text(step.expression, "eval.expression");
    if (step.op === "state") text(step.scope, "state.scope");
    if (step.op === "action") text(step.name, "action.name");
    if (
      step.op === "select" &&
      !(
        typeof step.value === "string" ||
        (Array.isArray(step.value) &&
          step.value.length > 0 &&
          step.value.every((v) => typeof v === "string"))
      )
    )
      invalid("select.value 需要字符串或非空字符串数组。");
    for (const key of ["deltaX", "deltaY"]) {
      if (
        step[key] !== undefined &&
        (typeof step[key] !== "number" || !Number.isFinite(step[key]))
      )
        invalid(`${key} 需要有限数值。`);
    }
    if (
      step.limit !== undefined &&
      (!Number.isInteger(step.limit) ||
        Number(step.limit) < 1 ||
        Number(step.limit) > 200)
    )
      invalid("limit 需要处于 1–200 范围内的整数。");
    if (step.screenshot !== undefined && typeof step.screenshot !== "boolean")
      invalid("screenshot 需要布尔值。");
    if (
      step.mask !== undefined &&
      (!Array.isArray(step.mask) ||
        step.mask.length > 20 ||
        step.mask.some((v) => typeof v !== "string" || !v.trim()))
    )
      invalid("mask 需要最多 20 个 CSS selector。");
    if (step.op === "wait") {
      if (step.route !== undefined) route(step.route);
      if (step.target && step.route) invalid("wait 每次只等待一种条件。");
      if (
        step.state !== undefined &&
        !["visible", "hidden", "attached", "detached"].includes(
          String(step.state)
        )
      )
        invalid("wait.state 无效。");
      if (step.state !== undefined && !step.target)
        invalid("wait.state 需要 target。");
    }
  }
  return request as unknown as ControlRequest;
}
