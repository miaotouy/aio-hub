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

export interface CommandDefinition<TArgs = void, TReturn = void> {
  args: TArgs;
  return: TReturn;
}

/**
 * 后端命令强类型映射字典 (CommandMap)
 * 键名必须与 Rust src-tauri/src/commands.rs 中注册的命令名称严格一致。
 */
export interface CommandMap {
  // === 窗口控制与特效 ===
  save_window_config: CommandDefinition<{ label: string }, void>;
  apply_window_config: CommandDefinition<{ window: unknown }, boolean>;
  clear_all_window_configs: CommandDefinition<void, void>;
  delete_window_config: CommandDefinition<{ label: string }, void>;
  get_saved_window_labels: CommandDefinition<void, string[]>;
  close_detached_window: CommandDefinition<{ label: string }, void>;
  create_tool_window: CommandDefinition<{ config: unknown }, string>;
  focus_window: CommandDefinition<{ label: string }, void>;
  ensure_window_visible: CommandDefinition<{ label: string }, boolean>;
  apply_window_effect: CommandDefinition<{ effect: string }, void>;
  set_window_shadow: CommandDefinition<{ show: boolean }, void>;
  navigate_main_window_to_settings: CommandDefinition<{ sectionId: string }, void>;

  // === 路径与文件系统 (Force / AppData) ===
  get_app_config_dir: CommandDefinition<void, string>;
  path_exists: CommandDefinition<{ path: string }, boolean>;
  is_directory: CommandDefinition<{ path: string }, boolean>;
  read_text_file_force: CommandDefinition<{ path: string }, string>;
  write_text_file_force: CommandDefinition<{ path: string; content: string }, void>;
  read_file_binary: CommandDefinition<{ path: string }, number[]>;
  write_file_force: CommandDefinition<{ path: string; content: number[] }, void>;
  append_file_force: CommandDefinition<{ path: string; content: string }, void>;
  create_dir_force: CommandDefinition<{ path: string }, void>;
  delete_file_to_trash: CommandDefinition<{ filePath: string }, void>;
  delete_directory_in_app_data: CommandDefinition<{ relativePath: string }, void>;
  copy_file_to_app_data: CommandDefinition<{ sourcePath: string; subdirectory: string; newFilename?: string }, string>;
  list_directory: CommandDefinition<{ path: string }, string[]>;
  open_file_directory: CommandDefinition<{ filePath: string }, void>;
  resolve_path_for_security: CommandDefinition<{ path: string }, unknown>;

  // === 系统与运维 ===
  exit_app: CommandDefinition<void, void>;
  set_show_tray_icon: CommandDefinition<{ show: boolean }, void>;
  update_tray_setting: CommandDefinition<{ enabled?: boolean; minimizeToTray?: boolean }, void>;
  open_url: CommandDefinition<{ url: string }, void>;
  get_local_ips: CommandDefinition<void, string[]>;
  append_app_log: CommandDefinition<{ level: string; target: string; message: string }, unknown>;

  // === 资产与媒体 ===
  get_asset_base_path: CommandDefinition<void, string>;
  list_all_assets: CommandDefinition<void, unknown[]>;
  remove_asset_completely: CommandDefinition<{ assetId: string }, void>;
  check_ffmpeg_availability: CommandDefinition<void, boolean>;
  get_system_fonts: CommandDefinition<void, string[]>;
  list_directory_images: CommandDefinition<{ dirPath: string }, string[]>;

  // === LLM 代理与搜索 ===
  start_llm_proxy_server: CommandDefinition<{ port?: number; certificateMode?: string }, { port: number }>;
  stop_llm_proxy_server: CommandDefinition<void, void>;

  // === 窗口拖拽交互 (rdev) ===
  start_drag_session: CommandDefinition<{ targetPosition?: [number, number] }, void>;
  end_drag_session: CommandDefinition<void, boolean>;

  // === 探针与后台运行时 ===
  background_runtime_ready: CommandDefinition<void, unknown>;
  background_runtime_heartbeat: CommandDefinition<void, unknown>;
  background_runtime_get_status: CommandDefinition<void, { generation: number; alive: boolean }>;
  frontend_probe_ready: CommandDefinition<void, unknown>;
  frontend_probe_heartbeat: CommandDefinition<void, unknown>;
}

/** 已经由 CommandMap 强类型约束的已知命令名 */
export type KnownCommand = keyof CommandMap;
