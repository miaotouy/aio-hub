import type { DevControlIdentity } from "../src/dev/control/protocol";

export interface ElectronDevControl {
  instanceId: string;
  startupId: string;
  port: number;
}

/** Packaged applications keep the development endpoint and identity disabled. */
export function readDevControl(
  packaged: boolean,
  env: NodeJS.ProcessEnv
): ElectronDevControl | undefined {
  if (packaged || env.AIO_DEV_CONTROL !== "1") return undefined;
  const instanceId = env.AIO_DEV_CONTROL_INSTANCE ?? "";
  const startupId = env.AIO_DEV_CONTROL_STARTUP ?? "";
  const portText = env.AIO_DEV_CONTROL_PORT ?? "";
  const port = Number(portText);
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(instanceId) ||
    !/^[a-f0-9-]{36}$/.test(startupId) ||
    !/^\d+$/.test(portText) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  )
    throw new Error(
      "开发控制启动参数无效，请通过 electron:dev -- --agent 启动。"
    );
  return { instanceId, startupId, port };
}

export function devControlIdentity(
  control: ElectronDevControl | undefined,
  windowLabel: string,
  pid: number
): DevControlIdentity | null {
  return control
    ? {
        protocolVersion: 1,
        instanceId: control.instanceId,
        startupId: control.startupId,
        windowLabel,
        pid,
      }
    : null;
}
