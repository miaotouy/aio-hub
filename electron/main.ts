// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  net,
  protocol,
  screen,
  session,
  shell,
  Tray,
} from "electron";
import type {
  IpcMainInvokeEvent,
  IpcMainEvent,
  OpenDialogOptions,
  SaveDialogOptions,
} from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { IPC_REQUEST, IPC_EVENT, IPC_ASSET } from "./shared";
import { resolveUserDataPath } from "./data-path";
import { PendingDeepLinks, readDeepLinks } from "./deep-links";
import { HttpRequests } from "./http";
import { chromiumFetch } from "./chromium-fetch";
import { llmHttpFetch } from "./llm-http";
import { readDevControl, devControlIdentity } from "./dev-control";
import type { HttpRequestOptions } from "./shared";
import type { HostReply, HostMetadata, EventTarget } from "./shared";
import {
  externalUrl,
  isTrustedDocument,
  localRendererUrl,
  rendererFile,
  scopedPath,
} from "./security";
import { fileOperation, filePath, writeAtomic } from "./filesystem";
import { fileCommand } from "./file-commands";
import { AssetManager } from "./asset-manager";
import { DocumentConverter } from "./document-converter";
import { SkillManager } from "./skill-manager";
import { WindowResizes } from "./window-resize";
import { DesktopControls, readDesktopSettings } from "./desktop-controls";
import { WorkspaceWindows } from "./workspace-windows";
import { toWindowMonitor } from "./window-monitor";
import { CanvasPreviews } from "./canvas-preview";
import { inspectAssetMedia } from "./asset-media";
import { ConfigArchive } from "./config-archive";
import { AgentAssets } from "./agent-assets";
import { LlmChatPersistence } from "./llm-chat-persistence";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "aiohub",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
  {
    scheme: "asset",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);
const devControl = readDevControl(app.isPackaged, process.env);
if (devControl) {
  app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
  app.commandLine.appendSwitch(
    "remote-debugging-port",
    String(devControl.port)
  );
}
app.setName("AIO Hub Electron");
const userData = resolveUserDataPath({
  packaged: app.isPackaged,
  dataDirectory: process.env.AIO_DATA_DIR,
  portableDirectory: process.env.PORTABLE_EXECUTABLE_DIR,
});
if (userData) app.setPath("userData", userData);
if (process.platform === "win32")
  app.setAppUserModelId("com.mty.aiohub.electron");
const devOrigin = process.env.AIO_ELECTRON_RENDERER_URL
  ? localRendererUrl(process.env.AIO_ELECTRON_RENDERER_URL)
  : undefined;
const hostRoot = app.getAppPath();
const rendererRoot = path.join(hostRoot, "renderer");
const windows = new Map<string, BrowserWindow>();
const httpRequests = new HttpRequests((url, init, options) =>
  options.llm
    ? llmHttpFetch(url, init, options.llm, (value) =>
        session.defaultSession.resolveProxy(value)
      )
    : chromiumFetch(url, init)
);
const skillManager = new SkillManager({
  root: app.getPath("userData"),
  builtinRoot: path.join(
    app.isPackaged ? process.resourcesPath : hostRoot,
    "skills"
  ),
  fetch: chromiumFetch,
});
const documentConverter = new DocumentConverter({
  root: app.getPath("userData"),
  emit: (event, payload) => publish(event, payload),
});
const assetManager = new AssetManager({
  documents: documentConverter,
  root: app.getPath("userData"),
  trashItem: (value) => shell.trashItem(value),
  emit: (event, payload) => publish(event, payload),
  inspectMedia: inspectAssetMedia,
});
const configArchive = new ConfigArchive(
  app.getPath("userData"),
  app.getVersion()
);
const agentAssets = new AgentAssets({
  root: app.getPath("userData"),
  trashItem: (value) => shell.trashItem(value),
  inspectMedia: inspectAssetMedia,
});
const llmChatPersistence = new LlmChatPersistence(app.getPath("userData"));
const canvasPreviews = new CanvasPreviews(
  app.getPath("userData"),
  (file, request) =>
    net.fetch(pathToFileURL(file).href, {
      method: request.method,
      headers: request.headers,
    })
);
const tokens = new Map<number, string>();
const assets = new Map<string, Map<string, Promise<string>>>();
const subscriptions = new Map<
  number,
  Map<number, { event: string; target?: EventTarget }>
