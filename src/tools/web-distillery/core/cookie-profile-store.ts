import { nanoid } from "nanoid";
import { invoke } from "@tauri-apps/api/core";
import type { CookieEntry, CookieProfile } from "../types";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { getLocalISOString } from "@/utils/time";
import { createConfigManager } from "@/utils/configManager";

const logger = createModuleLogger("web-distillery/cookie-profile-store");
const errorHandler = createModuleErrorHandler(
  "web-distillery/cookie-profile-store"
);

export const MAX_PROFILES = 100;
export const MAX_COOKIES_PER_PROFILE = 200;

interface CookieProfileStoreData {
  profiles: CookieProfile[];
  encrypted?: boolean; // 标记是否已加密存储
}

interface CryptoStatus {
  available: boolean;
  backend: string;
}

/**
 * 判断是否为 IP 地址或 localhost
 */
function isIpOrLocalhost(hostname: string): boolean {
  return hostname === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
}

/**
 * 从 hostname 提取主域名
 * 例：sub.zhihu.com -> zhihu.com，localhost -> localhost
 * 注意：此函数只处理纯 hostname（不含端口），端口逻辑由 extractDomainIdentifier 处理
 */
function extractRootDomain(hostname: string): string {
  // IP 地址或 localhost 直接返回
  if (isIpOrLocalhost(hostname)) {
    return hostname;
  }
  const parts = hostname.split(".");
  // 至少保留两段（如 zhihu.com）
  return parts.length > 2 ? parts.slice(-2).join(".") : hostname;
}

/**
 * 从 URL 中提取用于 Profile 匹配/存储的域名标识符
 * - 对于 IP/localhost：返回 host（含非标准端口，如 127.0.0.1:6565）
 * - 对于普通域名：返回根域名（如 zhihu.com）
 */
export function extractDomainIdentifier(url: string): string {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;

    if (isIpOrLocalhost(hostname)) {
      // IP/localhost 场景：端口是区分不同服务的关键
      const port = parsed.port;
      if (port && port !== "80" && port !== "443") {
        return `${hostname}:${port}`;
      }
      return hostname;
    }

    // 普通域名：提取根域名
    return extractRootDomain(hostname);
  } catch {
    return "unknown";
  }
}

/**
 * 判断 hostname（或 host）是否匹配某个域名标识符（含子域名）
 */
function hostnameMatchesDomain(
  hostOrHostname: string,
  domain: string
): boolean {
  if (hostOrHostname === domain) return true;
  // 子域名匹配：hostname 以 .domain 结尾（仅对非 IP 域名有效）
  if (!isIpOrLocalhost(hostOrHostname) && hostOrHostname.endsWith(`.${domain}`))
    return true;
  return false;
}

export class CookieProfileStore {
  private static instance: CookieProfileStore;
  private profiles: CookieProfile[] = [];
  private isLoaded = false;
  private _cryptoStatus: CryptoStatus | null = null;

  private configManager = createConfigManager<CookieProfileStoreData>({
    moduleName: "web-distillery",
    fileName: "cookie-profiles.json",
    createDefault: () => ({ profiles: [], encrypted: false }),
  });

  private constructor() {}

  public static getInstance(): CookieProfileStore {
    if (!CookieProfileStore.instance) {
      CookieProfileStore.instance = new CookieProfileStore();
    }
    return CookieProfileStore.instance;
  }

  // =========== 加密能力 ===========

  /** 探测加密能力（缓存结果） */
  public async checkCrypto(): Promise<CryptoStatus> {
    if (this._cryptoStatus) return this._cryptoStatus;
    try {
      this._cryptoStatus = await invoke<CryptoStatus>(
        "distillery_check_crypto"
      );
    } catch (e) {
      logger.warn("Crypto check failed, falling back to plaintext", {
        error: e,
      });
      this._cryptoStatus = { available: false, backend: "none" };
    }
    logger.info("Crypto status", this._cryptoStatus);
    return this._cryptoStatus;
  }

  /** 获取缓存的加密状态（同步，需先调用 checkCrypto） */
  public get cryptoAvailable(): boolean {
    return this._cryptoStatus?.available ?? false;
  }

  /** 获取加密后端名称 */
  public get cryptoBackend(): string {
    return this._cryptoStatus?.backend ?? "unknown";
  }

