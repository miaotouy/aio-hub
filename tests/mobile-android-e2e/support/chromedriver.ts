import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { CommandRunner } from "./process";
import { runCommand } from "./process";

export const PINNED_CHROMEDRIVER_VERSION = "133.0.6943.141";
const DOWNLOAD_URL = `https://storage.googleapis.com/chrome-for-testing-public/${PINNED_CHROMEDRIVER_VERSION}/win64/chromedriver-win64.zip`;
const ARCHIVE_MD5 = "2d2c8b6236838a6976096d27db6c4ef8";

export async function verifyChromedriver(
  executable: string,
  run: CommandRunner = runCommand
): Promise<void> {
  if (!fs.existsSync(executable)) {
    throw new Error(`Chromedriver not found: ${executable}`);
  }
  const version = await run([executable, "--version"], { timeoutMs: 10_000 });
  if (!version.stdout.includes(PINNED_CHROMEDRIVER_VERSION)) {
    throw new Error(
      `Expected Chromedriver ${PINNED_CHROMEDRIVER_VERSION}, received ${version.stdout.trim()}.`
    );
  }
}

export async function ensureChromedriver(options: {
  repoRoot: string;
  overridePath?: string;
  run?: CommandRunner;
}): Promise<string> {
  const run = options.run ?? runCommand;
  if (options.overridePath) {
    const executable = path.resolve(options.overridePath);
    await verifyChromedriver(executable, run);
    return executable;
  }
  const cacheRoot = path.join(
    options.repoRoot,
    ".dev-data",
    "mobile-android-e2e",
    "tools",
    `chromedriver-${PINNED_CHROMEDRIVER_VERSION}`
  );
  const executable = path.join(cacheRoot, "chromedriver-win64", "chromedriver.exe");
  if (fs.existsSync(executable)) {
    await verifyChromedriver(executable, run);
    return executable;
  }
  fs.mkdirSync(cacheRoot, { recursive: true });
  const archive = path.join(cacheRoot, "chromedriver.zip");
  let archiveMd5 = fs.existsSync(archive)
    ? createHash("md5").update(fs.readFileSync(archive)).digest("hex")
    : "";
  if (archiveMd5 !== ARCHIVE_MD5) {
    await run(
      [
        "curl.exe",
        "--location",
        "--continue-at",
        "-",
        "--retry",
        "20",
        "--retry-all-errors",
        "--retry-delay",
        "1",
        "--silent",
        "--show-error",
        "--output",
        archive,
        DOWNLOAD_URL,
      ],
      { timeoutMs: 600_000 }
    );
    archiveMd5 = createHash("md5")
      .update(fs.readFileSync(archive))
      .digest("hex");
  }
  if (archiveMd5 !== ARCHIVE_MD5) {
    fs.rmSync(archive, { force: true });
    throw new Error(`Chromedriver archive checksum mismatch: ${archiveMd5}.`);
  }
  await run(["tar", "-xf", archive, "-C", cacheRoot], {
    timeoutMs: 60_000,
  });
  fs.rmSync(archive, { force: true });
  await verifyChromedriver(executable, run);
  return executable;
}
