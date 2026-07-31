import {
  processorResult,
  type ContextProcessor,
} from "../../../types/pipeline";

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export const userProfileInjector: ContextProcessor = {
  id: "primary:user-profile-injector",
  name: "用户档案注入器",
  description: "将当前生效用户档案作为系统上下文注入聊天请求。",
  priority: 200,
  isCore: true,
  defaultEnabled: true,
  execute: async (context) => {
    const profile = context.userProfile;
    if (!profile?.enabled) {
      return processorResult.skipped("当前没有启用的用户档案。");
    }
    if (!profile.content.trim()) {
      return processorResult.skipped("当前用户档案内容为空。");
    }

    context.messages.unshift({
      role: "system",
      content: [
        `<user_profile name="${escapeXmlAttribute(profile.name)}">`,
        profile.content,
        "</user_profile>",
      ].join("\n"),
      sourceType: "unknown",
      sourceId: `user-profile:${profile.id}`,
    });
    return processorResult.applied(`已注入用户档案“${profile.name}”。`, {
      profileId: profile.id,
    });
  },
};