  // =========== 持久化 ===========

  /** 加载所有 Profile（幂等） */
  public async load(): Promise<CookieProfile[]> {
    if (this.isLoaded) return this.profiles;

    // 先探测加密能力
    await this.checkCrypto();

    const data = await this.configManager.load();
    this.profiles = data.profiles ?? [];

    // 如果文件标记为已加密，解密所有 cookie values
    if (data.encrypted && this.profiles.length > 0) {
      await this.decryptAllValues();
    }

    this.isLoaded = true;
    logger.info("Cookie profiles loaded", {
      count: this.profiles.length,
      encrypted: data.encrypted ?? false,
    });
    return this.profiles;
  }

  /** 保存到磁盘（加密可用时自动加密 cookie values） */
  private async save(): Promise<void> {
    const crypto = await this.checkCrypto();

    if (crypto.available) {
      // 加密后写入
      const encryptedProfiles = await this.encryptProfiles(this.profiles);
      await this.configManager.save({
        profiles: encryptedProfiles,
        encrypted: true,
      });
      logger.info("Cookie profiles saved (encrypted)", {
        count: this.profiles.length,
      });
    } else {
      // 明文写入
      await this.configManager.save({
        profiles: this.profiles,
        encrypted: false,
      });
      logger.info("Cookie profiles saved (plaintext)", {
        count: this.profiles.length,
      });
    }
  }

  /** 加密所有 profile 的 cookie values（返回深拷贝，不修改内存中的明文） */
  private async encryptProfiles(
    profiles: CookieProfile[]
  ): Promise<CookieProfile[]> {
    // 收集所有 cookie values
    const allValues: string[] = [];
    const indexMap: { profileIdx: number; cookieIdx: number }[] = [];

    for (let pi = 0; pi < profiles.length; pi++) {
      for (let ci = 0; ci < profiles[pi].cookies.length; ci++) {
        allValues.push(profiles[pi].cookies[ci].value);
        indexMap.push({ profileIdx: pi, cookieIdx: ci });
      }
    }

    if (allValues.length === 0) return structuredClone(profiles);

    try {
      const encryptedValues = await invoke<string[]>(
        "distillery_encrypt_cookie_values",
        { values: allValues }
      );

      // 深拷贝并替换 values
      const result = structuredClone(profiles);
      for (let i = 0; i < indexMap.length; i++) {
        const { profileIdx, cookieIdx } = indexMap[i];
        result[profileIdx].cookies[cookieIdx].value = encryptedValues[i];
      }
      return result;
    } catch (e) {
      errorHandler.warn(e, "加密 Cookie 失败，将以明文保存");
      return structuredClone(profiles);
    }
  }

  /** 解密内存中所有 profile 的 cookie values（就地修改） */
  private async decryptAllValues(): Promise<void> {
    // 收集所有 cookie values
    const allValues: string[] = [];
    const indexMap: { profileIdx: number; cookieIdx: number }[] = [];

    for (let pi = 0; pi < this.profiles.length; pi++) {
      for (let ci = 0; ci < this.profiles[pi].cookies.length; ci++) {
        allValues.push(this.profiles[pi].cookies[ci].value);
        indexMap.push({ profileIdx: pi, cookieIdx: ci });
      }
    }

    if (allValues.length === 0) return;

    try {
      const decryptedValues = await invoke<string[]>(
        "distillery_decrypt_cookie_values",
        { values: allValues }
      );

      // 就地替换
      for (let i = 0; i < indexMap.length; i++) {
        const { profileIdx, cookieIdx } = indexMap[i];
        this.profiles[profileIdx].cookies[cookieIdx].value = decryptedValues[i];
      }
      logger.info("Cookie values decrypted", { count: allValues.length });
    } catch (e) {
      errorHandler.warn(e, "解密 Cookie 失败，数据可能不可用");
    }
  }

  // =========== CRUD ===========

  /** 获取所有 Profile */
  public async getAll(): Promise<CookieProfile[]> {
    await this.load();
    return [...this.profiles];
  }

  /** 按 ID 获取单个 Profile */
  public async getById(id: string): Promise<CookieProfile | null> {
    await this.load();
    return this.profiles.find((p) => p.id === id) ?? null;
  }

