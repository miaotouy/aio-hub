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

import type * as monaco from "monaco-editor";

/**
 * 编辑器装饰器配置
 */
export interface EditorDecoration {
  range: monaco.IRange;
  options: monaco.editor.IModelDecorationOptions;
}

/**
 * 静态错误（来自 Monaco Markers）
 */
export interface StaticError {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  message: string;
  severity: "error" | "warning" | "info";
  source: "monaco" | "lsp" | "oxlint";
}

/**
 * 编辑器状态快照（用于 Diff 预览）
 */
export interface EditorSnapshot {
  content: string;
  cursorPosition: monaco.Position;
  scrollPosition: { scrollTop: number; scrollLeft: number };
}

/**
 * Canvas Monaco Editor Props
 */
export interface CanvasMonacoEditorProps {
  /** 文件路径（用于生成 Model URI） */
  filepath: string;
  /** 编辑器内容 */
  modelValue: string;
  /** 语言标识符 */
  language: string;
  /** 是否只读 */
  readonly?: boolean;
  /** 自定义编辑器选项 */
  options?: monaco.editor.IStandaloneEditorConstructionOptions;
  /** Canvas ID（用于多画布场景的 URI 隔离） */
  canvasId?: string;
}

/**
 * Canvas Monaco Editor Emits
 */
export interface CanvasMonacoEditorEmits {
  /** 内容变化 */
  (e: "update:modelValue", value: string): void;
  /** Markers 变化（静态错误） */
  (e: "markersChange", markers: monaco.editor.IMarker[]): void;
  /** 光标位置变化 */
  (e: "cursorPositionChange", position: monaco.Position): void;
  /** 编辑器挂载完成 */
  (e: "editorReady", editor: monaco.editor.IStandaloneCodeEditor): void;
}
