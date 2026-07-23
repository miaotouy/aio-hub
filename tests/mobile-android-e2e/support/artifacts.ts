import fs from "node:fs";
import path from "node:path";
import type { Browser } from "webdriverio";
import type { AdbClient } from "./adb";
import type { MobileE2eRunResult } from "../types";

const SENSITIVE_KEYS = /authorization|api[-_]?key|token|secret|password/i;
const WINDOWS_PATH_PATTERN = /\b[A-Za-z]:\\[^\r\n"']+/g;
const MOBILE_PATH_PATTERN = /\/(?:storage|data|private|var)\/[^\s"']+/g;
const URI_PATTERN = /\b(?:content|file):\/\/[^\s"']+/gi;
const SECRET_PATTERN = /\b(?:sk-[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9._-]{12,})\b/gi;

/** Keep diagnostics useful while removing values that may contain user data. */
export function redactArtifactText(value: string): string {
  return value
    .replace(SECRET_PATTERN, "[REDACTED_SECRET]")
    .replace(/(authorization|api[-_]?key|token|secret|password)\s*[:=]\s*[^,}\s]+/gi, "$1=[REDACTED]")
    .replace(URI_PATTERN, "[REDACTED_URI]")
    .replace(WINDOWS_PATH_PATTERN, "[REDACTED_PATH]")
    .replace(MOBILE_PATH_PATTERN, "[REDACTED_PATH]");
}

export function redactAppiumLog(value: string): string {
  return redactArtifactText(value)
    .split(/\r?\n/)
    .map((line) => {
      // WebDriver request/response bodies contain input text and rendered chat content.
      if (
        /\[(?:HTTP|Chromedriver@[^\]]+)\].*(?:--> |<-- |with body:|Got response)/.test(
          line
        )
      ) {
        return line.replace(/\s(?:with body:|Got response[^:]*:|\{)\s*.*$/, " [REDACTED_BODY]");
      }
      return line;
    })
    .join("\n");
}

export function redactDomSnapshot(value: string): string {
  return redactArtifactText(value)
    .replace(
      /\s(value|text|content-desc|hint|aria-label)="[^"]*"/gi,
      (_match, attribute: string) => ` ${attribute}="[REDACTED]"`
    )
    .replace(/>([^<\r\n]{1,500})</g, ">[REDACTED_TEXT]<");
}

export function redactStructured(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactStructured);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_KEYS.test(key)
        ? "[REDACTED]"
        : key === "path" && typeof item === "string"
          ? path.basename(item)
          : redactStructured(item),
    ])
  );
}

export class ArtifactManager {
  readonly runDir: string;
  readonly requestSummaryPath: string;

  constructor(
    root: string,
    readonly run: MobileE2eRunResult
  ) {
    this.runDir = path.join(root, run.runId);
    this.requestSummaryPath = path.join(this.runDir, "request-summaries.jsonl");
    fs.mkdirSync(this.runDir, { recursive: true });
    fs.writeFileSync(this.requestSummaryPath, "", "utf8");
    this.writeRun();
  }

  path(name: string): string {
    return path.join(this.runDir, name);
  }

  writeRun(): void {
    fs.writeFileSync(
      this.path("e2e-run.json"),
      `${JSON.stringify(redactStructured(this.run), null, 2)}\n`,
      "utf8"
    );
  }

  appendRequestSummary(summary: Record<string, unknown>): void {
    fs.appendFileSync(
      this.requestSummaryPath,
      `${JSON.stringify(redactStructured(summary))}\n`,
      "utf8"
    );
  }

  redactExistingLog(name: string, appium = false): void {
    const filePath = this.path(name);
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, "utf8");
    fs.writeFileSync(
      filePath,
      appium ? redactAppiumLog(content) : redactArtifactText(content),
      "utf8"
    );
  }

  async captureFailure(options: {
    driver?: Browser;
    adb?: AdbClient;
    serial?: string;
  }): Promise<void> {
    const { driver, adb, serial } = options;
    if (driver) {
      await driver
        .saveScreenshot(this.path("failure.png"))
        .catch(() => undefined);
      const contexts = await driver.getContexts().catch(() => []);
      fs.writeFileSync(
        this.path("contexts.json"),
        `${JSON.stringify(contexts, null, 2)}\n`,
        "utf8"
      );
      const originalContext = await driver.getContext().catch(() => null);
      const webview = contexts.find((context) =>
        String(context).startsWith("WEBVIEW")
      );
      if (webview) {
        await driver.switchContext(String(webview)).catch(() => undefined);
        const dom = await driver.getPageSource().catch(() => "");
        fs.writeFileSync(
          this.path("webview-dom.html"),
          redactDomSnapshot(dom).slice(0, 500_000),
          "utf8"
        );
      }
      if (originalContext) {
        await driver
          .switchContext(String(originalContext))
          .catch(() => undefined);
      }
    }
    if (adb && serial) {
      const appPid = await adb
        .pidOf(serial, "com.aiohub.mobile")
        .catch(() => null);
      const [hierarchy, logcat, activity] = await Promise.all([
        adb.serial(serial, ["exec-out", "uiautomator", "dump", "/dev/tty"], {
          allowFailure: true,
          timeoutMs: 20_000,
        }),
        adb.serial(
          serial,
          [
            "logcat",
            "-d",
            ...(appPid ? [`--pid=${appPid}`] : []),
            "-t",
            "1500",
          ],
          {
            allowFailure: true,
            timeoutMs: 20_000,
          }
        ),
        adb.serial(serial, ["shell", "dumpsys", "activity", "activities"], {
          allowFailure: true,
          timeoutMs: 20_000,
        }),
      ]);
      fs.writeFileSync(
        this.path("uiautomator.xml"),
        redactDomSnapshot(hierarchy.stdout),
        "utf8"
      );
      fs.writeFileSync(
        this.path("logcat.txt"),
        redactArtifactText(logcat.stdout).slice(-1_000_000),
        "utf8"
      );
      fs.writeFileSync(
        this.path("activity.txt"),
        redactArtifactText(activity.stdout).slice(0, 200_000),
        "utf8"
      );
    }
  }
}
