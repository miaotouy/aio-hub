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

export type MinimaxMusicModel =
  | "music-2.6"
  | "music-cover"
  | "music-2.6-free"
  | "music-cover-free";

export type MinimaxMusicOutputFormat = "url" | "hex";

export interface MinimaxBaseResp {
  status_code?: number;
  status_msg?: string;
}

export interface MinimaxClientConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
  signal?: AbortSignal;
  requestId?: string;
  customHeaders?: Record<string, string>;
  forceProxy?: boolean;
  relaxIdCerts?: boolean;
  http1Only?: boolean;
}

export interface MinimaxLyricsRequest {
  mode: "write_full_song" | "edit";
  prompt?: string;
  lyrics?: string;
  title?: string;
}

export interface MinimaxLyricsResponse {
  song_title?: string;
  style_tags?: string;
  lyrics?: string;
  base_resp?: MinimaxBaseResp;
}

export interface MinimaxAudioSetting {
  sample_rate?: 16000 | 24000 | 32000 | 44100;
  bitrate?: 32000 | 64000 | 128000 | 256000;
  format?: "mp3" | "wav" | "pcm";
}

export interface MinimaxMusicRequest {
  model: MinimaxMusicModel;
  prompt?: string;
  lyrics?: string;
  stream?: boolean;
  output_format?: MinimaxMusicOutputFormat;
  audio_setting?: MinimaxAudioSetting;
  aigc_watermark?: boolean;
  lyrics_optimizer?: boolean;
  is_instrumental?: boolean;
  audio_url?: string;
  audio_base64?: string;
  cover_feature_id?: string;
}

export interface CoverPreprocessRequest {
  model: Extract<MinimaxMusicModel, "music-cover" | "music-cover-free">;
  audio_url?: string;
  audio_base64?: string;
}

export interface CoverPreprocessResponse {
  cover_feature_id?: string;
  formatted_lyrics?: string;
  structure_result?: string;
  audio_duration?: number;
  trace_id?: string;
  base_resp?: MinimaxBaseResp;
}

export interface MinimaxMusicData {
  status?: number;
  audio?: string;
  audio_url?: string;
}

export interface MinimaxMusicExtraInfo {
  music_duration?: number;
  music_sample_rate?: number;
  music_channel?: number;
  bitrate?: number;
  music_size?: number;
}

export interface MinimaxMusicResponse {
  data?: MinimaxMusicData;
  trace_id?: string;
  extra_info?: MinimaxMusicExtraInfo;
  analysis_info?: unknown;
  base_resp?: MinimaxBaseResp;
}