  /** 按主域名获取 Profile 列表 */
  public async getByDomain(domain: string): Promise<CookieProfile[]> {
    await this.load();
    return this.profiles.filter((p) => p.domain === domain);
  }

  /** 创建新 Profile */
  public async create(
    data: Omit<CookieProfile, "id" | "createdAt" | "updatedAt" | "isActive">
  ): Promise<CookieProfile> {
    await this.load();

    if (this.profiles.length >= MAX_PROFILES) {
      throw new Error(`已达到最大 Profile 数量限制（${MAX_PROFILES}）`);
    }

    const cookies = data.cookies.slice(0, MAX_COOKIES_PER_PROFILE);
    const now = getLocalISOString();
    const profile: CookieProfile = {
      ...data,
      cookies,
      id: nanoid(),
      isActive: false,
      createdAt: now,
      updatedAt: now,
    };

    this.profiles.push(profile);
    await this.save();
    logger.info("Cookie profile created", {
      id: profile.id,
      name: profile.name,
      domain: profile.domain,
    });
    return profile;
  }

  /** 更新 Profile */
  public async update(
    id: string,
    updates: Partial<Omit<CookieProfile, "id" | "createdAt">>
  ): Promise<CookieProfile> {
    await this.load();

    const index = this.profiles.findIndex((p) => p.id === id);
    if (index < 0) {
      throw new Error(`Cookie Profile 不存在：${id}`);
    }

    // 限制 cookies 数量
    if (updates.cookies) {
      updates = {
        ...updates,
        cookies: updates.cookies.slice(0, MAX_COOKIES_PER_PROFILE),
      };
    }

    this.profiles[index] = {
      ...this.profiles[index],
      ...updates,
      updatedAt: getLocalISOString(),
    };

    await this.save();
    logger.info("Cookie profile updated", { id });
    return this.profiles[index];
  }

  /** 删除 Profile */
  public async delete(id: string): Promise<void> {
    await this.load();
    const before = this.profiles.length;
    this.profiles = this.profiles.filter((p) => p.id !== id);
    if (this.profiles.length === before) {
      logger.warn("Delete: profile not found", { id });
      return;
    }
    await this.save();
    logger.info("Cookie profile deleted", { id });
  }

  // =========== 激活/切换 ===========

  /**
   * 切换激活状态（同域名互斥）
   * - 若目标 Profile 未激活 → 激活它，同时停用同域名其他 Profile
   * - 若目标 Profile 已激活 → 停用它
   */
  public async toggleActive(profileId: string): Promise<void> {
    await this.load();

    const target = this.profiles.find((p) => p.id === profileId);
    if (!target) {
      throw new Error(`Cookie Profile 不存在：${profileId}`);
    }

    const willActivate = !target.isActive;
    const now = getLocalISOString();

    this.profiles = this.profiles.map((p) => {
      if (p.domain !== target.domain) return p;
      if (p.id === profileId) {
        return {
          ...p,
          isActive: willActivate,
          lastUsedAt: willActivate ? now : p.lastUsedAt,
          updatedAt: now,
        };
      }
      // 同域名其他 Profile 强制停用
      return p.isActive ? { ...p, isActive: false, updatedAt: now } : p;
    });

    await this.save();
    logger.info("Cookie profile toggled", {
      id: profileId,
      isActive: willActivate,
    });
  }

  // =========== URL 匹配 ===========

  /**
   * 根据 URL 获取所有可能匹配的 Profile（不限于激活状态）
   * 用于侧边栏/工具栏展示当前地址关联的身份列表
   */
  public async getMatchingProfilesForUrl(
    url: string
  ): Promise<CookieProfile[]> {
    await this.load();

    let domainId: string;
    let hostname: string;
    try {
      const parsed = new URL(url);
      hostname = parsed.hostname;
      domainId = extractDomainIdentifier(url);
    } catch {
      logger.warn("Invalid URL for profile matching", { url });
      return [];
    }

    return this.profiles.filter((p) => {
      // 1. 精确匹配域名标识符（含端口，如 127.0.0.1:6565）
      if (p.domain === domainId) return true;
      // 2. 精确匹配 hostname（不含端口，兼容旧数据）
      if (domainId !== hostname && p.domain === hostname) return true;
      // 3. 根域名匹配（仅对非 IP 域名有效）
      if (!isIpOrLocalhost(hostname)) {
        const rootDomain = extractRootDomain(hostname);
        if (p.domain === rootDomain) return true;
        // 4. 子域名匹配
        if (hostnameMatchesDomain(hostname, p.domain)) return true;
        // 5. domainAliases 匹配
        if (
          p.domainAliases?.some((alias) =>
            hostnameMatchesDomain(hostname, alias)
          )
        )
          return true;
      }
      return false;
    });
  }

