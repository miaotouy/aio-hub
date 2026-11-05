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

import {
  runCapturedProcess,
  terminateProcessTree,
  type ProcessOptions,
} from "./process-runner";
export type DocumentProcessOptions = ProcessOptions;
export interface DocumentProcessOutput {
  stdout: string;
  stderr: string;
}
export type DocumentProcess = (
  executable: string,
  args: string[],
  options: DocumentProcessOptions
) => Promise<DocumentProcessOutput>;
export const terminateDocumentProcess = terminateProcessTree;
export const runDocumentProcess: DocumentProcess = async (
  executable,
  args,
  options
) => {
  const result = await runCapturedProcess(executable, args, options);
  if (result.exitCode !== 0)
    throw new Error(
      "文档转换程序执行失败: " +
        (result.stderr.trim() ||
          result.stdout.trim() ||
          "退出码 " + result.exitCode)
    );
  return { stdout: result.stdout.trim(), stderr: result.stderr.trim() };
};
