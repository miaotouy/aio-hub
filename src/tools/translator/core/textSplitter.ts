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

export interface RecursiveSplitTextOptions {
  chunkSize: number;
  separators?: string[];
}

export const DEFAULT_TEXT_SPLIT_SEPARATORS = [
  "\n\n",
  "\n",
  "。",
  "！",
  "？",
  "；",
  ". ",
  "! ",
  "? ",
  "; ",
  " ",
  "",
];

function charLength(value: string) {
  return Array.from(value).length;
}

function sliceByChars(value: string, chunkSize: number) {
  const chars = Array.from(value);
  const chunks: string[] = [];
  for (let index = 0; index < chars.length; index += chunkSize) {
    chunks.push(chars.slice(index, index + chunkSize).join(""));
  }
  return chunks;
}

function splitKeepingSeparator(value: string, separator: string) {
  if (!separator) return Array.from(value);

  const parts: string[] = [];
  let cursor = 0;
  while (cursor < value.length) {
    const index = value.indexOf(separator, cursor);
    if (index === -1) {
      parts.push(value.slice(cursor));
      break;
    }
    const end = index + separator.length;
    parts.push(value.slice(cursor, end));
    cursor = end;
  }
  return parts.filter((part) => part.length > 0);
}

function splitRecursive(
  text: string,
  chunkSize: number,
  separators: string[],
  separatorIndex: number
): string[] {
  if (!text) return [];
  if (charLength(text) <= chunkSize) return [text];

  const separator = separators[separatorIndex] ?? "";
  if (separator === "") {
    return sliceByChars(text, chunkSize);
  }

  const parts = splitKeepingSeparator(text, separator);
  if (parts.length <= 1) {
    return splitRecursive(text, chunkSize, separators, separatorIndex + 1);
  }

  const chunks: string[] = [];
  let buffer = "";

  for (const part of parts) {
    if (charLength(part) > chunkSize) {
      if (buffer) {
        chunks.push(buffer);
        buffer = "";
      }
      chunks.push(
        ...splitRecursive(part, chunkSize, separators, separatorIndex + 1)
      );
      continue;
    }

    if (!buffer) {
      buffer = part;
      continue;
    }

    if (charLength(buffer + part) <= chunkSize) {
      buffer += part;
      continue;
    }

    chunks.push(buffer);
    buffer = part;
  }

  if (buffer) chunks.push(buffer);
  return chunks;
}

export function recursiveSplitText(
  text: string,
  options: RecursiveSplitTextOptions
): string[] {
  const chunkSize = Math.max(1, Math.floor(options.chunkSize));
  const separators = options.separators?.length
    ? options.separators
    : DEFAULT_TEXT_SPLIT_SEPARATORS;

  return splitRecursive(text, chunkSize, separators, 0).filter(
    (chunk) => chunk.length > 0
  );
}

export function estimateSplitChunkCount(
  text: string,
  options: RecursiveSplitTextOptions
) {
  return recursiveSplitText(text, options).length;
}

export function getTextCharLength(value: string) {
  return charLength(value);
}
