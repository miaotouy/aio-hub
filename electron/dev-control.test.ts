import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readDevControl, devControlIdentity } from "./dev-control";

const environment = () => ({
  AIO_DEV_CONTROL: "1",
  AIO_DEV_CONTROL_INSTANCE: "electron-test",
  AIO_DEV_CONTROL_STARTUP: randomUUID(),
  AIO_DEV_CONTROL_PORT: "9333",
});

describe("Electron development control opt-in", () => {
  it("enables only explicitly controlled unpackaged launches", () => {
    const env = environment();
    expect(readDevControl(false, env)).toEqual({
      instanceId: env.AIO_DEV_CONTROL_INSTANCE,
      startupId: env.AIO_DEV_CONTROL_STARTUP,
      port: 9333,
    });
    expect(readDevControl(true, env)).toBeUndefined();
    expect(
      readDevControl(false, { ...env, AIO_DEV_CONTROL: "0" })
    ).toBeUndefined();
    expect(readDevControl(false, {})).toBeUndefined();
  });

  it("rejects incomplete or unsafe launch identities before enabling a listener", () => {
    for (const patch of [
      { AIO_DEV_CONTROL_INSTANCE: "../other" },
      { AIO_DEV_CONTROL_INSTANCE: "" },
      { AIO_DEV_CONTROL_STARTUP: "stale" },
      { AIO_DEV_CONTROL_PORT: "" },
      { AIO_DEV_CONTROL_PORT: "0" },
      { AIO_DEV_CONTROL_PORT: "65536" },
      { AIO_DEV_CONTROL_PORT: "9333.5" },
    ])
      expect(() =>
        readDevControl(false, { ...environment(), ...patch })
      ).toThrow();
  });

  it("binds every window handshake to the current main process and startup", () => {
    const control = readDevControl(false, environment())!;
    expect(devControlIdentity(control, "tool-preview", 1234)).toEqual({
      protocolVersion: 1,
      instanceId: control.instanceId,
      startupId: control.startupId,
      windowLabel: "tool-preview",
      pid: 1234,
    });
    expect(devControlIdentity(undefined, "main", 1234)).toBeNull();
  });
});
