import type { NormalizeOptions, SimilarityConfig } from "../types";

/** 预设定义 */
export interface PresetDefinition {
  id: string;
  label: string;
  description: string;
  icon: string;
  config: Partial<SimilarityConfig>;
}

/** 默认规范化选项 */
const DEFAULT_NORMALIZE: NormalizeOptions = {
  ignoreWhitespace: true,
  ignorePunctuation: false,
  caseSensitive: true,
  preserveLineBreaks: false,
};

/** 默认配置 */
export const DEFAULT_CONFIG: SimilarityConfig = {
  extensions: [],
  ignorePatterns: ["node_modules", ".git", "dist", "build", "__pycache__", ".venv"],
  maxFileSizeMb: 50,
  sizeDiffThreshold: 0.05,
  minSimilarity: 0.85,
  suspiciousSizeLimit: 3072,
  preset: "relaxed",
  normalizeOptions: { ...DEFAULT_NORMALIZE },
};

/** 预设列表 */
export const PRESETS: PresetDefinition[] = [
  {
    id: "relaxed",
    label: "宽松模式",
    description: "忽略空白和大小写差异，适合 LLM 生成文本、文档去重",
    icon: "FileText",
    config: {
      sizeDiffThreshold: 0.1,
      normalizeOptions: {
        ignoreWhitespace: true,
        ignorePunctuation: true,
        caseSensitive: false,
        preserveLineBreaks: false,
      },
    },
  },
  {
    id: "strict",
    label: "严格模式",
    description: "保留大小写，仅忽略空白差异，适合精确查重",
    icon: "ShieldCheck",
    config: {
      sizeDiffThreshold: 0.05,
      normalizeOptions: {
        ignoreWhitespace: true,
        ignorePunctuation: false,
        caseSensitive: true,
        preserveLineBreaks: false,
      },
    },
  },
  {
    id: "code",
    label: "代码模式",
    description: "保留缩进和换行结构，区分大小写，适合代码库查重",
    icon: "Code",
    config: {
      extensions: [
        "ts",
        "tsx",
        "js",
        "jsx",
        "vue",
        "py",
        "rs",
        "go",
        "java",
        "c",
        "cpp",
        "h",
        "hpp",
        "cs",
        "rb",
        "php",
        "swift",
        "kt",
        "json",
        "yaml",
        "yml",
        "toml",
        "xml",
        "html",
        "css",
        "scss",
        "sql",
        "sh",
        "bash",
        "ps1",
        "bat",
        "cmd",
      ],
      sizeDiffThreshold: 0.05,
      normalizeOptions: {
        ignoreWhitespace: false,
        ignorePunctuation: false,
        caseSensitive: true,
        preserveLineBreaks: true,
      },
    },
  },
  {
    id: "document",
    label: "文档模式",
    description: "针对 Markdown/TXT 等文档，忽略格式差异",
    icon: "BookOpen",
    config: {
      extensions: ["md", "txt", "rst", "adoc", "org", "tex", "csv", "log"],
      sizeDiffThreshold: 0.1,
      normalizeOptions: {
        ignoreWhitespace: true,
        ignorePunctuation: false,
        caseSensitive: false,
        preserveLineBreaks: false,
      },
    },
  },
];

/** 根据预设 ID 获取完整配置 */
export function getConfigFromPreset(presetId: string): SimilarityConfig {
  const preset = PRESETS.find((p) => p.id === presetId);
  if (!preset) return { ...DEFAULT_CONFIG };

  return {
    ...DEFAULT_CONFIG,
    ...preset.config,
    preset: presetId,
    normalizeOptions: {
      ...DEFAULT_CONFIG.normalizeOptions,
      ...preset.config.normalizeOptions,
    },
  };
}
