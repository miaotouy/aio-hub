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

import { LanguageSupport, StreamLanguage } from "@codemirror/language";

export interface LanguageDefinition {
  id: string;
  aliases: string[];
  monaco: string;
  codemirror: () => Promise<LanguageSupport | null>;
}

// 用于通过别名快速查找的 Map。
const languageAliasMap = new Map<string, LanguageDefinition>();

const languages: LanguageDefinition[] = [
  {
    id: "javascript",
    aliases: ["js", "jsx"],
    monaco: "javascript",
    codemirror: async () => {
      const { javascript } = await import("@codemirror/lang-javascript");
      return javascript({ jsx: true });
    },
  },
  {
    id: "typescript",
    aliases: ["ts", "tsx"],
    monaco: "typescript",
    codemirror: async () => {
      const { javascript } = await import("@codemirror/lang-javascript");
      return javascript({ jsx: true, typescript: true });
    },
  },
  {
    id: "python",
    aliases: ["py"],
    monaco: "python",
    codemirror: async () => {
      const { python } = await import("@codemirror/lang-python");
      return python();
    },
  },
  {
    id: "shell",
    aliases: ["sh", "bash", "zsh", "shell"],
    monaco: "shell",
    codemirror: async () => {
      const { shell } = await import("@codemirror/legacy-modes/mode/shell");
      return new LanguageSupport(StreamLanguage.define(shell));
    },
  },
  {
    id: "yaml",
    aliases: ["yml", "yaml"],
    monaco: "yaml",
    codemirror: async () => {
      const { yaml } = await import("@codemirror/lang-yaml");
      return yaml();
    },
  },
  {
    id: "json",
    aliases: ["json"],
    monaco: "json",
    codemirror: async () => {
      const { json } = await import("@codemirror/lang-json");
      return json();
    },
  },
  {
    id: "html",
    aliases: ["html"],
    monaco: "html",
    codemirror: async () => {
      const { html } = await import("@codemirror/lang-html");
      return html();
    },
  },
  {
    id: "css",
    aliases: ["css"],
    monaco: "css",
    codemirror: async () => {
      const { css } = await import("@codemirror/lang-css");
      return css();
    },
  },
  {
    id: "scss",
    aliases: ["scss"],
    monaco: "scss",
    codemirror: async () => {
      const { sass } = await import("@codemirror/lang-sass");
      return sass({ indented: false });
    },
  },
  {
    id: "rust",
    aliases: ["rs"],
    monaco: "rust",
    codemirror: async () => {
      const { rust } = await import("@codemirror/lang-rust");
      return rust();
    },
  },
  {
    id: "go",
    aliases: ["go"],
    monaco: "go",
    codemirror: async () => {
      const { go } = await import("@codemirror/lang-go");
      return go();
    },
  },
  {
    id: "cpp",
    aliases: ["cpp", "cxx"],
    monaco: "cpp",
    codemirror: async () => {
      const { cpp } = await import("@codemirror/lang-cpp");
      return cpp();
    },
  },
  {
    id: "c",
    aliases: ["c"],
    monaco: "c",
    codemirror: async () => {
      const { c } = await import("@codemirror/legacy-modes/mode/clike");
      return new LanguageSupport(StreamLanguage.define(c));
    },
  },
  {
    id: "csharp",
    aliases: ["csharp", "cs"],
    monaco: "csharp",
    codemirror: async () => {
      const { csharp } = await import("@replit/codemirror-lang-csharp");
      return csharp();
    },
  },
  {
    id: "java",
    aliases: ["java"],
    monaco: "java",
    codemirror: async () => {
      const { java } = await import("@codemirror/lang-java");
      return java();
    },
  },
  {
    id: "php",
    aliases: ["php"],
    monaco: "php",
    codemirror: async () => {
      const { php } = await import("@codemirror/lang-php");
      return php();
    },
  },
  {
    id: "ruby",
    aliases: ["rb", "ruby"],
    monaco: "ruby",
    codemirror: async () => {
      const { ruby } = await import("@codemirror/legacy-modes/mode/ruby");
      return new LanguageSupport(StreamLanguage.define(ruby));
    },
  },
  {
    id: "toml",
    aliases: ["toml"],
    monaco: "toml",
    codemirror: async () => {
      const { toml } = await import("@codemirror/legacy-modes/mode/toml");
      return new LanguageSupport(StreamLanguage.define(toml));
    },
  },
  {
    id: "lua",
    aliases: ["lua"],
    monaco: "lua",
    codemirror: async () => {
      const { lua } = await import("@codemirror/legacy-modes/mode/lua");
      return new LanguageSupport(StreamLanguage.define(lua));
    },
  },
  {
    id: "powershell",
    aliases: ["ps1", "pwsh", "powershell"],
    monaco: "powershell",
    codemirror: async () => {
      const { powerShell } =
        await import("@codemirror/legacy-modes/mode/powershell");
      return new LanguageSupport(StreamLanguage.define(powerShell));
    },
  },
  {
    id: "diff",
    aliases: ["diff", "patch"],
    monaco: "diff",
    codemirror: async () => {
      const { diff } = await import("@codemirror/legacy-modes/mode/diff");
      return new LanguageSupport(StreamLanguage.define(diff));
    },
  },
  {
    id: "ini",
    aliases: ["ini", "properties", "conf"],
    monaco: "ini",
    codemirror: async () => {
      const { properties } =
        await import("@codemirror/legacy-modes/mode/properties");
      return new LanguageSupport(StreamLanguage.define(properties));
    },
  },
  {
    id: "swift",
    aliases: ["swift"],
    monaco: "swift",
    codemirror: async () => {
      // 未找到 codemirror-lang-swift，回退到纯文本
      return null;
    },
  },
  {
    id: "kotlin",
    aliases: ["kt", "kotlin"],
    monaco: "kotlin",
    codemirror: async () => {
      const { java } = await import("@codemirror/lang-java");
      return java();
    },
  },
  {
    id: "dockerfile",
    aliases: ["dockerfile", "Dockerfile"],
    monaco: "dockerfile",
    codemirror: async () => {
      const { dockerFile } =
        await import("@codemirror/legacy-modes/mode/dockerfile");
      return new LanguageSupport(StreamLanguage.define(dockerFile));
    },
  },
  {
    id: "markdown",
    aliases: ["md", "markdown"],
    monaco: "markdown",
    codemirror: async () => {
      const { markdown } = await import("@codemirror/lang-markdown");
      return markdown();
    },
  },
  {
    id: "xml",
    aliases: ["xml"],
    monaco: "xml",
    codemirror: async () => {
      const { xml } = await import("@codemirror/lang-xml");
      return xml();
    },
  },
  {
    id: "sql",
    aliases: ["sql"],
    monaco: "sql",
    codemirror: async () => {
      const { sql } = await import("@codemirror/lang-sql");
      return sql();
    },
  },
  {
    id: "vue",
    aliases: ["vue"],
    monaco: "vue",
    codemirror: async () => {
      const { vue } = await import("@codemirror/lang-vue");
      return vue();
    },
  },
  {
    id: "svelte",
    aliases: ["svelte"],
    monaco: "svelte",
    codemirror: async () => {
      const { svelte } = await import("@replit/codemirror-lang-svelte");
      return svelte();
    },
  },
];

// 填充 Map
languages.forEach((lang) => {
  languageAliasMap.set(lang.id, lang);
  lang.aliases.forEach((alias) => {
    languageAliasMap.set(alias.toLowerCase(), lang);
  });
});

export function getLanguageDefinition(
  langIdentifier?: string
): LanguageDefinition | undefined {
  if (!langIdentifier) return undefined;
  return languageAliasMap.get(langIdentifier.toLowerCase());
}

export function getMonacoLanguageId(langIdentifier?: string): string {
  const langDef = getLanguageDefinition(langIdentifier);
  return langDef ? langDef.monaco : langIdentifier || "plaintext";
}

export async function getCodeMirrorLanguage(
  langIdentifier?: string
): Promise<LanguageSupport | null> {
  const langDef = getLanguageDefinition(langIdentifier);
  if (langDef?.codemirror) {
    try {
      return await langDef.codemirror();
    } catch (e) {
      console.warn(
        `[codeLanguages] Failed to load CodeMirror language for "${langIdentifier}":`,
        e
      );
      return null;
    }
  }
  return null;
}
