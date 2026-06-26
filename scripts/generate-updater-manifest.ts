import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "fs";
import path from "path";

interface Args {
  dir: string;
  tag: string;
  repo: string;
  out: string;
  notesFile?: string;
  pubDate?: string;
}

interface PlatformEntry {
  signature: string;
  url: string;
}

interface Manifest {
  version: string;
  notes: string;
  pub_date: string;
  platforms: Record<string, PlatformEntry>;
}

const DEFAULT_REPO = "miaotouy/aio-hub";
const SEMVER_TAG_PATTERN = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];

  return undefined;
}

function parseArgs(): Args {
  const dir = getArg("dir") || "release-files";
  const tag = getArg("tag") || process.env.GITHUB_REF_NAME || "";
  const repo = getArg("repo") || process.env.GITHUB_REPOSITORY || DEFAULT_REPO;
  const out = getArg("out") || path.join(dir, "latest.json");

  return {
    dir,
    tag,
    repo,
    out,
    notesFile: getArg("notes-file"),
    pubDate: getArg("pub-date"),
  };
}

function listFiles(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((name) => {
      const filePath = path.join(dir, name);
      if (statSync(filePath).isDirectory()) return listFiles(filePath);
      return filePath;
    })
    .sort((a, b) => a.localeCompare(b));
}

function inferArch(fileName: string): "x86_64" | "aarch64" | null {
  const lowerName = fileName.toLowerCase();
  if (/(aarch64|arm64)/.test(lowerName)) return "aarch64";
  if (/(x86_64|x64|amd64)/.test(lowerName)) return "x86_64";
  return null;
}

function inferPlatformKey(fileName: string): string | null {
  const lowerName = fileName.toLowerCase();
  const arch = inferArch(fileName);
  if (!arch) return null;

  if (
    lowerName.endsWith(".nsis.zip") ||
    lowerName.includes("nsis") ||
    (lowerName.endsWith(".exe.zip") && lowerName.includes("setup")) ||
    (lowerName.endsWith("-setup.zip") && lowerName.includes("windows"))
  ) {
    return `windows-${arch}-nsis`;
  }

  if (lowerName.endsWith(".msi")) {
    return `windows-${arch}-msi`;
  }

  if (lowerName.endsWith(".exe") && lowerName.includes("setup")) {
    return `windows-${arch}-nsis`;
  }

  if (lowerName.endsWith(".appimage.tar.gz") || lowerName.endsWith(".appimage")) {
    return `linux-${arch}-appimage`;
  }

  if (lowerName.endsWith(".deb")) {
    return `linux-${arch}-deb`;
  }

  if (lowerName.endsWith(".rpm")) {
    return `linux-${arch}-rpm`;
  }

  if (
    lowerName.endsWith(".app.tar.gz") ||
    lowerName.endsWith(".dmg") ||
    lowerName.includes("darwin") ||
    lowerName.includes("macos")
  ) {
    return `darwin-${arch}-app`;
  }

  return null;
}

function buildDownloadUrl(repo: string, tag: string, fileName: string): string {
  return `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(fileName)}`;
}

function readNotes(notesFile?: string): string {
  if (!notesFile) return "";
  if (!existsSync(notesFile)) return "";
  return readFileSync(notesFile, "utf-8").trim();
}

function main() {
  const args = parseArgs();
  if (!args.tag || !SEMVER_TAG_PATTERN.test(args.tag)) {
    console.log(
      `Skip updater manifest: "${args.tag || "(empty)"}" is not a SemVer release tag.`
    );
    return;
  }

  if (!existsSync(args.dir)) {
    throw new Error(`Release directory does not exist: ${args.dir}`);
  }

  const platforms: Record<string, PlatformEntry> = {};
  const files = listFiles(args.dir);
  const releaseDir = path.resolve(args.dir);

  for (const signaturePath of files.filter((file) => file.endsWith(".sig"))) {
    const artifactPath = signaturePath.slice(0, -".sig".length);
    if (!existsSync(artifactPath)) {
      console.warn(`Skip signature without artifact: ${path.basename(signaturePath)}`);
      continue;
    }

    const artifactName = path.basename(artifactPath);
    const platformKey = inferPlatformKey(artifactName);
    if (!platformKey) {
      console.warn(`Skip artifact with unknown platform: ${artifactName}`);
      continue;
    }

    if (platforms[platformKey]) {
      console.warn(`Replace duplicate updater platform entry: ${platformKey}`);
    }

    platforms[platformKey] = {
      signature: readFileSync(signaturePath, "utf-8").trim(),
      url: buildDownloadUrl(args.repo, args.tag, artifactName),
    };
  }

  if (Object.keys(platforms).length === 0) {
    console.log("Skip updater manifest: no signed updater artifacts found.");
    return;
  }

  const manifest: Manifest = {
    version: args.tag,
    notes: readNotes(args.notesFile),
    pub_date: args.pubDate || new Date().toISOString(),
    platforms,
  };

  const outPath = path.resolve(args.out);
  if (!outPath.startsWith(releaseDir + path.sep) && outPath !== releaseDir) {
    throw new Error(`Manifest output must stay inside release directory: ${outPath}`);
  }

  writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Generated updater manifest: ${outPath}`);
  console.log(`Platforms: ${Object.keys(platforms).join(", ")}`);
}

main();
