// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

/** Optional structural diagnostic, evaluated after the measured checkpoint.
 * Saves counts only. The cached chat root is weakly referenced, so the probe
 * cannot keep an otherwise collectable page alive. Category subtrees overlap.
 */
export function collectDomCensus() {
  const started = performance.now();
  const state = globalThis as typeof globalThis & {
    __aioMemoryDomRoot?: WeakRef<Element>;
  };
  const attached = document.querySelector(".message-list-container");
  if (attached) state.__aioMemoryDomRoot = new WeakRef(attached);
  const chat = attached ?? state.__aioMemoryDomRoot?.deref();
  function census(root: Node) {
    const sizes = new WeakMap<Node, number>();
    const tags: Record<string, number> = {};
    let elements = 0,
      textNodes = 0,
      textCharacters = 0,
      comments = 0;
    const nodes: Node[] = [root];
    // Iterative traversal handles long documents without recursive call-stack growth.
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      for (const child of node.childNodes) nodes.push(child);
      if (node.nodeType === 1) {
        elements++;
        const tag = (node as Element).tagName.toLowerCase();
        tags[tag] = (tags[tag] ?? 0) + 1;
      } else if (node.nodeType === 3) {
        textNodes++;
        textCharacters += node.nodeValue?.length ?? 0;
      } else if (node.nodeType === 8) comments++;
    }
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      let size = 1;
      for (const child of node.childNodes) size += sizes.get(child)!;
      sizes.set(node, size);
    }
    const queryRoot = root as Element;
    function group(selector: string) {
      const matches = Array.from(queryRoot.querySelectorAll(selector));
      if (root instanceof Element && root.matches(selector))
        matches.unshift(root);
      const set = new Set(matches);
      const outermost = matches.filter((node) => {
        for (
          let parent = node.parentElement;
          parent && parent !== root.parentNode;
          parent = parent.parentElement
        )
          if (set.has(parent)) return false;
        return true;
      });
      return {
        roots: matches.length,
        outermostRoots: outermost.length,
        inlineHiddenRoots: outermost.filter(
          (node) =>
            node instanceof HTMLElement &&
            (node.hidden || node.style.display === "none")
        ).length,
        nodes: outermost.reduce((n, node) => n + (sizes.get(node) ?? 0), 0),
      };
    }
    const selectors = {
      messages: ".message-slot",
      richText: ".rich-text-renderer",
      codeBlocks: ".markdown-code-block",
      codeHeaders: ".code-header",
      sourceFallbacks: ".pre-code-node",
      editors: ".cm-editor",
      tables: "table",
      lists: "ul,ol",
      reasoning: ".llm-think-node",
      diagrams: ".mermaid-node",
      iframes: "iframe",
      images: "img",
      sessionItems: ".session-item",
      agentsSidebar: ".agents-sidebar",
      sessionsSidebar: ".sessions-sidebar",
      svg: "svg",
      poppers: ".el-popper",
      dropdownMenus: ".el-dropdown-menu",
      overlays: ".el-overlay",
      messageMenus: ".message-menubar",
      tooltips: '[role="tooltip"]',
      allMenus: '[role="menu"]',
      textWrappers: ".markdown-text, .markdown-paragraph",
    };
    const messageRows = Array.from(
      queryRoot.querySelectorAll(".message-slot")
    ).map((node, index) => ({
      index,
      role: ["user", "assistant", "tool", "system"].includes(
        node.getAttribute("data-role") ?? ""
      )
        ? node.getAttribute("data-role")
        : "other",
      nodes: sizes.get(node) ?? 0,
      renderers: node.querySelectorAll(".rich-text-renderer").length,
      codeBlocks: node.querySelectorAll(".markdown-code-block").length,
      tables: node.querySelectorAll("table").length,
      listItems: node.querySelectorAll("li").length,
      textCharacters: node.textContent?.length ?? 0,
    }));
    // Vue internals are optional diagnostics; absent metadata is reported as unavailable.
    type Instance = {
      type?: { __name?: string; name?: string };
      parent?: Instance;
    };
    const components = new Set<Instance>();
    const componentNames: Record<string, number> = {};
    for (const node of nodes) {
      let instance = (node as Node & { __vueParentComponent?: Instance })
        .__vueParentComponent;
      while (instance && !components.has(instance)) {
        components.add(instance);
        const name =
          instance.type?.__name ?? instance.type?.name ?? "anonymous";
        componentNames[name] = (componentNames[name] ?? 0) + 1;
        instance = instance.parent;
      }
    }
    return {
      nodes: nodes.length,
      elements,
      textNodes,
      textCharacters,
      comments,
      tags: Object.entries(tags).sort((a, b) => b[1] - a[1]),
      groups: Object.fromEntries(
        Object.entries(selectors).map(([key, selector]) => [
          key,
          group(selector),
        ])
      ),
      messages: messageRows.sort((a, b) => b.nodes - a.nodes),
      componentMetadataAvailable: components.size > 0,
      componentLowerBound: components.size,
      componentNames: Object.entries(componentNames).sort(
        (a, b) => b[1] - a[1]
      ),
    };
  }
  const layout =
    attached?.closest(".llm-chat-wrapper") ??
    state.__aioMemoryDomRoot?.deref()?.closest(".llm-chat-wrapper");
  const result = {
    document: census(document),
    layout: layout ? census(layout) : null,
    chat: chat ? census(chat) : null,
    chatConnected: chat?.isConnected ?? false,
  };
  return { ...result, elapsedMs: performance.now() - started };
}
