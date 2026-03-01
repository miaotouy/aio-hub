import { computed } from "vue";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useVcpStore } from "@/tools/vcp-connector/stores/vcpConnectorStore";
import { useAgentStore } from "../stores/agentStore";

/** 将本地回环地址规范化为统一形式，避免 localhost 与 127.0.0.1 不匹配 */
function normalizeHostname(hostname: string): string {
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower === "127.0.0.1" || lower === "::1") {
    return "localhost";
  }
  return lower;
}

/**
 * 比较两个 URL 是否指向同一 VCP 主机（hostname + port）。
 * - 本地回环地址（localhost / 127.0.0.1 / ::1）统一视为相同
 * - VCP LLM API 与 WebSocket 同端口不同协议（http vs ws），端口必须一致
 */
export function isSameHost(urlA: string, urlB: string): boolean {
  try {
    const a = new URL(urlA);
    const b = new URL(urlB);
    if (normalizeHostname(a.hostname) !== normalizeHostname(b.hostname)) return false;
    // 同端口不同协议（如 http:6505 vs ws:6505），端口若都显式则要求一致
    if (a.port && b.port && a.port !== b.port) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * 检测当前 Agent 是否使用 VCP 渠道。
 *
 * 判断方式：比较当前 Agent 所用 LLM Profile 的 baseUrl 与
 * VCP 连接器配置的 wsUrl 是否指向同一主机，以此推断工具调用
 * 由 VCP 后端负责处理。
 */
export function useIsVcpChannel() {
  const agentStore = useAgentStore();
  const vcpStore = useVcpStore();
  const { getProfileById } = useLlmProfiles();

  /**
   * 当前 Agent 是否是 VCP 渠道
   */
  const isVcpChannel = computed((): boolean => {
    // VCP 必须已配置 wsUrl
    const wsUrl = vcpStore.config.wsUrl;
    if (!wsUrl) return false;

    // 获取当前 Agent
    const agent = agentStore.currentAgentId ? agentStore.getAgentById(agentStore.currentAgentId) : null;
    if (!agent?.profileId) return false;

    // 获取 Agent 所用 LLM Profile
    const profile = getProfileById(agent.profileId);
    if (!profile?.baseUrl) return false;

    return isSameHost(profile.baseUrl, wsUrl);
  });

  return { isVcpChannel };
}
