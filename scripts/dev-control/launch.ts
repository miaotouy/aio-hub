import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { loadDevSettings } from "../dev-settings";
import {
  CONTROL_ROOT,
  acquireInstanceLock,
  listInstances,
  processAlive,
  publishInstance,
  removeInstance,
  type DevInstance,
} from "./discovery";
import { DevConnection } from "./connection";
import { ControlError } from "./errors";

export async function prepareDevControl(
  settings: ReturnType<typeof loadDevSettings>,
  staticFrontend: boolean
) {
  if (process.platform !== "win32")
    throw new ControlError(
      "UNSUPPORTED_PLATFORM",
      "首期开发控制支持 Windows / WebView2。"
    );
  if (
    listInstances().some(
      (instance) => instance.instanceId === settings.idSuffix
    )
  )
    throw new ControlError(
      "INSTANCE_RUNNING",
      `开发实例 ${settings.idSuffix} 已运行。`,
      "使用 --agent-instance 指定另一个名称。"
    );
  const releaseInstance = acquireInstanceLock(settings.idSuffix);
  process.once("exit", releaseInstance);
  const port = await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string")
        return reject(new Error("无法分配控制端口。"));
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
  const startupId = randomUUID();
  settings.dataDir = path.join(
    CONTROL_ROOT,
    "data",
    settings.idSuffix,
    startupId
  );
  fs.mkdirSync(settings.dataDir, { recursive: true });
  const browserArgs = `--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required --remote-debugging-address=127.0.0.1 --remote-debugging-port=${port}`;
  // Explicit builder options are applied consistently to every application WebView.
  delete process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS;
  Object.assign(process.env, {
    AIO_DEV_CONTROL: "1",
    AIO_DEV_CONTROL_INSTANCE: settings.idSuffix,
    AIO_DEV_CONTROL_STARTUP: startupId,
    AIO_WEBVIEW2_ADDITIONAL_BROWSER_ARGS: browserArgs,
    WEBVIEW2_USER_DATA_FOLDER: path.join(settings.dataDir, "webview2-profile"),
  });
  const instance: DevInstance = {
    protocolVersion: 1,
    instanceId: settings.idSuffix,
    startupId,
    launcherPid: process.pid,
    startedAt: new Date().toISOString(),
    endpoint: `http://127.0.0.1:${port}`,
    frontendUrl: `http://${staticFrontend ? "127.0.0.1" : "localhost"}:${settings.port}`,
    frontendMode: staticFrontend ? "static" : "hmr",
    dataDir: settings.dataDir,
    status: "starting",
  };
  publishInstance(instance);
  let disposed = false;
  const dispose = () => {
    disposed = true;
    removeInstance(instance);
    releaseInstance();
  };
  process.once("exit", dispose);
  return {
    instance,
    dispose,
    async waitUntilReady(onReady: () => void = () => {}) {
      // Cargo's first build can take several minutes. The descriptor remains visible as starting.
      let deadline = Date.now() + 15 * 60_000;
      while (!disposed && Date.now() < deadline) {
        let connection: DevConnection | undefined;
        try {
          const response = await fetch(`${instance.endpoint}/json/version`, {
            signal: AbortSignal.timeout(1000),
          });
          if (!response.ok) throw new Error("WebView2 尚未启动。");
          const { stdout } = await promisify(execFile)(
            "powershell.exe",
            [
              "-NoProfile",
              "-NonInteractive",
              "-Command",
              `Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction Stop | Select-Object -ExpandProperty LocalAddress | ConvertTo-Json -Compress`,
            ],
            { windowsHide: true, timeout: 10000 }
          );
          const addresses: string | string[] = JSON.parse(stdout.trim());
          if (
            ![addresses].flat().length ||
            [addresses]
              .flat()
              .some((address) => address !== "127.0.0.1" && address !== "::1")
          )
            throw new ControlError(
              "UNSAFE_LISTENER",
              "WebView2 调试端口出现对外监听地址，请停止该实例。"
            );
          connection = await DevConnection.attach(instance, 3000);
          const windows = await connection.windows();
          const main = windows.find(
            (window) => window.description.windowLabel === "main"
          );
          if (main) {
            instance.appPid = main.description.pid;
            instance.status = "ready";
            if (!disposed) {
              publishInstance(instance);
              onReady();
            }
            await connection.close();
            connection = undefined;
            // Tauri dev can replace the application process after a Rust rebuild.
            while (!disposed && processAlive(instance.appPid)) {
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
            if (disposed) return;
            instance.appPid = undefined;
            instance.status = "starting";
            publishInstance(instance);
            deadline = Date.now() + 15 * 60_000;
            continue;
          }
        } catch (error) {
          if (
            error instanceof ControlError &&
            ["UNSAFE_LISTENER", "IDENTITY_MISMATCH"].includes(error.code)
          )
            throw error;
          // Loading, rebuilding, and refreshing are normal while development is starting.
        } finally {
          await connection?.close().catch(() => {});
        }
        if (!disposed)
          await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (disposed) return;
      throw new ControlError("STARTUP_TIMEOUT", "开发控制等待应用就绪超时。");
    },
    fail(error: unknown) {
      if (disposed) return;
      instance.status = "failed";
      instance.error = error instanceof Error ? error.message : String(error);
      publishInstance(instance);
    },
  };
}
