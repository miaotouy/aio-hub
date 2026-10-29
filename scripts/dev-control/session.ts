import type { Page } from "playwright-core";
import type { DevControlDescription } from "../../src/dev/control/protocol";
import type { ControlStep } from "./protocol";
import type { DevInstance } from "./discovery";
import { DevConnection } from "./connection";
import { EmbeddedConnection } from "./embedded";
import { executePlaywrightStep } from "./playwright-operations";

export interface ControlSession {
  windows(timeout?: number): Promise<DevControlDescription[]>;
  select(label: string, timeout: number): Promise<void>;
  description(timeout?: number): Promise<DevControlDescription | null>;
  verify(timeout?: number): Promise<DevControlDescription>;
  execute(step: ControlStep, timeout: number): Promise<unknown>;
  close(): Promise<void>;
}
class CdpControlSession implements ControlSession {
  private page?: Page;
  private label = "main";
  constructor(
    private connection: DevConnection,
    private instance: DevInstance
  ) {}
  private selected() {
    if (!this.page) throw new Error("Window not selected");
    return this.page;
  }
  async windows() {
    return (await this.connection.windows()).map((w) => w.description);
  }
  async select(label: string, timeout: number) {
    this.page = await this.connection.window(label, timeout);
    this.label = label;
  }
  async description() {
    return this.connection.description(this.selected());
  }
  async verify() {
    return this.connection.verify(this.selected(), this.label);
  }
  async execute(step: ControlStep, timeout: number) {
    const page = this.selected();
    const deadline = Date.now() + timeout;
    if (["navigate", "state", "action"].includes(step.op))
      await page.waitForFunction(
        () => !!window.__AIO_DEV_CONTROL__,
        undefined,
        { timeout }
      );
    return executePlaywrightStep(
      page,
      this.instance,
      step,
      Math.max(1, deadline - Date.now())
    );
  }
  close() {
    return this.connection.close();
  }
}
export async function connectSession(
  instance: DevInstance,
  timeout: number
): Promise<ControlSession> {
  return instance.transport === "embedded-webdriver"
    ? EmbeddedConnection.attach(instance, timeout)
    : new CdpControlSession(
        await DevConnection.attach(instance, timeout),
        instance
      );
}