>();
const initialDeepLinks = readDeepLinks(process.argv);
const deepLinks = new PendingDeepLinks(initialDeepLinks);
// Chromium scopes the process singleton to userData; isolated data roots stay independent.
if (!app.requestSingleInstanceLock({ urls: initialDeepLinks })) app.exit(0);
const workspaceWindows = new WorkspaceWindows({
  windows,
  create: createWindow,
  emit: publish,
  transparent: process.platform === "win32",
});
const detached = workspaceWindows.detached;
const desktopControls = new DesktopControls({
  createTray: createSystemTray,
  showMain: showMainWindow,
  hideMain: () => windows.get("main")?.hide(),
  minimizeMain: () => windows.get("main")?.minimize(),
  hasCompanions: () => windows.size > 1,
  confirmExit: confirmApplicationExit,
  emitSettings: (sectionId) =>
    emitMainEvent("navigate-to-settings", { sectionId }),
});
const windowResizes = new WindowResizes((error) =>
  console.warn("窗口缩放恢复失败", error)
);
const cancelWindowResize = (owner: number) => {
  try {
    windowResizes.cancel(owner);
  } catch (error) {
    console.warn("窗口缩放恢复失败", error);
  }
};
let quitting = false;
let logQueue = Promise.resolve<unknown>(undefined);
let windowConfigQueue = Promise.resolve<unknown>(undefined);
const unavailable = (name: string): never => {
  throw Object.assign(
    new Error("当前 Electron 版本暂未支持此功能，可从 Tauri 入口继续使用。"),
    { code: "CAPABILITY_UNAVAILABLE", capability: name }
  );
};
const str = (value: unknown): string => {
  if (typeof value !== "string") throw new Error("参数需为字符串");
  return value;
};
const bool = (value: unknown): boolean => {
  if (typeof value !== "boolean") throw new Error("参数需为布尔值");
  return value;
};
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("参数需为对象");
  return value as Record<string, unknown>;
};
function trusted(event: IpcMainInvokeEvent | IpcMainEvent): BrowserWindow {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (
    !win ||
    !Array.from(windows.values()).includes(win) ||
    event.senderFrame !== event.sender.mainFrame ||
    event.senderFrame?.origin !== (devOrigin ?? "aiohub://app") ||
    !isTrustedDocument(event.senderFrame?.url ?? "", devOrigin)
  )
    throw new Error("IPC 来源未获授权");
  return win;
}
const targetLabel = (target?: EventTarget) =>
  typeof target === "string" ? target : target?.label;
