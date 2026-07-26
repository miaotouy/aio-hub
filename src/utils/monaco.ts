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

import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import TypeScriptWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

interface MonacoEnvironmentConfig {
  getWorker(moduleId: string, label: string): Worker;
}

type MonacoGlobal = typeof globalThis & {
  MonacoEnvironment?: MonacoEnvironmentConfig;
};

const monacoGlobal = globalThis as MonacoGlobal;

monacoGlobal.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    if (label === "json") {
      return new JsonWorker();
    }

    if (label === "css" || label === "scss" || label === "less") {
      return new CssWorker();
    }

    if (label === "html" || label === "handlebars" || label === "razor") {
      return new HtmlWorker();
    }

    if (label === "typescript" || label === "javascript") {
      return new TypeScriptWorker();
    }

    return new EditorWorker();
  },
};

export * from "monaco-editor";
