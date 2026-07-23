import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  redactAppiumLog,
  redactArtifactText,
  redactDomSnapshot,
  redactStructured,
  ArtifactManager,
} from "./artifacts";

describe("mobile E2E artifact redaction", () => {
  it("removes paths, URIs, and common credential forms from text", () => {
    const redacted = redactArtifactText(
      "C:\\Users\\name\\chat.txt content://provider/42 Bearer abcdefghijklmnop"
    );
    expect(redacted).not.toContain("C:\\Users");
    expect(redacted).not.toContain("content://provider");
    expect(redacted).not.toContain("Bearer abcdefghijklmnop");
  });

  it("removes WebDriver request and response bodies from Appium logs", () => {
    const redacted = redactAppiumLog(
      '[HTTP] --> POST /value {"text":"private chat body"}\n' +
        '[Chromedriver@1] Got response with status 200: {"value":"reply"}'
    );
    expect(redacted).not.toContain("private chat body");
    expect(redacted).not.toContain("reply");
    expect(redacted).toContain("[REDACTED_BODY]");
  });

  it("keeps selectors but removes visible DOM text and input values", () => {
    const redacted = redactDomSnapshot(
      '<button data-testid="chat-send" aria-label="发送">Send private text</button>'
    );
    expect(redacted).toContain('data-testid="chat-send"');
    expect(redacted).not.toContain("Send private text");
    expect(redacted).not.toContain('aria-label="发送"');
  });

  it("stores only the APK filename in structured run metadata", () => {
    const redacted = redactStructured({
      apk: { path: "E:\\repo\\app.apk", sha256: "hash" },
    }) as { apk: { path: string } };
    expect(redacted.apk.path).toBe("app.apk");
  });

  it("rewrites existing process logs with the artifact redactor", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiohub-mobile-e2e-"));
    try {
      const manager = new ArtifactManager(root, {
        schemaVersion: 1,
        runId: "run-1",
        startedAt: "2026-07-23T00:00:00.000Z",
        preset: "core",
        status: "running",
        warnings: [],
        scenarios: [],
      });
      fs.writeFileSync(
        manager.path("emulator.log"),
        "SDK at C:\\Users\\name\\Android\\Sdk",
        "utf8"
      );
      manager.redactExistingLog("emulator.log");
      expect(fs.readFileSync(manager.path("emulator.log"), "utf8")).toBe(
        "SDK at [REDACTED_PATH]"
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
