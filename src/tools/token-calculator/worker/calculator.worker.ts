/**
 * Token 计算 Worker
 *
 * 协议：
 * - 启动 → postMessage({ type: "ready" })，等待主线程 init
 * - 收到 { type: "init", profiles, rules } → 重建 engine 状态 → postMessage({ type: "initialized" })
 * - 计算时若需要 local/remote profile 数据 → postMessage({ type: "needProfileData", profileId })
 * - 主线程回推 { type: "profileData", profileId, tokenizerJSON, tokenizerConfigJSON } → 引擎实例化
 *
 * 详见 docs/Plan/分词器资产注册表方案.md §9
 */

import { tokenCalculatorEngine } from "../core/tokenCalculatorEngine";
import { WORKER_BUILTIN_LOADERS } from "../data/builtin-tokenizer-index";
import type { WorkerInbound, WorkerOutbound } from "./workerProtocol";
import type {
  TokenizerProfile,
  TokenizerRule,
} from "../types/tokenizer-profile";

const postOut = (msg: WorkerOutbound) => self.postMessage(msg);

/**
 * 已就绪标记
 * - false: 还未收到 init，所有业务请求都会被排队
 * - true: 收到 init 并完成 setRegistry
 */
let initialized = false;

/**
 * 业务请求在 init 完成前的等待队列
 */
const pendingRequests: Array<{
  id: number;
  method: string;
  params: any;
}> = [];

/**
 * profileId → pending fetch（按需推送 tokenizer.json 时使用）
 *
 * 当 engine 调用 profileDataFetcher 时，我们记下 resolver，等主线程通过
 * profileData 消息把数据推回来再 resolve。
 */
const pendingProfileFetches = new Map<
  string,
  Array<{
    resolve: (value: {
      tokenizerJSON: string;
      tokenizerConfigJSON?: string;
    }) => void;
    reject: (reason?: any) => void;
  }>
>();

/**
 * 把 engine 的 profileDataFetcher 接到 worker 的 postMessage 通道
 */
function installProfileDataFetcher() {
  tokenCalculatorEngine.setProfileDataFetcher((profileId) => {
    return new Promise((resolve, reject) => {
      const existing = pendingProfileFetches.get(profileId);
      if (existing) {
        existing.push({ resolve, reject });
      } else {
        pendingProfileFetches.set(profileId, [{ resolve, reject }]);
        // 仅在首次请求时通知主线程
        postOut({ type: "needProfileData", profileId });
      }
    });
  });
}

/**
 * 应用注册表快照到 engine
 */
function applyRegistry(profiles: TokenizerProfile[], rules: TokenizerRule[]) {
  tokenCalculatorEngine.setRegistry({ profiles, rules });

  // 为 bundled 来源的 profile 注入静态 loader
  for (const profile of profiles) {
    if (profile.source.type === "bundled") {
      const loader = WORKER_BUILTIN_LOADERS[profile.source.packageName];
      if (loader) {
        tokenCalculatorEngine.setLoader(profile.id, loader);
      }
    }
  }
}

/**
 * 处理业务请求
 */
async function handleRequest(id: number, method: string, params: any) {
  try {
    let result: any;
    switch (method) {
      case "calculateTokens":
        result = await tokenCalculatorEngine.calculateTokens(
          params.text,
          params.modelId
        );
        break;
      case "calculateTokensByTokenizer":
        result = await tokenCalculatorEngine.calculateTokensByTokenizer(
          params.text,
          params.tokenizerName
        );
        break;
      case "getTokenizedText":
        result = await tokenCalculatorEngine.getTokenizedText(
          params.text,
          params.identifier,
          params.useTokenizerName
        );
        break;
      case "calculateImageTokens":
        result = tokenCalculatorEngine.calculateImageTokens(
          params.width,
          params.height,
          params.visionTokenCost
        );
        break;
      case "calculateVideoTokens":
        result = tokenCalculatorEngine.calculateVideoTokens(
          params.durationSeconds
        );
        break;
      case "calculateAudioTokens":
        result = tokenCalculatorEngine.calculateAudioTokens(
          params.durationSeconds
        );
        break;
      case "clearCache":
        tokenCalculatorEngine.clearCache();
        result = true;
        break;
      case "listProfiles":
        result = tokenCalculatorEngine.listProfiles();
        break;
      default:
        throw new Error(`Unknown method: ${method}`);
    }
    postOut({ id, type: "response", result });
  } catch (error) {
    postOut({
      id,
      type: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function flushPending() {
  while (pendingRequests.length > 0) {
    const req = pendingRequests.shift()!;
    void handleRequest(req.id, req.method, req.params);
  }
}

// =================================================================
// 主线程消息入口
// =================================================================

self.onmessage = (event: MessageEvent<WorkerInbound>) => {
  const data = event.data;

  // ============ 协议控制消息 ============
  if ((data as any).type === "init") {
    const msg = data as Extract<WorkerInbound, { type: "init" }>;
    applyRegistry(msg.profiles, msg.rules);
    initialized = true;
    postOut({ type: "initialized" });
    flushPending();
    return;
  }

  if ((data as any).type === "profileData") {
    const msg = data as Extract<WorkerInbound, { type: "profileData" }>;
    const waiters = pendingProfileFetches.get(msg.profileId);
    pendingProfileFetches.delete(msg.profileId);
    if (waiters) {
      for (const w of waiters) {
        if (msg.error) {
          w.reject(new Error(msg.error));
        } else {
          w.resolve({
            tokenizerJSON: msg.tokenizerJSON,
            tokenizerConfigJSON: msg.tokenizerConfigJSON,
          });
        }
      }
    }
    return;
  }

  // ============ 业务请求 ============
  const req = data as Extract<
    WorkerInbound,
    { id: number; method: string; params: unknown }
  >;
  if (!initialized) {
    pendingRequests.push({
      id: req.id,
      method: req.method,
      params: req.params,
    });
    return;
  }

  void handleRequest(req.id, req.method, req.params);
};

// 安装 fetcher 通道 + 上报 ready
installProfileDataFetcher();
postOut({ type: "ready" });
