import { invoke } from "@tauri-apps/api/core";
import { createModuleLogger } from "@/utils/logger";
import type {
  ExternalPlayerConfig,
  ExternalPlayerStatus,
  ExternalPlayerType,
} from "../types";

const logger = createModuleLogger("danmaku-player/externalPlayerApi");

export interface ExternalPlayerStatusProvider {
  readonly playerType: ExternalPlayerType;
  readonly lastError: string | null;
  setConfig(config: ExternalPlayerConfig): void;
  getStatus(targetHwnd?: number | null): Promise<ExternalPlayerStatus | null>;
  testConnection(targetHwnd?: number | null): Promise<boolean>;
}

export class TauriExternalPlayerStatusProvider implements ExternalPlayerStatusProvider {
  private config: ExternalPlayerConfig;
  private _lastError: string | null = null;

  constructor(config: ExternalPlayerConfig) {
    this.config = { ...config };
  }

  get playerType(): ExternalPlayerType {
    return this.config.playerType;
  }

  get lastError(): string | null {
    return this._lastError;
  }

  setConfig(config: ExternalPlayerConfig): void {
    this.config = { ...config };
    this._lastError = null;
  }

  async getStatus(
    targetHwnd?: number | null
  ): Promise<ExternalPlayerStatus | null> {
    try {
      const result = await invoke<ExternalPlayerStatus | null>(
        "get_external_player_status",
        {
          playerType: this.config.playerType,
          port: this.config.webPort,
          hwnd: targetHwnd ?? null,
          mpvIpcPath: this.config.mpvIpcPath || null,
          vlcPassword: this.config.vlcPassword || null,
        }
      );

      if (result === null) {
        this._lastError = "无法获取外部播放器状态";
        return null;
      }

      this._lastError = null;
      return result;
    } catch (err) {
      const message = String(err);
      this._lastError = message;
      logger.warn("外部播放器状态获取失败", {
        playerType: this.config.playerType,
        port: this.config.webPort,
        hwnd: targetHwnd ?? null,
        error: message,
      });
      return null;
    }
  }

  async testConnection(targetHwnd?: number | null): Promise<boolean> {
    const status = await this.getStatus(targetHwnd);
    return status !== null;
  }
}