function publish(event: string, payload?: unknown, target?: EventTarget) {
  const destination = targetLabel(target);
  for (const [label, win] of windows) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) continue;
    for (const [id, sub] of subscriptions.get(win.webContents.id) ?? []) {
      if (sub.event !== event) continue;
      const scope = targetLabel(sub.target);
      if (
        destination &&
        (scope ? scope !== destination : label !== destination)
      )
        continue;
      win.webContents.send(IPC_EVENT, {
        event,
        id,
        payload,
        windowLabel: destination,
      });
    }
  }
}
function basePaths(): Record<number, string> {
  const data = app.getPath("userData");
  return {
    1: app.getPath("music"),
    2: path.join(app.getPath("userData"), "cache"),
    3: app.getPath("appData"),
    4: app.getPath("appData"),
    5: app.getPath("appData"),
    6: app.getPath("documents"),
    7: app.getPath("downloads"),
    8: app.getPath("pictures"),
    9: path.join(os.homedir(), "Public"),
    10: app.getPath("videos"),
    11: rendererRoot,
    12: app.getPath("temp"),
    13: data,
    14: data,
    15: data,
    16: path.join(data, "cache"),
    17: path.join(data, "logs"),
    18: app.getPath("desktop"),
    19: path.dirname(app.getPath("exe")),
    20:
      process.platform === "win32"
        ? path.join(process.env.WINDIR ?? "C:/Windows", "Fonts")
        : "/usr/share/fonts",
    21: os.homedir(),
    22: app.getPath("temp"),
    23: path.join(os.homedir(), "Templates"),
  };
}
function pathOperation(method: string, args: unknown[]) {
  const bases = basePaths();
  const directories: Record<string, number> = {
    audioDir: 1,
    cacheDir: 2,
    configDir: 3,
    dataDir: 4,
    localDataDir: 5,
    documentDir: 6,
    downloadDir: 7,
    pictureDir: 8,
    publicDir: 9,
    videoDir: 10,
    resourceDir: 11,
    tempDir: 12,
    appConfigDir: 13,
    appDataDir: 14,
    appLocalDataDir: 15,
    appCacheDir: 16,
    appLogDir: 17,
    desktopDir: 18,
    executableDir: 19,
    fontDir: 20,
    homeDir: 21,
    runtimeDir: 22,
    templateDir: 23,
  };
  if (directories[method]) return bases[directories[method]];
  switch (method) {
    case "join":
      return path.join(...args.map(str));
    case "resolve":
      return path.resolve(...args.map(str));
    case "normalize":
      return path.normalize(str(args[0]));
    case "isAbsolute":
      return path.isAbsolute(str(args[0]));
    case "dirname":
      return path.dirname(str(args[0]));
    case "basename":
      return path.basename(
        str(args[0]),
        args[1] === undefined ? undefined : str(args[1])
      );
    case "extname":
      return path.extname(str(args[0])).slice(1);
    case "resolveResource":
      return scopedPath(rendererRoot, str(args[0]));
    default:
      return unavailable("path." + method);
  }
}
const size = (value: unknown, factor: number) => {
  const v = record(value);
  const f = v.type === "Physical" ? factor : 1;
  const width = Math.round(Number(v.width) / f),
    height = Math.round(Number(v.height) / f);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1
  )
    throw new Error("窗口尺寸无效");
  return [width, height] as const;
};
function windowCall(
  label: string,
  method: string,
  value?: unknown,
  owner?: number
): unknown {
  const win = windows.get(label);
  if (!win || win.isDestroyed()) throw new Error("窗口已关闭：" + label);
  const factor = screen.getDisplayMatching(win.getBounds()).scaleFactor;
  switch (method) {
    case "show":
      win.show();
      return;
    case "hide":
      if (label === "main") return desktopControls.hideMain();
      win.hide();
      return;
    case "close":
      win.close();
      return;
    case "destroy":
      win.destroy();
      return;
    case "minimize":
      win.minimize();
      return;
    case "maximize":
      win.maximize();
      return;
    case "unmaximize":
      win.unmaximize();
      return;
    case "unminimize":
      win.restore();
      return;
    case "toggleMaximize":
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
      return;
    case "setFocus":
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
      return;
    case "isFullscreen":
      return win.isFullScreen();
    case "isMaximized":
      return win.isMaximized();
    case "isMinimized":
      return win.isMinimized();
    case "isFocused":
      return win.isFocused();
    case "isAlwaysOnTop":
      return win.isAlwaysOnTop();
    case "isVisible":
      return win.isVisible();
    case "isResizable":
      return win.isResizable();
    case "isDecorated":
      return false;
    case "scaleFactor":
      return factor;
    case "innerSize":
    case "outerSize": {
      const [width, height] =
        method === "innerSize" ? win.getContentSize() : win.getSize();
      return {
        width: Math.round(width * factor),
        height: Math.round(height * factor),
      };
    }
    case "innerPosition":
    case "outerPosition": {
      const [x, y] = win.getPosition();
      return { x: Math.round(x * factor), y: Math.round(y * factor) };
    }
    case "setTitle":
      win.setTitle(str(value));
      return;
    case "setResizable":
      win.setResizable(Boolean(value));
      return;
    case "setAlwaysOnTop":
      win.setAlwaysOnTop(Boolean(value));
      return;
    case "setShadow":
      win.setHasShadow(Boolean(value));
      return;
    case "setSkipTaskbar":
      win.setSkipTaskbar(Boolean(value));
      return;
    case "setFullscreen":
      win.setFullScreen(Boolean(value));
      return;
    case "setDecorations":
      if (value) return unavailable("动态窗口边框");
      return;
    case "setSize":
      win.setSize(...size(value, factor));
      return;
    case "setMinSize":
      win.setMinimumSize(...size(value, factor));
      return;
    case "setMaxSize":
      win.setMaximumSize(...size(value, factor));
      return;
    case "setPosition": {
      const v = record(value);
      const f = v.type === "Physical" ? factor : 1;
      const x = Math.round(Number(v.x) / f),
        y = Math.round(Number(v.y) / f);
      if (!Number.isFinite(x) || !Number.isFinite(y))
        throw new Error("窗口位置无效");
      win.setPosition(x, y);
      return;
    }
    case "setBackgroundColor":
      if (typeof value !== "string") return unavailable("数组背景色");
      win.setBackgroundColor(value);
      return;
    case "startResizeDragging":
      return windowResizes.begin(win, owner ?? -1, value);
    case "updateResizeDragging":
      return windowResizes.update(win, owner ?? -1, value);
    case "endResizeDragging":
      return windowResizes.end(win, owner ?? -1, value);
    case "startDragging":
      return; // Native Chromium app-region performs the drag; no renderer coordinate polling.
    default:
      return unavailable("window." + method);
  }
}
async function saveWindow(label: string) {
  const win = windows.get(label);
  if (!win) throw new Error("窗口已关闭");
  const bounds = win.getNormalBounds();
  const target = path.join(app.getPath("userData"), "electron-windows.json");
  const task = windowConfigQueue
    .catch(() => {})
    .then(async () => {
      let config: Record<string, unknown> = {};
      try {
        config = JSON.parse(await fs.readFile(target, "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      config[label] = { bounds, maximized: win.isMaximized() };
      await writeAtomic(target, JSON.stringify(config));
    });
  windowConfigQueue = task;
  return task;
}
async function createWindow(
  label: string,
  options: Record<string, unknown> = {}
) {
  if (!/^[a-zA-Z0-9_:.-]{1,128}$/.test(label)) throw new Error("窗口标识无效");
  if (windows.has(label)) {
    windowCall(label, "setFocus");
    return;
  }
  const route = typeof options.url === "string" ? options.url : "/";
  const url = new URL(route, devOrigin ?? "aiohub://app/");
  if (!isTrustedDocument(url.href, devOrigin))
    throw new Error("窗口仅允许加载应用页面");
  const token = randomUUID();
  const platform =
    process.platform === "win32"
      ? "windows"
      : process.platform === "darwin"
        ? "macos"
        : "linux";
  const metadata: HostMetadata = {
    platform: "electron",
    label,
    appName: "AIO Hub",
    appVersion: app.getVersion(),
    ...(devControl ? { devControl: true } : {}),
    os: {
      platform,
      type: platform,
      arch:
        (
          { x64: "x86_64", ia32: "x86", arm64: "aarch64" } as Record<
            string,
            string
          >
        )[os.arch()] ?? os.arch(),
      version: os.release(),
      hostname: os.hostname(),
      locale: app.getLocale(),
    },
  };
  const positive = (value: unknown, fallback: number) =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 100 &&
    value <= 16384
      ? Math.round(value)
      : fallback;
  const win = new BrowserWindow({
    width: positive(options.width, 1280),
    height: positive(options.height, 800),
    minWidth: positive(options.minWidth, 600),
    minHeight: positive(options.minHeight, 400),
    title: typeof options.title === "string" ? options.title : "AIO Hub",
    frame: false,
    show: false,
    backgroundColor: options.transparent === true ? "#00000000" : "#191919",
    transparent: options.transparent === true,
    skipTaskbar: options.skipTaskbar === true,
    icon: path.join(hostRoot, "icon.png"),
    resizable: options.resizable !== false,
    alwaysOnTop: options.alwaysOnTop === true,
    webPreferences: {
      preload: path.join(hostRoot, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: false,
      additionalArguments: [
        "--aio-bootstrap=" +
          encodeURIComponent(JSON.stringify({ metadata, assetToken: token })),
      ],
    },
  });
  windows.set(label, win);
  tokens.set(win.webContents.id, token);
  assets.set(token, new Map());
  const contentsId = win.webContents.id;
  win.webContents.setWindowOpenHandler(({ url }) => {
    void Promise.resolve()
      .then(() => shell.openExternal(externalUrl(url)))
      .catch((error) => console.warn("外部链接打开失败", String(error)));
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, destination) => {
    if (!isTrustedDocument(destination, devOrigin)) event.preventDefault();
  });
  win.webContents.on("will-redirect", (event, destination) => {
    if (!isTrustedDocument(destination, devOrigin)) event.preventDefault();
  });
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());
  win.webContents.on(
    "did-start-navigation",
    (_event, _url, inPlace, isMainFrame) => {
      if (isMainFrame && !inPlace) {
        subscriptions.delete(contentsId);
        httpRequests.disposeOwner(contentsId);
        cancelWindowResize(contentsId);
        workspaceWindows.disposeOwner(contentsId);
        canvasPreviews.disposeOwner(contentsId);
      }
    }
  );
  win.on("move", () =>
    publish("tauri://move", windowCall(label, "outerPosition"), label)
  );
  win.on("resize", () =>
    publish("tauri://resize", windowCall(label, "innerSize"), label)
  );
  win.on("focus", () => publish("tauri://focus", true, label));
  win.on("blur", () => {
    cancelWindowResize(contentsId);
    publish("tauri://focus", false, label);
  });
  win.on("hide", () => cancelWindowResize(contentsId));
  win.on("minimize", () => cancelWindowResize(contentsId));
  win.on("maximize", () => cancelWindowResize(contentsId));
  win.on("enter-full-screen", () => cancelWindowResize(contentsId));
  win.on("close", (event) => {
    if (quitting) return;
    const hasHandler = Array.from(
      subscriptions.get(contentsId)?.values() ?? []
    ).some((sub) => sub.event === "tauri://close-requested");
    if (hasHandler) {
      event.preventDefault();
      publish("tauri://close-requested", undefined, label);
      return;
    }
    if (label === "main") {
      event.preventDefault();
      void desktopControls
        .requestMainClose()
        .catch((error) => reportTrayError("关闭主窗口失败", error));
    }
  });
  win.webContents.on("render-process-gone", () => {
    workspaceWindows.disposeOwner(contentsId);
    canvasPreviews.disposeOwner(contentsId);
    httpRequests.disposeOwner(contentsId);
    cancelWindowResize(contentsId);
  });
  win.on("closed", () => {
    workspaceWindows.disposeOwner(contentsId);
    canvasPreviews.disposeOwner(contentsId);
    workspaceWindows.closed(label);
    httpRequests.disposeOwner(contentsId);
    cancelWindowResize(contentsId);
    subscriptions.delete(contentsId);
    tokens.delete(contentsId);
    assets.delete(token);
    windows.delete(label);
    publish("tauri://destroyed", { label });
  });
  try {
    const saved = JSON.parse(
      await fs.readFile(
        path.join(app.getPath("userData"), "electron-windows.json"),
        "utf8"
      )
    )[label];
    if (
      saved?.bounds &&
      screen.getAllDisplays().some((display) => {
        const b = display.workArea;
        return (
          saved.bounds.x < b.x + b.width &&
          saved.bounds.y < b.y + b.height &&
          saved.bounds.x + saved.bounds.width > b.x &&
          saved.bounds.y + saved.bounds.height > b.y
        );
      })
    ) {
      win.setBounds(saved.bounds);
      if (saved.maximized) win.maximize();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      console.warn("窗口配置读取失败", String(error));
  }
  win.once("ready-to-show", () => {
    if (options.visible !== false) win.show();
  });
  try {
    await win.loadURL(url.href);
  } catch (error) {
    win.destroy();
    throw error;
  }
}
let openingMainWindow: Promise<void> | undefined;
async function showMainWindow() {
  if (openingMainWindow) await openingMainWindow;
  const main = windows.get("main");
  if (main && !main.isDestroyed()) {
    if (main.isMinimized()) main.restore();
    main.show();
    main.focus();
    return;
  }
  openingMainWindow = createWindow("main");
  try {
    await openingMainWindow;
  } finally {
    openingMainWindow = undefined;
  }
}

function emitMainEvent(event: string, payload?: unknown): boolean {
  const main = windows.get("main");
  if (!main || main.isDestroyed() || main.webContents.isDestroyed())
    return false;
  const listening = [
    ...(subscriptions.get(main.webContents.id)?.values() ?? []),
  ].some(
    (sub) =>
      sub.event === event &&
      (!targetLabel(sub.target) || targetLabel(sub.target) === "main")
  );
  if (listening) publish(event, payload, "main");
  return listening;
}
async function exitApplication(code: number) {
  quitting = true;
  await Promise.all([skillManager.shutdown(), llmChatPersistence.shutdown()]);
  await windowConfigQueue.catch((error) =>
    console.warn("退出前窗口配置保存失败", error)
  );
  app.exit(code);
}
async function confirmApplicationExit() {
  if (emitMainEvent("request-close-confirmation")) return;
  const main = windows.get("main");
  if (!main || main.isDestroyed()) return;
  const answer = await dialog.showMessageBox(main, {
    type: "question",
    message: "确定要退出程序吗？",
    buttons: ["取消", "退出"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  if (answer.response === 1) await exitApplication(0);
}
function createSystemTray(): Tray {
  const tray = new Tray(
    nativeImage.createFromPath(path.join(hostRoot, "icon.png"))
  );
  const show = () => {
    void showMainWindow().catch((error) =>
      reportTrayError("显示主窗口失败", error)
    );
  };
  try {
    tray.setToolTip(devOrigin ? "AIO Hub（开发）" : "AIO Hub");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "显示主窗口", click: show },
        {
          label: "隐藏主窗口",
          click: () => {
            void desktopControls
              .hideMain()
              .catch((error) => reportTrayError("隐藏主窗口失败", error));
          },
        },
        {
          label: "重启前端",
          click: () => {
            void showMainWindow()
              .then(() => windows.get("main")?.webContents.reload())
              .catch((error) => reportTrayError("重启前端失败", error));
          },
        },
        {
          label: "清除窗口配置",
          click: () => {
            void clearWindowConfigs().catch((error) =>
              reportTrayError("清除窗口配置失败", error)
            );
          },
        },
        { type: "separator" },
        {
          label: "退出",
          click: () => {
            quitting = true;
            app.quit();
          },
        },
      ])
    );
    tray.on("double-click", show);
    return tray;
  } catch (error) {
    tray.destroy();
    throw error;
  }
}
function reportTrayError(action: string, error: unknown) {
  console.error(action, error);
  dialog.showErrorBox(
    action,
    error instanceof Error ? error.message : String(error)
  );
}
async function clearWindowConfigs() {
  const task = windowConfigQueue
    .catch(() => {})
    .then(() =>
      fs.rm(path.join(app.getPath("userData"), "electron-windows.json"), {
        force: true,
      })
    );
  windowConfigQueue = task;
  await task;
}
async function command(
  name: string,
  args: Record<string, unknown>,
  win: BrowserWindow
): Promise<unknown> {
  switch (name) {
    case "llm_chat_atomic_write":
      return llmChatPersistence.write(args.request);
    case "llm_chat_delete_session":
      return llmChatPersistence.deleteSession(args.request);
    case "set_show_tray_icon":
      return desktopControls.setShowTrayIcon(bool(args.show));
    case "update_tray_setting":
      return desktopControls.updateTraySetting(bool(args.enabled));
    case "get_tray_setting":
      return desktopControls.minimizeToTray;
    case "exit_app":
      return exitApplication(0);
    case "navigate_main_window_to_settings":
      return desktopControls.navigateToSettings(str(args.sectionId));
    case "begin_detach_session":
      return workspaceWindows.begin(win.webContents.id, args.config);
    case "finalize_detach_session":
      return workspaceWindows.finalize(
        win.webContents.id,
        str(args.sessionId),
        bool(args.shouldDetach)
      );
    case "update_detach_session_position":
      return workspaceWindows.updatePosition(
        win.webContents.id,
        str(args.sessionId),
        Number(args.x),
        Number(args.y)
      );
    case "update_detach_session_status":
      return workspaceWindows.updateStatus(
        win.webContents.id,
        str(args.sessionId),
        bool(args.canDetach)
      );
    case "create_canvas_window":
      return workspaceWindows.createCanvas(args);
    case "get_canvas_windows":
      return [...workspaceWindows.canvases.values()];
    case "close_canvas_window":
      return workspaceWindows.closeCanvas(args.canvasId);
    case "close_all_canvas_windows":
      return workspaceWindows.closeAllCanvases();
    case "get_all_skill_manifests":
    case "get_well_known_skill_paths":
    case "read_skill_resource":
    case "write_skill_resource":
    case "list_skill_directory":
    case "run_skill_script":
    case "list_builtin_skills":
    case "install_builtin_skill":
    case "reset_skill_to_builtin":
    case "get_builtin_skill_version":
    case "preview_skill_manifest":
    case "detect_skill_package":
    case "prepare_and_detect_package":
    case "clean_temp_dir":
    case "install_skill_from_dir":
    case "install_skill_from_zip_file":
    case "install_skill_from_zip":
    case "install_skill_from_git":
    case "uninstall_skill":
    case "rename_skill":
    case "get_installed_bundles":
    case "install_bundle":
    case "uninstall_bundle":
      return skillManager.run(name, args);
    case "detect_libreoffice_path":
    case "detect_asset_manager_document_converters":
    case "check_asset_manager_document_converter":
      return documentConverter.command(name, args);
    case "list_config_files":
    case "export_all_configs_to_zip":
    case "import_all_configs_from_zip":
      return configArchive.run(name, args);
    case "save_agent_asset":
    case "delete_agent_asset":
    case "batch_delete_agent_assets":
    case "list_agent_assets":
    case "delete_all_agent_assets":
    case "get_agent_asset_path":
    case "read_agent_asset_binary":
      return agentAssets.run(name, args);
    case "convert_legacy_document":
    case "get_asset_base_path":
    case "import_asset_from_path":
    case "import_asset_from_bytes":
    case "get_asset_by_id":
    case "get_asset_binary":
    case "get_asset_base64":
    case "read_text_file":
    case "list_all_assets":
    case "list_assets_paginated":
    case "get_asset_stats":
    case "find_asset_by_hash":
    case "add_asset_source":
    case "remove_asset_source":
    case "remove_asset_completely":
    case "remove_assets_completely":
    case "delete_asset":
    case "update_asset_derived_data":
    case "remove_asset_derived_data":
    case "update_audio_waveform":
    case "save_asset_thumbnail":
    case "rebuild_hash_index":
    case "rebuild_catalog_index":
    case "find_duplicate_files":
      return assetManager.run(name, args);
    case "get_app_config_dir":
      return app.getPath("userData");
    case "path_exists":
    case "is_directory":
    case "get_file_metadata":
    case "list_directory":
    case "create_dir_force":
    case "read_text_file_force":
    case "write_text_file_force":
    case "write_file_force":
    case "read_file_binary":
    case "read_file_binary_raw":
    case "read_file_as_base64":
    case "append_file_force":
    case "copy_file_to_app_data":
    case "save_uploaded_file":
    case "delete_directory_in_app_data":
    case "delete_file_to_trash":
    case "copy_directory_in_app_data":
      return fileCommand(name, args, {
        root: app.getPath("userData"),
        trashItem: (value) => shell.trashItem(value),
      });
    case "save_window_config":
      return saveWindow(str(args.label));
    case "clear_all_window_configs":
      return clearWindowConfigs();
    case "focus_window":
      return windowCall(str(args.label), "setFocus");
    case "close_detached_window":
      return windowCall(str(args.label), "close");
    case "get_all_detached_windows":
      return Array.from(detached.values());
    case "ensure_window_visible": {
      const w = windows.get(str(args.label));
      if (!w) throw new Error("窗口已关闭");
      const b = w.getBounds();
      const area = screen.getDisplayMatching(b).workArea;
      if (
        b.x + b.width < area.x ||
        b.y + b.height < area.y ||
        b.x > area.x + area.width ||
        b.y > area.y + area.height
      ) {
        w.center();
        return true;
      }
      return false;
    }
    case "create_tool_window": {
      const config = record(args.config);
      const label = str(config.label);
      await createWindow(label, config);
      workspaceWindows.registerTool(label);
      return;
    }
    case "set_window_shadow":
      win.setHasShadow(Boolean(args.hasShadow ?? args.enabled ?? args.shadow));
      return;
    case "apply_window_effect": {
      const effect = str(args.effect);
      if (process.platform === "win32") {
        const materials: Record<
          string,
          "auto" | "none" | "mica" | "acrylic" | "tabbed"
        > = {
          none: "none",
          mica: "mica",
          acrylic: "acrylic",
          blur: "acrylic",
          tabbed: "tabbed",
          auto: "auto",
        };
        if (!materials[effect]) return unavailable("窗口材质 " + effect);
        win.setBackgroundMaterial(materials[effect]);
      } else if (effect !== "none") return unavailable("窗口材质 " + effect);
      return;
    }
    case "dev_control_identity":
      return devControlIdentity(
        devControl,
        Array.from(windows).find(([, candidate]) => candidate === win)![0],
        process.pid
      );
    case "frontend_probe_ready":
    case "frontend_probe_heartbeat":
      return;
    case "frontend_probe_error":
      console.warn("前端诊断", args.payload);
      return;
    case "append_app_log": {
      const task = logQueue
        .catch(() => {})
        .then(async () => {
          const date = str(args.date);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
            throw new Error("日志日期无效");
          const dir = path.join(app.getPath("userData"), "logs");
          await fs.mkdir(dir, { recursive: true });
          const file = path.join(dir, date + ".log");
          const content = new Uint8Array(args.content as number[]);
          const info = await fs.stat(file).catch(() => undefined);
          let rotatedFileName: string | undefined;
          if (
            info &&
            info.size + content.byteLength >
              Math.max(1024, Number(args.maxFileSize) || 10485760)
          ) {
            rotatedFileName = date + "-" + Date.now() + ".log";
            await fs.rename(file, path.join(dir, rotatedFileName));
          }
          const handle = await fs.open(file, "a");
          try {
            await handle.writeFile(content);
            if (args.syncData) await handle.sync();
          } finally {
            await handle.close();
          }
          return { path: file, rotatedFileName };
        });
      logQueue = task;
      return task;
    }
    default:
      return unavailable(name);
  }
}
async function operation(
  event: IpcMainInvokeEvent,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const win = trusted(event);
  switch (name) {
    case "canvas-preview.create":
      return canvasPreviews.create(event.sender.id, args.canvasId);
    case "canvas-preview.update":
      return canvasPreviews.update(event.sender.id, str(args.id), args.html);
    case "canvas-preview.release":
      return canvasPreviews.release(event.sender.id, str(args.id));
    case "http.start":
      return httpRequests.start(
        event.sender.id,
        str(args.id),
        record(args.options) as unknown as HttpRequestOptions
      );
    case "http.read":
      return httpRequests.read(event.sender.id, str(args.id));
    case "http.cancel":
      return httpRequests.cancel(event.sender.id, str(args.id));
    case "deep-link.current":
      return win === windows.get("main") ? deepLinks.take() : null;
    case "command":
      return command(
        str(args.command),
        args.args === undefined ? {} : record(args.args),
        win
      );
    case "fs":
      return fileOperation(
        str(args.method),
        args.args as unknown[],
        basePaths()
      );
    case "path":
      return pathOperation(str(args.method), args.args as unknown[]);
    case "window.labels":
      return Array.from(windows.keys());
    case "window.create":
      return createWindow(
        str(args.label),
        args.options === undefined ? {} : record(args.options)
      );
    case "window.call":
      return windowCall(
        str(args.label),
        str(args.method),
        args.value,
        event.sender.id
      );
    case "window.monitor":
      return toWindowMonitor(screen.getDisplayMatching(win.getBounds()));
    case "events.listen": {
      const eventName = str(args.event);
      const id = Number(args.id);
      if (!Number.isSafeInteger(id) || id < 1 || eventName.length > 256)
        throw new Error("事件订阅无效");
      let subs = subscriptions.get(event.sender.id);
      if (!subs) subscriptions.set(event.sender.id, (subs = new Map()));
      subs.set(id, { event: eventName, target: args.target as EventTarget });
      if (eventName === "platform://open-url") deliverDeepLinks();
      if (eventName === "navigate-to-settings")
        desktopControls.deliverSettings();
      if (eventName === "finalize-component-view") {
        const label = [...detached.keys()].find(
          (label) => windows.get(label) === win
        );
        if (label) publish(eventName, undefined, label);
      }
      return;
    }
    case "events.unlisten":
      subscriptions.get(event.sender.id)?.delete(Number(args.id));
      return;
    case "events.emit":
      publish(str(args.event), args.payload, args.target as EventTarget);
      return;
    case "clipboard.readText":
      return clipboard.readText();
    case "clipboard.writeText":
      clipboard.writeText(str(args.text));
      return;
    case "clipboard.clear":
      clipboard.clear();
      return;
    case "dialog.open": {
      const opts = (args.options ?? {}) as {
        multiple?: boolean;
        directory?: boolean;
        title?: string;
        defaultPath?: string;
        filters?: OpenDialogOptions["filters"];
      };
      const result = await dialog.showOpenDialog(win, {
        title: opts.title,
        defaultPath: opts.defaultPath,
        filters: opts.filters,
        properties: [
          opts.directory ? "openDirectory" : "openFile",
          ...(opts.multiple ? ["multiSelections" as const] : []),
        ],
      });
      return result.canceled
        ? null
        : opts.multiple
          ? result.filePaths
          : (result.filePaths[0] ?? null);
    }
    case "dialog.save": {
      const opts = (args.options ?? {}) as SaveDialogOptions;
      const result = await dialog.showSaveDialog(win, {
        title: opts.title,
        defaultPath: opts.defaultPath,
        filters: opts.filters,
      });
      return result.canceled ? null : (result.filePath ?? null);
    }
    case "opener.url":
      return shell.openExternal(externalUrl(str(args.url)));
    case "opener.path": {
      const error = await shell.openPath(
        filePath(args.path, undefined, basePaths())
      );
      if (error) throw new Error(error);
      return;
    }
    case "opener.reveal":
      shell.showItemInFolder(filePath(args.path, undefined, basePaths()));
      return;
    case "process.relaunch":
      app.relaunch();
      quitting = true;
      app.quit();
      return;
    case "process.exit":
      return exitApplication(Number(args.code) || 0);
    default:
      return unavailable(name);
  }
}
ipcMain.handle(
  IPC_REQUEST,
  async (event, name: unknown, args: unknown): Promise<HostReply> => {
    try {
      return {
        ok: true,
        value: await operation(
          event,
          str(name),
          args === undefined ? {} : record(args)
        ),
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code:
            typeof (error as { code?: unknown })?.code === "string"
              ? (error as { code: string }).code
              : "HOST_ERROR",
          message: error instanceof Error ? error.message : String(error),
          capability: (error as { capability?: string })?.capability,
        },
      };
    }
  }
);
ipcMain.on(IPC_ASSET, (event, value: unknown) => {
  try {
    trusted(event);
    const file = filePath(value, undefined, basePaths());
    const grants = assets.get(tokens.get(event.sender.id)!);
    const resolved = fs.realpath(file);
    void resolved.catch(() => {});
    grants?.set(file, resolved);
  } catch {
    /* Invalid grants never gain access to the protocol. */
  }
});
void app
  .whenReady()
  .then(async () => {
    await fs.mkdir(app.getPath("userData"), { recursive: true });
    session.defaultSession.setPermissionRequestHandler(
      (_contents, _permission, callback) => callback(false)
    );
    session.defaultSession.setPermissionCheckHandler(() => false);
    const scriptHashes = new Set<string>();
    if (!devOrigin) {
      for (const name of [
        "index.html",
        "background-js.html",
        "danmaku-overlay.html",
      ]) {
        const html = await fs.readFile(path.join(rendererRoot, name), "utf8");
        for (const match of html.matchAll(
          /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
        )) {
          if (!/\bsrc\s*=/.test(match[1]))
            scriptHashes.add(
              "'sha256-" +
                createHash("sha256")
                  .update(match[2].replace(/\r\n?/g, "\n"))
                  .digest("base64") +
                "'"
            );
        }
      }
    }
    protocol.handle("aiohub", async (request) => {
      try {
        const url = new URL(request.url);
        if (url.host === "canvas-preview")
          return canvasPreviews.response(request);
        if (url.host !== "app" || !["GET", "HEAD"].includes(request.method))
          return new Response("Forbidden", { status: 403 });
        let file = !path.posix.extname(url.pathname)
          ? path.join(rendererRoot, "index.html")
          : rendererFile(rendererRoot, url.pathname);
        try {
          if (!(await fs.stat(file)).isFile()) throw new Error("not file");
        } catch {
          if (request.headers.get("sec-fetch-dest") === "document")
            file = path.join(rendererRoot, "index.html");
          else return new Response("Not found", { status: 404 });
        }
        const response = await net.fetch(pathToFileURL(file).href, {
          method: request.method,
        });
        const headers = new Headers(response.headers);
        headers.set(
          "Content-Security-Policy",
          "default-src 'self'; script-src 'self' 'unsafe-eval' blob: " +
            Array.from(scriptHashes).join(" ") +
            "; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: asset: https: http:; font-src 'self' data: asset:; media-src 'self' blob: data: asset: https: http:; connect-src 'self' asset: https: http: wss: ws:; worker-src 'self' blob:; frame-src 'self' blob: data: aiohub://canvas-preview; object-src 'none'; base-uri 'self'"
        );
        return new Response(response.body, {
          status: response.status,
          headers,
        });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    });
    protocol.handle("asset", async (request) => {
      try {
        const url = new URL(request.url);
        if (url.host !== "local" || !["GET", "HEAD"].includes(request.method))
          return new Response("Forbidden", { status: 403 });
        const file = filePath(
          decodeURIComponent(url.pathname.slice(1)),
          undefined,
          basePaths()
        );
        const resolved = assets
          .get(url.searchParams.get("token") ?? "")
          ?.get(file);
        if (!resolved) return new Response("Forbidden", { status: 403 });
        const canonical = await resolved;
        if ((await fs.realpath(file)) !== canonical)
          return new Response("Forbidden", { status: 403 });
        return net.fetch(pathToFileURL(canonical).href, {
          method: request.method,
          headers: request.headers,
        });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    });
    const desktopSettings = await readDesktopSettings(app.getPath("userData"));
    desktopControls.minimizeToTray = desktopSettings.minimizeToTray;
    await createWindow("main");
    await desktopControls.setShowTrayIcon(desktopSettings.showTrayIcon);
  })
  .catch((error) => {
    console.error("Electron 启动失败", error);
    app.exit(1);
  });
let stoppingHostOperations = false;
app.on("before-quit", (event) => {
  quitting = true;
  desktopControls.destroy();
  const pending =
    skillManager.hasPendingOperations ||
    llmChatPersistence.hasPendingOperations;
  const shutdown = llmChatPersistence.shutdown();
  if (pending) {
    event.preventDefault();
    if (!stoppingHostOperations) {
      stoppingHostOperations = true;
      void Promise.all([skillManager.shutdown(), shutdown]).finally(() =>
        app.quit()
      );
    }
  }
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  void showMainWindow().catch((error) =>
    reportTrayError("显示主窗口失败", error)
  );
});

function deliverDeepLinks() {
  const main = windows.get("main");
  if (!main || main.isDestroyed() || main.webContents.isDestroyed()) return;
  const listeners = [...(subscriptions.get(main.webContents.id) ?? [])].filter(
    ([, sub]) =>
      sub.event === "platform://open-url" &&
      (!targetLabel(sub.target) || targetLabel(sub.target) === "main")
  );
  if (!listeners.length) return;
  const values = deepLinks.take();
  if (!values) return;
  for (const [id] of listeners) {
    main.webContents.send(IPC_EVENT, {
      event: "platform://open-url",
      id,
      payload: values,
      windowLabel: "main",
    });
  }
}
function acceptDeepLinks(values: unknown) {
  deepLinks.add(values);
  deliverDeepLinks();
  void showMainWindow().catch((error) =>
    reportTrayError("显示主窗口失败", error)
  );
}
app.on("second-instance", (_event, argv, _directory, additionalData) => {
  const data = additionalData as { urls?: unknown } | undefined;
  acceptDeepLinks(Array.isArray(data?.urls) ? data.urls : argv);
});
app.on("open-url", (event, value) => {
  const links = readDeepLinks([value]);
  if (!links.length) return;
  event.preventDefault();
  deepLinks.add(links);
  // open-url can arrive before ready on macOS; the startup main window consumes the queue.
  if (app.isReady()) acceptDeepLinks([]);
});
