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

import parseLinkDestination from "markdown-it/lib/helpers/parse_link_destination.mjs";
import parseLinkTitle from "markdown-it/lib/helpers/parse_link_title.mjs";
import {
  normalizeReference,
  unescapeAll,
} from "markdown-it/lib/common/utils.mjs";
import type { Token } from "../types";

export { normalizeReference };

// Decode only complete entities here. Escaped punctuation and raw/code tokens bypass this path.
export function decodeMarkdownEntities(text: string): string {
  return text.replace(
    /&(?:#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z][a-zA-Z0-9]{1,31});/g,
    (entity) => {
      const decoded = unescapeAll(entity);
      return decoded === entity && entity.startsWith("&#") ? "\uFFFD" : decoded;
    }
  );
}

export function readReferenceDefinition(
  text: string,
  start: number
): {
  token: Extract<Token, { type: "reference_definition" }>;
  end: number;
} | null {
  const head = /^\[((?:\\.|[^\]\\\n]){1,999})\]:[ \t]*(?:\n[ \t]*)?/.exec(
    text.slice(start)
  );
  // Footnote syntax belongs to the extension layer; keep its definitions visible for now.
  if (!head || head[1].startsWith("^")) return null;
  const label = normalizeReference(head[1]);
  if (!label) return null;
  const destinationStart = start + head[0].length;
  const destination = parseLinkDestination(text, destinationStart, text.length);
  if (!destination.ok) return null;
  const href = destination.str;
  // Reject executable targets; retain other project-specific URL schemes.
  if (
    /^(?:javascript|vbscript|file|data):/i.test(
      href.replace(/[\x00-\x20]/g, "")
    )
  )
    return null;
  const lineEndAt = text.indexOf("\n", destination.pos);
  const lineEnd = lineEndAt < 0 ? text.length : lineEndAt;
  const tail = text.slice(destination.pos, lineEnd);
  let pos = destination.pos;
  while (pos < text.length && /[ \t]/.test(text[pos])) pos++;
  if (text[pos] === "\n" && /^[ \t]*$/.test(tail)) {
    pos++;
    while (pos < text.length && /[ \t]/.test(text[pos])) pos++;
  }
  // Most titles close on their opening line. Scan later lines only for continuation;
  // otherwise each definition would search the entire remaining document for a blank line.
  const titleLineEndAt = text.indexOf("\n", pos);
  const titleLineEnd = titleLineEndAt < 0 ? text.length : titleLineEndAt;
  let title =
    pos > destination.pos ? parseLinkTitle(text, pos, titleLineEnd) : null;
  if (title?.can_continue && titleLineEnd < text.length) {
    const blank = /\n[ \t]*\n/g;
    blank.lastIndex = destination.pos;
    const max = blank.exec(text)?.index ?? text.length;
    title = parseLinkTitle(text, pos, max);
  }
  if (title?.ok) {
    let end = title.pos;
    while (end < text.length && /[ \t]/.test(text[end])) end++;
    if (end === text.length || text[end] === "\n") {
      return {
        token: { type: "reference_definition", label, href, title: title.str },
        end,
      };
    }
  }
  if (!/^[ \t]*$/.test(tail)) return null;
  return {
    token: { type: "reference_definition", label, href, title: "" },
    end: lineEnd,
  };
}
