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

import MarkdownIt from "markdown-it";
import { normalizeHtml } from "./semantics";
import type { ReferenceComparison, ReferenceOutput } from "./report";

/** Keep reference HTML parsing inert, and use the same semantic adapter as official HTML. */
export function createReference(fragment: (html: string) => DocumentFragment) {
  const commonmark = new MarkdownIt("commonmark", { breaks: false });
  const project = new MarkdownIt("commonmark", { breaks: true });
  const extensions = new MarkdownIt("commonmark", { breaks: true }).enable([
    "table",
    "strikethrough",
  ]);
  function render(parser: MarkdownIt, input: string): ReferenceOutput {
    const html = parser.render(input);
    return { html, semantics: normalizeHtml(fragment(html)) };
  }
  return {
    compare(input: string): ReferenceComparison {
      return {
        commonmark: render(commonmark, input),
        project: render(project, input),
      };
    },
    extensions(input: string) {
      return render(extensions, input);
    },
  };
}
