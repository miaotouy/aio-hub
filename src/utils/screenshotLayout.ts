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

/**
 * 保留源窗口的布局精度，供 modern-screenshot 的 onCreateForeignObjectSvg 使用。
 *
 * foreignObject 作为图片解码时按 1× 排版。直接复制源窗口的小数 CSS 尺寸会在
 * 非整数 DPR 下再次量化，导致 fit-content 文本的尾字换行。先用源 DPR 进行
 * CSS zoom 排版，再以 viewBox 补偿，保持输出尺寸、字号和原有换行约束。
 */
export function createScreenshotLayoutFix(
  source: Element
): (svg: SVGSVGElement) => void {
  const view = source.ownerDocument.defaultView;
  let pixelRatio = view?.devicePixelRatio ?? 1;
  // 捕获根节点自己的 zoom 已由截图库复制，仅补偿截图边界外的祖先 zoom。
  for (
    let parent = source.parentElement;
    parent && view;
    parent = parent.parentElement
  ) {
    const zoom = view.getComputedStyle(parent).zoom;
    const factor = Number.parseFloat(zoom) / (zoom.endsWith("%") ? 100 : 1);
    if (Number.isFinite(factor) && factor > 0) pixelRatio *= factor;
  }

  return (svg) => {
    if (!Number.isFinite(pixelRatio) || pixelRatio <= 0 || pixelRatio === 1) {
      return;
    }

    const foreignObject = Array.from(svg.children).find(
      (child) => child.localName === "foreignObject"
    );
    const width = svg.width.baseVal.value;
    const height = svg.height.baseVal.value;
    if (!foreignObject || width <= 0 || height <= 0) return;

    const viewport = svg.ownerDocument.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div"
    );
    viewport.style.zoom = String(pixelRatio);
    viewport.style.width = `${width}px`;
    viewport.style.height = `${height}px`;
    while (foreignObject.firstChild) {
      viewport.appendChild(foreignObject.firstChild);
    }
    foreignObject.appendChild(viewport);
    svg.setAttribute(
      "viewBox",
      `0 0 ${width * pixelRatio} ${height * pixelRatio}`
    );
  };
}
