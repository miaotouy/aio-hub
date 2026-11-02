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

export interface PlatformErrorDetails {
  command?: string;
  args?: unknown;
  cause?: unknown;
}

export class PlatformError extends Error {
  public readonly command?: string;
  public readonly args?: unknown;
  public readonly cause?: unknown;

  constructor(message: string, details?: PlatformErrorDetails) {
    super(message);
    this.name = "PlatformError";
    this.command = details?.command;
    this.args = details?.args;
    this.cause = details?.cause;

    // 维持原型链
    Object.setPrototypeOf(this, PlatformError.prototype);
  }
}
