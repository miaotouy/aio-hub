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

import { RenderPreset } from "../types";
import { basicPreset } from "../presets/basic";
import { codePreset } from "../presets/code";
import { longCodePreset } from "../presets/long-code";
import { tablePreset } from "../presets/table";
import { mixedPreset } from "../presets/mixed";
import { longPreset } from "../presets/long";
import { emojiPreset } from "../presets/emoji";
import { comprehensivePreset } from "../presets/comprehensive";
import { xmlPreset } from "../presets/xml";
import { v2ParserTestPreset } from "../presets/v2-parser-test";
import { agentBubbleTestPreset } from "../presets/agent-bubble-test";
import { mermaidDiagramsPreset } from "../presets/mermaid-diagrams";
import { llmThinkNodesPreset } from "../presets/llm-think-nodes";
import { katexFormulasPreset } from "../presets/katex-formulas";
import { quotesPreset } from "../presets/quotes";
import { themeVariableTest } from "../presets/theme-variable-test";
import { complexRenderingTestPreset } from "../presets/complex-rendering-test";
import { htmlScriptTestPreset } from "../presets/html-script-test";
import { htmlGameSnakePreset } from "../presets/html-game-snake";
import { indentedCodePreset } from "../presets/indented-code";
import { htmlNewlineTestPreset } from "../presets/html-newline-test";
import { mathjaxTestPreset } from "../presets/mathjax-test";
import { actionButtonTestPreset } from "../presets/action-button-test";
import { advancedMixedTestPreset } from "../presets/advanced-mixed-test";
import { styleIsolationTestPreset } from "../presets/style-isolation-test";
import { detailsPreset } from "../presets/details";

export const presets: RenderPreset[] = [
  basicPreset,
  codePreset,
  longCodePreset,
  tablePreset,
  mixedPreset,
  longPreset,
  emojiPreset,
  comprehensivePreset,
  xmlPreset,
  v2ParserTestPreset,
  agentBubbleTestPreset,
  mermaidDiagramsPreset,
  llmThinkNodesPreset,
  katexFormulasPreset,
  mathjaxTestPreset,
  quotesPreset,
  themeVariableTest,
  complexRenderingTestPreset,
  htmlScriptTestPreset,
  htmlGameSnakePreset,
  indentedCodePreset,
  htmlNewlineTestPreset,
  actionButtonTestPreset,
  advancedMixedTestPreset,
  styleIsolationTestPreset,
  detailsPreset,
];
