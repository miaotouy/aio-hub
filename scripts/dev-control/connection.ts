import { chromium, type Browser, type Page } from "playwright-core";
import type { DevControlDescription } from "../../src/dev/control/protocol";
import type { DevInstance } from "./discovery";
import { ControlError, withinTimeout } from "./errors";
import { readPageDescription } from "./page-description";

export function matchesIdentity(
  instance: DevInstance,
  description: DevControlDescription
): boolean {
  return (
    description.protocolVersion === instance.protocolVersion &&
    description.instanceId === instance.instanceId &&
    description.startupId === instance.startupId &&
    Number.isInteger(description.pid) &&
    description.pid > 0 &&
    (!instance.appPid || instance.appPid === description.pid)
  );
}

export class DevConnection {
  private constructor(
    readonly instance: DevInstance,
    private readonly browser: Browser
  ) {}
  static async attach(
    instance: DevInstance,
    timeoutMs: number
  ): Promise<DevConnection> {
    try {
      const browser = await chromium.connectOverCDP(instance.endpoint, {
        timeout: timeoutMs,
        noDefaults: true,
      });
      return new DevConnection(instance, browser);
    } catch {
      throw new ControlError(
        "CONNECTION_FAILED",
        "无法连接开发实例的 WebView2。",
        "等待开发窗口启动，或检查 dev 终端中的控制状态。"
      );
    }
  }
  async description(page: Page): Promise<DevControlDescription | null> {
    if (page.isClosed()) return null;
    try {
      if (new URL(page.url()).pathname === "/background-js.html") return null;
      if (
        new URL(page.url()).origin !== new URL(this.instance.frontendUrl).origin
      )
        return null;
      const description = await withinTimeout(
        page.evaluate(readPageDescription),
        1500
      );
      if (!description) return null;
      if (!matchesIdentity(this.instance, description))
        throw new ControlError(
          "IDENTITY_MISMATCH",
          "页面身份与开发实例描述不一致。",
          "重新启动该实例后再连接。"
        );
      return description;
    } catch (error) {
      if (error instanceof ControlError && error.code === "IDENTITY_MISMATCH")
        throw error;
      return null;
    }
  }
  async windows() {
    const windows: { page: Page; description: DevControlDescription }[] = [];
    for (const page of this.browser
      .contexts()
      .flatMap((context) => context.pages())) {
      const description = await this.description(page);
      if (description) windows.push({ page, description });
    }
    return windows;
  }
  async window(label: string, timeoutMs: number): Promise<Page> {
    const deadline = Date.now() + timeoutMs;
    let descriptions: DevControlDescription[] = [];
    while (Date.now() < deadline) {
      const windows = await this.windows();
      descriptions = windows.map((item) => item.description);
      const selected = windows.filter(
        (item) => item.description.windowLabel === label
      );
      if (selected.length > 1)
        throw new ControlError(
          "WINDOW_AMBIGUOUS",
          "窗口身份出现重复。",
          "重新启动开发实例。"
        );
      if (selected[0]) return selected[0].page;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new ControlError(
      descriptions.some((item) => item.windowLabel === label)
        ? "APP_NOT_READY"
        : "WINDOW_NOT_FOUND",
      "目标窗口尚未就绪或已关闭。",
      "使用 windows 查看窗口列表和 ready 状态。",
      descriptions.map(({ windowLabel, route, ready }) => ({
        windowLabel,
        route,
        ready,
      }))
    );
  }
  async verify(page: Page, label: string) {
    if (page.isClosed())
      throw new ControlError("WINDOW_CLOSED", "目标窗口已关闭。");
    const description = await this.description(page);
    if (!description)
      throw new ControlError(
        "PAGE_RELOADING",
        "页面正在刷新或开发桥尚未就绪。",
        "等待后重新 observe。"
      );
    if (description.windowLabel !== label)
      throw new ControlError("IDENTITY_MISMATCH", "目标窗口身份发生变化。");
    return description;
  }
  async close(): Promise<void> {
    await this.browser.close();
  }
}