  /**
   * 根据 URL 找到当前激活的 Profile
   * 匹配优先级：精确域名标识符 > 精确 hostname > 子域名 > domainAliases
   */
  public async getActiveProfileForUrl(
    url: string
  ): Promise<CookieProfile | null> {
    await this.load();

    let domainId: string;
    let hostname: string;
    try {
      const parsed = new URL(url);
      hostname = parsed.hostname;
      domainId = extractDomainIdentifier(url);
    } catch {
      logger.warn("Invalid URL for profile matching", { url });
      return null;
    }

    const active = this.profiles.filter((p) => p.isActive);

    // 1. 精确匹配域名标识符（含端口，如 127.0.0.1:6565）
    const exactId = active.find((p) => p.domain === domainId);
    if (exactId) return exactId;

    // 2. 精确匹配 hostname（不含端口，兼容旧数据）
    if (domainId !== hostname) {
      const exactHost = active.find((p) => p.domain === hostname);
      if (exactHost) return exactHost;
    }

    // 3. 根域名匹配（仅对非 IP 域名有效）
    if (!isIpOrLocalhost(hostname)) {
      const rootDomain = extractRootDomain(hostname);
      const rootMatch = active.find((p) => p.domain === rootDomain);
      if (rootMatch) return rootMatch;

      // 4. 子域名匹配
      const subMatch = active.find((p) =>
        hostnameMatchesDomain(hostname, p.domain)
      );
      if (subMatch) return subMatch;

      // 5. domainAliases 匹配
      const aliasMatch = active.find((p) =>
        p.domainAliases?.some((alias) => hostnameMatchesDomain(hostname, alias))
      );
      if (aliasMatch) return aliasMatch;
    }

    return null;
  }

  // =========== 导入 ===========

  /**
   * 从 JSON 导入（覆盖同名 Profile 或新建）
   * 支持单个 CookieProfile 对象或数组
   */
  public async importFromJson(
    data: unknown
  ): Promise<{ imported: number; skipped: number }> {
    await this.load();

    const items: CookieProfile[] = Array.isArray(data)
      ? data
      : [data as CookieProfile];
    let imported = 0;
    let skipped = 0;
    const now = getLocalISOString();

    for (const item of items) {
      if (!item || typeof item !== "object" || !item.name || !item.domain) {
        skipped++;
        continue;
      }
      if (this.profiles.length >= MAX_PROFILES) {
        logger.warn("Import stopped: max profiles reached", { MAX_PROFILES });
        skipped += items.length - imported - skipped;
        break;
      }

      const cookies = (item.cookies ?? []).slice(0, MAX_COOKIES_PER_PROFILE);
      const existing = this.profiles.findIndex((p) => p.id === item.id);

      if (existing >= 0) {
        // 覆盖已有 Profile
        this.profiles[existing] = { ...item, cookies, updatedAt: now };
      } else {
        this.profiles.push({
          ...item,
          cookies,
          id: item.id ?? nanoid(),
          isActive: false,
          createdAt: item.createdAt ?? now,
          updatedAt: now,
        });
      }
      imported++;
    }

    await this.save();
    logger.info("Imported cookie profiles from JSON", { imported, skipped });
    return { imported, skipped };
  }

  /**
   * 从 Netscape Cookie 文件格式导入
   * 格式：domain\tincludeSubdomains\tpath\tsecure\texpires\tname\tvalue
   */
  public async importFromNetscape(
    text: string,
    profileName: string,
    domain: string
  ): Promise<CookieProfile> {
    const cookies: CookieEntry[] = [];

    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const parts = line.split("\t");
      if (parts.length < 7) continue;

      const [cookieDomain, , path, secure, expiresRaw, name, value] = parts;
      const expiresTs = parseInt(expiresRaw, 10);

      const entry: CookieEntry = {
        name: name.trim(),
        value: value.trim(),
        domain: cookieDomain.trim().replace(/^\./, ""),
        path: path.trim(),
        secure: secure.trim().toUpperCase() === "TRUE",
        expires:
          !isNaN(expiresTs) && expiresTs > 0
            ? new Date(expiresTs * 1000).toISOString()
            : undefined,
      };

      if (entry.name) {
        cookies.push(entry);
      }
    }

