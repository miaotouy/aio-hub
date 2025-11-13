/**
 * API 测试工具的状态管理
 */

import { defineStore } from "pinia";
import type { ApiPreset, RequestProfile, ApiResponse, HttpMethod, Variable } from "./types";
import { presets } from "./presets";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler, ErrorLevel } from "@utils/errorHandler";
import { customMessage } from "@utils/customMessage";

// 创建模块日志和错误处理器
const logger = createModuleLogger("api-tester/store");
const errorHandler = createModuleErrorHandler("api-tester/store");

interface ApiTesterState {
  // 当前选中的预设
  selectedPreset: ApiPreset | null;
  // URL 模板字符串
  urlTemplate: string;
  // HTTP 方法
  method: HttpMethod;
  // 当前变量值
  variables: Record<string, string | boolean>;
  // 自定义请求头
  customHeaders: Record<string, string>;
  // 请求体内容
  requestBody: string;
  // 最近的响应
  lastResponse: ApiResponse | null;
  // 是否正在发送请求
  isLoading: boolean;
  // 已保存的配置列表
  savedProfiles: RequestProfile[];
  // 用于中止请求的控制器
  abortController: AbortController | null;
}

export const useApiTesterStore = defineStore("apiTester", {
  state: (): ApiTesterState => ({
    selectedPreset: null,
    urlTemplate: "",
    method: "POST",
    variables: {},
    customHeaders: {},
    requestBody: "",
    lastResponse: null,
    isLoading: false,
    savedProfiles: [],
    abortController: null,
  }),

  getters: {
    // 获取所有可用预设
    availablePresets: () => presets,

    // 构建完整的 URL (替换模板中的变量)
    buildUrl: (state): string => {
      if (!state.urlTemplate) return "";

      let url = state.urlTemplate;

      // 替换所有 {{variable}} 占位符
      Object.entries(state.variables).forEach(([key, value]) => {
        const placeholder = `{{${key}}}`;
        url = url.replace(
          new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
          String(value)
        );
      });

      return url;
    },

    // 构建完整的请求头（包括预设和自定义）
    buildHeaders: (state): Record<string, string> => {
      const headers: Record<string, string> = {
        ...(state.selectedPreset?.headers || {}),
        ...state.customHeaders,
      };

      // 如果有 apiKey 变量，添加到 Authorization 头
      const apiKey = state.variables.apiKey as string;
      if (apiKey && state.selectedPreset) {
        // 根据不同的 API 类型设置不同的 Authorization 格式
        if (state.selectedPreset.id.startsWith("openai")) {
          headers["Authorization"] = `Bearer ${apiKey}`;
        } else if (state.selectedPreset.id === "anthropic-chat") {
          headers["x-api-key"] = apiKey;
        }
      }

      return headers;
    },

    // 构建请求体（替换变量）
    buildBody: (state): string => {
      if (!state.requestBody) return "";

      let body = state.requestBody;

      // 替换所有 {{variable}} 占位符
      Object.entries(state.variables).forEach(([key, value]) => {
        const placeholder = `{{${key}}}`;
        body = body.replace(new RegExp(placeholder, "g"), String(value));
      });

      return body;
    },

    // 获取当前配置的摘要信息
    currentProfileSummary: (state): Partial<RequestProfile> | null => {
      if (!state.selectedPreset) return null;

      return {
        selectedPresetId: state.selectedPreset.id,
        variables: { ...state.variables },
        headers: { ...state.customHeaders },
        body: state.requestBody,
      };
    },
  },

  actions: {
    // 选择预设
    selectPreset(presetId: string) {
      const preset = presets.find((p) => p.id === presetId);
      if (!preset) return;

      this.selectedPreset = preset;

      // 初始化 URL 模板
      this.urlTemplate = preset.urlTemplate;
      this.method = preset.method;

      // 初始化变量为预设的默认值
      this.variables = {};
      preset.variables.forEach((variable) => {
        this.variables[variable.key] = variable.value;
      });

      // 初始化请求头为预设的默认值
      this.customHeaders = { ...preset.headers };

      // 初始化请求体
      this.requestBody = preset.bodyTemplate || "";

      // 清空上次响应
      this.lastResponse = null;
    },

    // 更新 URL 模板
    updateUrlTemplate(template: string) {
      this.urlTemplate = template;
    },

    // 更新 HTTP 方法
    updateMethod(method: HttpMethod) {
      this.method = method;
    },

    // 添加变量
    addVariable(variable: {
      key: string;
      value: string | boolean;
      type: string;
      description?: string;
    }) {
      this.variables[variable.key] = variable.value;
    },

    // 删除变量
    removeVariable(key: string) {
      delete this.variables[key];
    },

    // 更新变量值
    updateVariable(key: string, value: string | boolean) {
      this.variables[key] = value;
    },

    // 批量更新变量
    updateVariables(variables: Record<string, string | boolean>) {
      this.variables = { ...this.variables, ...variables };
    },

    // --- 变量定义操作 ---
    addVariableDefinition(variable: Variable) {
      if (!this.selectedPreset) return;
      this.selectedPreset.variables.push(variable);
      // 如果新变量有默认值，也更新到当前值中
      if (variable.value !== undefined) {
        this.updateVariable(variable.key, variable.value);
      }
    },

    updateVariableDefinition(index: number, variable: Variable) {
      if (!this.selectedPreset || !this.selectedPreset.variables[index]) return;

      const oldKey = this.selectedPreset.variables[index].key;
      this.selectedPreset.variables[index] = variable;

      // 如果变量名改变，需要处理值的映射
      if (oldKey !== variable.key) {
        delete this.variables[oldKey];
      }
      this.updateVariable(variable.key, variable.value);
    },

    removeVariableDefinition(index: number) {
      if (!this.selectedPreset || !this.selectedPreset.variables[index]) return;

      const keyToRemove = this.selectedPreset.variables[index].key;
      this.selectedPreset.variables.splice(index, 1);
      this.removeVariable(keyToRemove);
    },

    // 更新请求头
    updateHeader(key: string, value: string) {
      this.customHeaders[key] = value;
    },

    // 移除请求头
    removeHeader(key: string) {
      delete this.customHeaders[key];
    },

    // 更新请求体
    updateBody(body: string) {
      this.requestBody = body;
    },

    // 发送请求
    async sendRequest(): Promise<void> {
      if (this.isLoading) return;

      const url = this.buildUrl;
      if (!url) {
        logger.warn("尝试发送请求，但 URL 为空");
        return;
      }

      this.isLoading = true;
      const startTime = Date.now();

      // 创建新的 AbortController
      this.abortController = new AbortController();

      try {
        const headers = this.buildHeaders;
        const body = this.buildBody;

        const response = await fetch(url, {
          method: this.method,
          headers,
          body: this.method !== "GET" ? body : undefined,
          signal: this.abortController.signal,
        });

        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        const contentType = response.headers.get("content-type") || "";

        // 检测是否是 SSE 流式响应
        if (
          contentType.includes("text/event-stream") ||
          contentType.includes("application/stream")
        ) {
          await this.handleStreamResponse(response, responseHeaders, startTime);
        } else {
          // 普通响应处理
          let responseBody: string;

          if (contentType.includes("application/json")) {
            const json = await response.json();
            responseBody = JSON.stringify(json, null, 2);
          } else {
            responseBody = await response.text();
          }

          this.lastResponse = {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
            body: responseBody,
            duration: Date.now() - startTime,
            timestamp: new Date().toISOString(),
          };
        }
      } catch (error) {
        // 如果是中止错误，给出明确提示
        if (error instanceof Error && error.name === "AbortError") {
          customMessage.info("请求已中止");
          if (this.lastResponse?.isStreaming) {
            this.lastResponse.isStreamComplete = true;
            this.lastResponse.duration = Date.now() - startTime;
          }
        } else {
          // 其他错误，使用 errorHandler 处理
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.lastResponse = {
            status: 0,
            statusText: "Error",
            headers: {},
            body: "",
            duration: Date.now() - startTime,
            timestamp: new Date().toISOString(),
            error: errorMessage,
          };
          errorHandler.handle(error, {
            userMessage: `请求失败: ${errorMessage}`,
            level: ErrorLevel.ERROR,
          });
        }
      } finally {
        this.isLoading = false;
        this.abortController = null;
      }
    },

    // 处理流式响应
    async handleStreamResponse(
      response: Response,
      responseHeaders: Record<string, string>,
      startTime: number
    ): Promise<void> {
      // 初始化流式响应对象
      this.lastResponse = {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: "",
        duration: 0,
        timestamp: new Date().toISOString(),
        isStreaming: true,
        streamChunks: [],
        isStreamComplete: false,
      };

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("无法读取响应流");
      }

      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            this.lastResponse.isStreamComplete = true;
            this.lastResponse.duration = Date.now() - startTime;
            break;
          }

          const chunk = decoder.decode(value, { stream: true });

          // 将数据块添加到响应中
          this.lastResponse.streamChunks!.push(chunk);
          this.lastResponse.body += chunk;
          this.lastResponse.duration = Date.now() - startTime;
        }
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") {
          this.lastResponse.error = error.message;
        }
        this.lastResponse.isStreamComplete = true;
        this.lastResponse.duration = Date.now() - startTime;
      } finally {
        reader.releaseLock();
      }
    },

    // 中止当前请求
    abortRequest(): void {
      if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
      }
    },

    // 保存当前配置
    saveProfile(name: string): void {
      if (!this.selectedPreset) return;

      const profile: RequestProfile = {
        id: `profile-${Date.now()}`,
        name,
        selectedPresetId: this.selectedPreset.id,
        variables: { ...this.variables },
        headers: { ...this.customHeaders },
        body: this.requestBody,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      this.savedProfiles.push(profile);

      // 保存到 localStorage
      this.persistProfiles();
    },

    // 加载配置
    loadProfile(profileId: string): void {
      const profile = this.savedProfiles.find((p) => p.id === profileId);
      if (!profile) return;

      // 先选择对应的预设
      this.selectPreset(profile.selectedPresetId);

      // 然后覆盖变量和请求体
      this.variables = { ...profile.variables };
      this.customHeaders = { ...profile.headers };
      this.requestBody = profile.body;
    },

    // 删除配置
    deleteProfile(profileId: string): void {
      const index = this.savedProfiles.findIndex((p) => p.id === profileId);
      if (index !== -1) {
        this.savedProfiles.splice(index, 1);
        this.persistProfiles();
      }
    },

    // 持久化配置到 localStorage
    persistProfiles(): void {
      try {
        localStorage.setItem("api-tester-profiles", JSON.stringify(this.savedProfiles));
      } catch (error) {
        logger.error("保存 Profile 配置失败", error, {
          operation: "persistProfiles",
          profilesCount: this.savedProfiles.length,
        });
      }
    },

    // 从 localStorage 加载配置
    loadProfiles(): void {
      try {
        const stored = localStorage.getItem("api-tester-profiles");
        if (stored) {
          this.savedProfiles = JSON.parse(stored);
        }
      } catch (error) {
        logger.error("加载 Profile 配置失败", error, {
          operation: "loadProfiles",
        });
      }

      // 如果没有选中任何预设，则默认选中空白请求
      if (!this.selectedPreset) {
        this.selectPreset("custom-request");
      }
    },

    // 重置状态
    reset(): void {
      this.selectedPreset = null;
      this.urlTemplate = "";
      this.method = "POST";
      this.variables = {};
      this.customHeaders = {};
      this.requestBody = "";
      this.lastResponse = null;
    },
  },
});
