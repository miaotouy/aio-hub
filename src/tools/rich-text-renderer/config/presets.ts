import { RenderPreset } from '../types';
import { basicPreset } from '../presets/basic';
import { codePreset } from '../presets/code';
import { longCodePreset } from '../presets/long-code';
import { tablePreset } from '../presets/table';
import { mixedPreset } from '../presets/mixed';
import { longPreset } from '../presets/long';
import { emojiPreset } from '../presets/emoji';
import { comprehensivePreset } from '../presets/comprehensive';
import { xmlPreset } from '../presets/xml';
import { v2ParserTestPreset } from '../presets/v2-parser-test';
import { agentBubbleTestPreset } from '../presets/agent-bubble-test';
import { mermaidDiagramsPreset } from '../presets/mermaid-diagrams';
import { llmThinkNodesPreset } from '../presets/llm-think-nodes';
import { katexFormulasPreset } from '../presets/katex-formulas';
import { quotesPreset } from '../presets/quotes';
import { themeVariableTest } from '../presets/theme-variable-test';
import { complexRenderingTestPreset } from '../presets/complex-rendering-test';
import { htmlScriptTestPreset } from '../presets/html-script-test';
import { htmlGameSnakePreset } from '../presets/html-game-snake';
import { indentedCodePreset } from '../presets/indented-code';
import { htmlNewlineTestPreset } from '../presets/html-newline-test';
import { mathjaxTestPreset } from '../presets/mathjax-test';
import { actionButtonTestPreset } from '../presets/action-button-test';

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
];
