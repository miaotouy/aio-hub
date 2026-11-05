// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs/promises";
import { applicationPath, relativeApplicationPath } from "./application-path";
import { assetPath } from "./asset-store";
import { FileSecurity, type AgentFileSecurity } from "./file-security";
import { waitForOwnerOperation } from "../src/utils/waitForOwnerOperation";
import type { PipelineAttachment } from "../src/tools/llm-chat/types/pipeline-attachment";

const MAX_BYTES = 64 * 1024 * 1024;
export interface ContextAttachmentHost {
  root: string;
  getAssetRoot(): Promise<string>;
  getLocalSecurity(): Promise<AgentFileSecurity>;
}

/** Task-scoped immutable byte snapshots. Every local access rechecks current path policy. */
export class NodeContextAttachments {
  private snapshots = new Map<string, Promise<ArrayBuffer>>();
  private bytes = 0;
  private closed = false;
  constructor(
    private host: ContextAttachmentHost,
    private signal?: AbortSignal
  ) {}
  private check() {
    this.signal?.throwIfAborted();
    if (this.closed) throw new Error("上下文附件已释放");
  }
  async read(attachment: PipelineAttachment): Promise<ArrayBuffer> {
    this.check();
    const source = attachment.source;
    let file: string | undefined, security: FileSecurity | undefined;
    if (source.kind === "local-file") {
      const config = await waitForOwnerOperation(
        () => this.host.getLocalSecurity(),
        this.signal
      );
      security = new FileSecurity({
        ...config,
        maxFileSize: Math.min(config.maxFileSize ?? MAX_BYTES, MAX_BYTES),
        approvalGranted: source.approvalGranted === true,
      });
      file = source.path;
      await waitForOwnerOperation(
        () => security!.ensurePath(file!),
        this.signal
      );
    } else if (source.kind === "asset-library") {
      file = await waitForOwnerOperation(
        async () => assetPath(await this.host.getAssetRoot(), source.path),
        this.signal
      );
    } else if (source.kind === "agent-private") {
      const id = relativeApplicationPath(source.agentId);
      if (id.includes("/")) throw new Error("智能体标识无效");
      file = await applicationPath(
        this.host.root,
        `agent-manager/agents/${id}/${relativeApplicationPath(source.relativePath.replaceAll("\\", "/"))}`
      );
    }
    this.check();
    const key = JSON.stringify(source);
    let pending = this.snapshots.get(key);
    if (!pending) {
      pending = (async () => {
        let data: Uint8Array;
        if (source.kind === "message-text") {
          if (source.text.length > MAX_BYTES)
            throw new Error("正文附件超过 64 MiB");
          data = new TextEncoder().encode(source.text);
        } else if (source.kind === "inline") {
          if (
            source.base64.length > Math.ceil(MAX_BYTES / 3) * 4 ||
            !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
              source.base64
            )
          )
            throw new Error("附件 Base64 数据无效或过大");
          data = Buffer.from(source.base64, "base64");
        } else if (security) data = await security.readBytes(file!);
        else {
          const handle = await fs.open(file!, "r");
          try {
            const stat = await handle.stat();
            if (!stat.isFile() || stat.size > MAX_BYTES)
              throw new Error("附件需为 64 MiB 内的普通文件");
            data = await handle.readFile();
          } finally {
            await handle.close();
          }
        }
        this.check();
        if (
          data.byteLength > MAX_BYTES ||
          this.bytes + data.byteLength > MAX_BYTES
        )
          throw new Error("上下文附件总量超过 64 MiB，请减少附件");
        this.bytes += data.byteLength;
        const snapshot = new ArrayBuffer(data.byteLength);
        new Uint8Array(snapshot).set(data);
        return snapshot;
      })();
      this.snapshots.set(key, pending);
      void pending.catch(() => {
        if (this.snapshots.get(key) === pending) this.snapshots.delete(key);
      });
    }
    const snapshot = await waitForOwnerOperation(() => pending!, this.signal);
    this.check();
    // Cached bytes are immutable, but the current policy may have tightened since the first read.
    security?.ensureSize(snapshot.byteLength);
    return snapshot;
  }
  dispose() {
    this.closed = true;
    this.snapshots.clear();
    this.bytes = 0;
  }
}
