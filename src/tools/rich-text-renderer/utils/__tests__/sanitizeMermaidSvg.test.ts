// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { expect, it } from "vitest";
import { sanitizeMermaidSvg } from "../sanitizeMermaidSvg";

function parse(source: string) {
  const host = document.createElement("div");
  host.innerHTML = source;
  return host.querySelector("svg")!;
}

it("preserves themed shapes, local resources, rich labels and safe links", () => {
  const svg = parse(
    sanitizeMermaidSvg(`<svg xmlns="http://www.w3.org/2000/svg" id="diagram" viewBox="0 0 300 100">
    <style>#diagram {font-family:sans-serif} #diagram .edge {stroke:#456;marker-end:url(#arrow)} @keyframes dash {from{stroke-dashoffset:10}to{stroke-dashoffset:0}}</style>
    <defs><marker id="arrow"><path d="M0,0 L3,3"/></marker><linearGradient id="gradient"><stop offset="0%" stop-color="red"/></linearGradient></defs>
    <path class="edge" marker-end="url(#arrow)" style="stroke:red;fill:url(#gradient)" d="M0,0 L20,20"/>
    <foreignObject width="200" height="80"><div xmlns="http://www.w3.org/1999/xhtml"><b>Bold label</b><br/>second line</div></foreignObject>
    <a href="https://example.com" target="_blank" rel="opener"><text>Docs</text></a>
  </svg>`)
  );
  expect(svg.getAttribute("viewBox")).toBe("0 0 300 100");
  expect(svg.querySelector("marker path")?.getAttribute("d")).toBe("M0,0 L3,3");
  expect(svg.querySelector(".edge")?.getAttribute("marker-end")).toBe(
    "url(#arrow)"
  );
  expect((svg.querySelector(".edge") as SVGElement).style.stroke).toBe("red");
  expect(svg.querySelector("foreignObject b")?.textContent).toBe("Bold label");
  expect(svg.querySelector("foreignObject br")).not.toBeNull();
  expect(svg.querySelector("style")?.textContent).toContain("#arrow");
  expect(svg.querySelector("style")?.textContent).toContain("@keyframes dash");
  expect(svg.querySelector("a")?.getAttribute("href")).toBe(
    "https://example.com"
  );
  expect(svg.querySelector("a")?.getAttribute("rel")).toBe(
    "noopener noreferrer"
  );
});

// Exercise the actual SVG/HTML namespace boundary and CSS parser, with harmless payload text.
it("cleans executable markup and external CSS resources while keeping diagram content", () => {
  const clean =
    sanitizeMermaidSvg(String.raw`<svg xmlns="http://www.w3.org/2000/svg" id="bad" onload="alert(1)">
    <style>@import url("https://external.test/style.css");#bad{fill:u\72l("https://external.test/fill");stroke:#345}@font-face{font-family:evil;src:url("https://external.test/font")}</style>
    <script>alert(1)</script><foreignObject width="100" height="40"><div xmlns="http://www.w3.org/1999/xhtml"><b>kept label</b><img src="image.png" onerror="alert(1)"/><iframe srcdoc="bad"></iframe><form><input/></form><a href="javascript:alert(1)">label link</a></div></foreignObject>
    <use href="https://external.test/shape.svg#x"/><animate attributeName="href" values="javascript:alert(1)"/>
    <path d="M0,0 L10,10" fill="url(https://external.test/fill)" filter="url(#safe)" style="background-image:image-set(url(https://external.test/image) 1x);color:red"/>
    </svg><img src="x" onerror="alert(1)"/>`);
  const svg = parse(clean);
  expect(svg.querySelector("foreignObject b")?.textContent).toBe("kept label");
  expect(svg.querySelector("path")?.getAttribute("d")).toBe("M0,0 L10,10");
  expect(svg.querySelector("path")?.getAttribute("filter")).toBe("url(#safe)");
  expect(svg.querySelector("style")?.textContent).toContain("stroke");
  expect((svg.querySelector("path") as SVGElement).style.color).toBe("red");
  expect(
    svg.querySelector("script,iframe,form,input,animate,[onload],[onerror]")
  ).toBeNull();
  expect(svg.querySelector("a")?.getAttribute("href")).toBeNull();
  expect(clean).not.toContain("external.test");
  expect(svg.parentElement?.children).toHaveLength(1);
});
