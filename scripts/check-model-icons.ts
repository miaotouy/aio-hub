import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const MODEL_ICON_PREFIX = "/model-icons/";
const LOBE_ICON_DIR = path.join(
  process.cwd(),
  "node_modules/@lobehub/icons-static-svg/icons"
);
const LOCAL_ICON_DIR = path.join(process.cwd(), "public/model-icons");
const LOCAL_ICON_EXTENSIONS = new Set([".svg", ".png", ".jpg", ".webp"]);

interface IconReference {
  source: string;
  path: string;
}

interface MetadataRule {
  id: string;
  properties: {
    icon?: unknown;
  };
}

interface PresetIcon {
  name: string;
  path: string;
}

async function importProjectModule<T>(relativePath: string): Promise<T> {
  const moduleUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return (await import(moduleUrl)) as T;
}

function readIconFilenames(dir: string, extensions: Set<string>) {
  if (!fs.existsSync(dir)) {
    return new Set<string>();
  }

  return new Set(
    fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((filename) => extensions.has(path.extname(filename)))
  );
}

function normalizeModelIconPath(iconPath: string) {
  return iconPath.startsWith("/")
    ? iconPath
    : `${MODEL_ICON_PREFIX}${iconPath}`;
}

function collectIconReferences(
  metadataRules: MetadataRule[],
  presetIcons: PresetIcon[]
) {
  const references: IconReference[] = [];

  for (const rule of metadataRules) {
    const icon = rule.properties.icon;
    if (typeof icon !== "string" || !icon.startsWith(MODEL_ICON_PREFIX)) {
      continue;
    }

    references.push({
      source: `metadata rule ${rule.id}`,
      path: icon,
    });
  }

  for (const icon of presetIcons) {
    const normalizedPath = normalizeModelIconPath(icon.path);
    if (!normalizedPath.startsWith(MODEL_ICON_PREFIX)) {
      continue;
    }

    references.push({
      source: `preset icon ${icon.name}`,
      path: normalizedPath,
    });
  }

  return references;
}

const lobeIconFilenames = readIconFilenames(LOBE_ICON_DIR, new Set([".svg"]));
const localIconFilenames = readIconFilenames(
  LOCAL_ICON_DIR,
  LOCAL_ICON_EXTENSIONS
);
const availableIconPaths = new Set(
  [...lobeIconFilenames, ...localIconFilenames].map(
    (filename) => `${MODEL_ICON_PREFIX}${filename}`
  )
);
const { DEFAULT_METADATA_RULES } = await importProjectModule<{
  DEFAULT_METADATA_RULES: MetadataRule[];
}>("src/config/model-metadata-presets/index.ts");
const { MANUAL_PRESET_ICONS, USER_ADDED_ICONS } = await importProjectModule<{
  MANUAL_PRESET_ICONS: PresetIcon[];
  USER_ADDED_ICONS: PresetIcon[];
}>("src/config/preset-icons-data.ts");
const references = collectIconReferences(DEFAULT_METADATA_RULES, [
  ...MANUAL_PRESET_ICONS,
  ...USER_ADDED_ICONS,
]);
const missingReferences = references.filter(
  (reference) => !availableIconPaths.has(reference.path)
);

console.log("--- Model Icon Check Report ---");
console.log(`Checked ${references.length} model icon references.`);
console.log(`Available icons: ${availableIconPaths.size}`);

if (missingReferences.length === 0) {
  console.log("All referenced model icons exist.");
  process.exit(0);
}

console.error(
  `Found ${missingReferences.length} missing model icon reference(s):`
);
for (const reference of missingReferences) {
  console.error(`- ${reference.path} (${reference.source})`);
}

process.exit(1);

