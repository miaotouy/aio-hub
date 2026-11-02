// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import type { AstNode } from "../types";

interface ImageSubtree {
  images: string[];
  size: number;
}

/** Patch application replaces changed ancestors; unchanged subtrees share their image index. */
export function createAstImageIndex(maxNodes = 100000) {
  let cache = new WeakMap<AstNode, ImageSubtree>();
  return {
    collect(nodes: AstNode[]): { images: string[]; truncated: boolean } {
      let remaining = maxNodes;
      let truncated = false;
      const visit = (node: AstNode): ImageSubtree => {
        const cached = cache.get(node);
        if (cached && cached.size <= remaining) {
          remaining -= cached.size;
          return cached;
        }
        if (remaining <= 0) {
          truncated = true;
          return { images: [], size: 0 };
        }
        remaining--;
        const images: string[] = [];
        let size = 1;
        if (node.type === "image") images.push(node.props.src);
        for (const child of node.children ?? []) {
          const entry = visit(child);
          images.push(...entry.images);
          size += entry.size;
          if (truncated) break;
        }
        const entry = { images, size };
        // A partial result must never become a reusable subtree snapshot.
        if (!truncated) cache.set(node, entry);
        return entry;
      };
      const images: string[] = [];
      for (const node of nodes) {
        images.push(...visit(node).images);
        if (truncated) break;
      }
      return { images, truncated };
    },
    clear() {
      cache = new WeakMap();
    },
  };
}
