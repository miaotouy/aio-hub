// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { htmlScriptTestPreset } from "../../src/tools/rich-text-renderer/presets/html-script-test";
import { htmlGameSnakePreset } from "../../src/tools/rich-text-renderer/presets/html-game-snake";

/** Decoded-text fixtures for native chat/iframe replay, independent of private conversations. */
export interface EmbeddedPreviewCase {
  id: string;
  origin: "existing-preset" | "synthetic";
  source: string;
  targets: string[];
  markdown: string;
}

function page(title: string, body: string, script: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font:16px/1.5 sans-serif;color:var(--text-color);background:var(--bg-color)}
main{padding:20px;min-height:160px}button,input{font:inherit}canvas{max-width:100%}</style>
</head><body><main>${body}</main><script>${script}</script></body></html>`;
}

export function fencedPreview(content: string, language = "html"): string {
  return `\`\`\`${language}\n${content}\n\`\`\`\n`;
}

const form = page(
  "流式表单与交互状态",
  `<h2>中文与 emoji 🌿</h2><form onsubmit="return false"><label>备注 <input id="note" value="初始内容"></label>
<button id="increment" type="button">增加</button><output id="count">0</output></form>
<p id="final-marker">FINAL_FORM</p>`,
  `let count=0;document.querySelector('#increment').onclick=()=>document.querySelector('#count').textContent=String(++count);
window.parent.postMessage({type:'preview-fixture-ready',id:'form'},'*');`
);

const canvas = page(
  "Canvas 与尺寸变化",
  `<button id="resize">切换尺寸</button><canvas id="plot" width="480" height="180"></canvas>
<div id="extension" style="height:0px"></div><p id="final-marker">FINAL_CANVAS</p>`,
  `const canvas=document.querySelector('#plot'),ctx=canvas.getContext('2d');let ticks=0,large=false;
function draw(){ctx.clearRect(0,0,480,180);ctx.fillStyle='#3488cc';ctx.fillRect(10,10,80+(ticks%160),100);ticks++;requestAnimationFrame(draw)}draw();
document.querySelector('#resize').onclick=()=>{large=!large;document.querySelector('#extension').style.height=large?'360px':'0px'};
setInterval(()=>window.parent.postMessage({type:'preview-fixture-tick',id:'canvas',ticks},'*'),100);`
);

const asyncImage = page(
  "异步图片与主题布局",
  `<h2>延迟到达的本地图片</h2><img id="late-image" alt="本地生成的色块"><p id="final-marker">FINAL_IMAGE</p>`,
  `setTimeout(()=>{const canvas=document.createElement('canvas');canvas.width=240;canvas.height=320;
const ctx=canvas.getContext('2d');ctx.fillStyle='#56a277';ctx.fillRect(0,0,240,320);
document.querySelector('#late-image').src=canvas.toDataURL('image/png');},350);`
);

const incomplete = page(
  "脚本跨分片",
  `<p>${"脚本完整后初始化。".repeat(12)}</p><p id="final-marker">FINAL_SCRIPT</p>`,
  `window.parent.postMessage({type:'preview-fixture-executed',id:'script'},'*');
document.querySelector('#final-marker').dataset.executed='yes';`
);

export const embeddedPreviewCases: EmbeddedPreviewCase[] = [
  {
    id: "preset-html-script",
    origin: "existing-preset",
    source: "src/tools/rich-text-renderer/presets/html-script-test.ts",
    targets: ["inline-script", "counter", "styles"],
    markdown: htmlScriptTestPreset.content,
  },
  {
    id: "preset-canvas-snake",
    origin: "existing-preset",
    source: "src/tools/rich-text-renderer/presets/html-game-snake.ts",
    targets: ["canvas", "animation", "keyboard", "theme"],
    markdown: htmlGameSnakePreset.content,
  },
  {
    id: "html-form",
    origin: "synthetic",
    source: "embedded-preview-corpus",
    targets: ["form-state", "script-boundary", "unicode", "stream-tail"],
    markdown: fencedPreview(form),
  },
  {
    id: "html-canvas-resize",
    origin: "synthetic",
    source: "embedded-preview-corpus",
    targets: ["canvas", "animation", "height-feedback", "unmount-timers"],
    markdown: fencedPreview(canvas),
  },
  {
    id: "html-async-image",
    origin: "synthetic",
    source: "embedded-preview-corpus",
    targets: ["async-image", "height-feedback", "theme"],
    markdown: fencedPreview(asyncImage),
  },
  {
    id: "html-script-boundary",
    origin: "synthetic",
    source: "embedded-preview-corpus",
    targets: ["partial-script", "initial-fallback", "script-execution"],
    markdown: fencedPreview(incomplete),
  },
  {
    id: "svg-inline",
    origin: "synthetic",
    source: "embedded-preview-corpus",
    targets: ["svg", "partial-attribute", "viewbox", "unicode"],
    markdown: fencedPreview(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 160"><style>text{fill:var(--text-color,#222)}</style><rect width="480" height="160" fill="#83bbdd"/><text x="24" y="80">流式 SVG 🌿 FINAL_SVG</text></svg>`,
      "svg"
    ),
  },
  {
    id: "mermaid-image-mixed",
    origin: "synthetic",
    source: "embedded-preview-corpus",
    targets: ["mermaid-recovery", "markdown-image", "mixed-height"],
    markdown:
      "# 图表与图片\n\n```mermaid\nflowchart TD\n A[输入] --> B{检查}\n B -->|完成| C[展示]\n B -->|继续| A\n```\n\n![本地色块](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOI7TUGAAJoAR5npGjbAAAAAElFTkSuQmCC)\n\nFINAL_MIXED\n",
  },
];
