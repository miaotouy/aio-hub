export interface MobileUserProfile {
  id: string;
  /** Stable profile identifier used by imported agent.userProfileId bindings. */
  name: string;
  displayName?: string;
  icon?: string;
  /** Plain-text profile description injected into the chat request context. */
  content: string;
  enabled: boolean;
  createdAt: string;
  lastUsedAt?: string;
}

export interface MobileUserProfileConfig {
  profiles: MobileUserProfile[];
  globalProfileId: string | null;
}