    logger.info("Parsed Netscape cookies", { count: cookies.length, domain });
    return this.create({ name: profileName, domain, cookies });
  }

  // =========== 导出 ===========

  /** 导出单个 Profile 为 JSON */
  public async exportAsJson(profileId: string): Promise<string> {
    await this.load();
    const profile = this.profiles.find((p) => p.id === profileId);
    if (!profile) throw new Error(`Cookie Profile 不存在：${profileId}`);
    return JSON.stringify(profile, null, 2);
  }

  /** 导出所有 Profile 为 JSON 数组 */
  public async exportAllAsJson(): Promise<string> {
    await this.load();
    return JSON.stringify(this.profiles, null, 2);
  }

  /**
   * 导出为 curl Cookie 请求头字符串
   * 格式：-H "Cookie: name1=value1; name2=value2"
   */
  public async exportAsCurlHeader(profileId: string): Promise<string> {
    await this.load();
    const profile = this.profiles.find((p) => p.id === profileId);
    if (!profile) throw new Error(`Cookie Profile 不存在：${profileId}`);

    const cookieStr = profile.cookies
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    return `-H "Cookie: ${cookieStr}"`;
  }

  /**
   * 导出单个 Profile 为 Netscape Cookie 文件格式
   * 格式：domain\tincludeSubdomains\tpath\tsecure\texpires\tname\tvalue
   */
  public async exportAsNetscape(profileId: string): Promise<string> {
    await this.load();
    const profile = this.profiles.find((p) => p.id === profileId);
    if (!profile) throw new Error(`Cookie Profile 不存在：${profileId}`);

    const lines: string[] = [
      "# Netscape HTTP Cookie File",
      `# Exported from AIO Hub - Profile: ${profile.name}`,
      `# Domain: ${profile.domain}`,
      "",
    ];

    for (const c of profile.cookies) {
      const domain = c.domain.startsWith(".") ? c.domain : `.${c.domain}`;
      const includeSubdomains = "TRUE";
      const path = c.path || "/";
      const secure = c.secure ? "TRUE" : "FALSE";
      const expires = c.expires
        ? Math.floor(new Date(c.expires).getTime() / 1000).toString()
        : "0";
      lines.push(
        `${domain}\t${includeSubdomains}\t${path}\t${secure}\t${expires}\t${c.name}\t${c.value}`
      );
    }

    return lines.join("\n");
  }

  // =========== 从浏览器抓取 ===========

  /**
   * 解析 `document.cookie` 字符串并创建 Profile
   * document.cookie 格式：name=value; name2=value2; ...
   * 注意：document.cookie 不包含 domain/path/expires 等元数据，需从 URL 推断
   */
  public async captureFromBrowser(
    cookieString: string,
    url: string
  ): Promise<CookieProfile> {
    let hostname = "unknown";
    let domainId = "unknown";

    try {
      const parsed = new URL(url);
      hostname = parsed.hostname;
      domainId = extractDomainIdentifier(url);
    } catch {
      errorHandler.handle(new Error(`无效的 URL：${url}`), {
        showToUser: false,
        context: { url },
      });
    }

    const cookies: CookieEntry[] = cookieString
      .split(";")
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const eqIndex = pair.indexOf("=");
        if (eqIndex < 0) return null;
        const name = pair.slice(0, eqIndex).trim();
        const value = pair.slice(eqIndex + 1).trim();
        if (!name) return null;
        return {
          name,
          value,
          domain: hostname,
          path: "/",
        } satisfies CookieEntry;
      })
      .filter((c): c is CookieEntry => c !== null)
      .slice(0, MAX_COOKIES_PER_PROFILE);

    const profileName = `${domainId} — ${getLocalISOString().slice(0, 10)}`;
    logger.info("Captured cookies from browser", {
      url,
      domainId,
      cookieCount: cookies.length,
    });

    return this.create({
      name: profileName,
      domain: domainId,
      cookies,
    });
  }
}

export const cookieProfileStore = CookieProfileStore.getInstance();
