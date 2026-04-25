import { invoke } from "@tauri-apps/api/core";
import { createModuleLogger } from "@/utils/logger";
import type { MpcBeStatus } from "../types";

const logger = createModuleLogger("danmaku-player/mpcBeApi");

/**
 * MPC-BE Web Interface API 客户端
 *
 * MPC-BE 内置 Web 接口，启用后可通过 HTTP 获取播放状态。
 * 请求由 Rust 后端代理发出（`get_mpc_be_status` 命令），规避 Tauri CSP scope 限制。
 *
 * MPC-BE /variables.html 返回 HTML，各字段通过 `<p id="KEY">VALUE</p>` 承载：
 * - file        : 文件名
 * - state       : 播放状态码 (0=Stopped, 1=Paused, 2=Playing)
 * - position    : 播放位置 (ms)
 * - duration    : 总时长 (ms)
 * - volumelevel : 音量 (0-100)
 *
 * Rust 层按 id 提取字段，不依赖行序。
 */
export class MpcBeClient {
  private port: number;
  private _lastError: string | null = null;

  constructor(port: number = 13579) {
    this.port = port;
  }

  get lastError(): string | null {
    return this._lastError;
  }

  /** 更新端口 */
  setPort(port: number): void {
    this.port = port;
    this._lastError = null;
  }

  /**
   * 获取 MPC-BE 当前播放状态。
   *
   * 通过 Tauri 命令让 Rust 后端发起 HTTP 请求，避免前端 fetch scope 限制。
   * 返回 null 表示未连接或 MPC-BE 未运行。
   */
  async getStatus(): Promise<MpcBeStatus | null> {
    try {
      const result = await invoke<{
        file: string;
        state: string;
        position: number;
        duration: number;
        volumeLevel: number;
      } | null>("get_mpc_be_status", { port: this.port });

      if (result === null) {
        this._lastError = "无法连接到 MPC-BE Web 接口";
        return null;
      }

      const state = result.state as MpcBeStatus["state"];

      this._lastError = null;
      return {
        file: result.file,
        state,
        position: result.position,
        duration: result.duration,
        volumeLevel: result.volumeLevel,
      };
    } catch (err) {
      const msg = String(err);
      this._lastError = msg;
      logger.warn("MPC-BE 状态获取失败", { port: this.port, error: msg });
      return null;
    }
  }

  /**
   * 测试连接是否正常
   */
  async testConnection(): Promise<boolean> {
    const status = await this.getStatus();
    return status !== null;
  }
}