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

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { parse } from "vue/compiler-sfc";

const violations: string[] = [];

function collectFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
    } else if (/\.(?:js|jsx|ts|tsx|vue)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function checkSource(source: string, filePath: string, startLine = 0): void {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true
  );

  function checkSpecifier(node: ts.Node): void {
    if (
      !ts.isStringLiteralLike(node) ||
      !node.text.startsWith("@tauri-apps/")
    ) {
      return;
    }

    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    violations.push(`${filePath}:${startLine + line + 1} ${node.text}`);
  }

  function visit(node: ts.Node): void {
    const runtimeSource =
      !filePath.replaceAll("\\", "/").startsWith("src/platform/") &&
      !/(?:\.test\.|__tests__)/.test(filePath);
    if (runtimeSource && ts.isPropertyAccessExpression(node)) {
      const browserAccess =
        ts.isIdentifier(node.expression) &&
        ((node.expression.text === "navigator" &&
          node.name.text === "clipboard") ||
          (node.expression.text === "window" && node.name.text === "open"));
      const hostMarker = [
        "__TAURI_INTERNALS__",
        "__TAURI__",
        "__TAURI_METADATA__",
        "__ELECTRON__",
      ].includes(node.name.text);
      if (browserAccess || hostMarker) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(
          node.getStart()
        );
        violations.push(
          `${filePath}:${startLine + line + 1} ${node.getText()} must go through src/platform`
        );
      }
    }
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) checkSpecifier(node.moduleSpecifier);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument)
    ) {
      checkSpecifier(node.argument.literal);
    } else if (ts.isCallExpression(node)) {
      const firstArg = node.arguments[0];
      const expression = node.expression;
      const isMock =
        ts.isPropertyAccessExpression(expression) &&
        ["mock", "doMock", "unmock"].includes(expression.name.text);

      if (
        firstArg &&
        (expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(expression) && expression.text === "require") ||
          isMock)
      ) {
        checkSpecifier(firstArg);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

for (const filePath of collectFiles("src")) {
  const normalizedPath = filePath.replaceAll("\\", "/");
  if (normalizedPath.startsWith("src/platform/native/")) continue;

  const contents = fs.readFileSync(filePath, "utf8");
  if (filePath.endsWith(".vue")) {
    const { descriptor, errors } = parse(contents, { filename: filePath });
    if (errors.length) {
      throw new Error(`Failed to parse ${filePath}: ${errors.join(", ")}`);
    }
    for (const block of [descriptor.script, descriptor.scriptSetup]) {
      if (block) checkSource(block.content, filePath, block.loc.start.line - 1);
    }
  } else {
    checkSource(contents, filePath);
  }
}

if (violations.length) {
  console.error(
    "Desktop host access must stay inside src/platform; Tauri SDK imports belong in src/platform/native:"
  );
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Tauri SDK imports are isolated to src/platform/native.");
}
