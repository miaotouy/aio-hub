import type { SiteRecipe } from "../types";
import { getLocalISOString } from "@/utils/time";

const now = getLocalISOString();

/**
 * 内置站点配方库
 * 预设高频站点的提取规则
 */
export const builtinRecipes: SiteRecipe[] = [
  {
    id: "builtin-bilibili-video",
    name: "Bilibili 视频页",
    domain: "www.bilibili.com",
    pathPattern: "/video/**",
    contentPatterns: ["__INITIAL_STATE__", "bilibili\\.com", "哔哩哔哩"],
    metadataScrapers: [
      {
        type: "json-ld",
        target: "VideoObject",
        mapping: {
          title: ["name"],
          description: ["description"],
          author: ["author.name"],
          publishDate: ["uploadDate"],
        },
      },
      {
        type: "json-variable",
        target: "__INITIAL_STATE__",
        mapping: {
          title: ["videoData.title", "title"],
          description: ["videoData.desc", "desc"],
          author: ["upData.name", "videoData.owner.name", "owner.name"],
          publishDate: ["videoData.pubdate", "videoData.ctime"],
        },
      },
      {
        type: "meta",
        target: "all",
        mapping: {
          description: ["description", "og:description"],
          title: ["name", "og:title", "twitter:title"],
          author: ["author"],
        },
      },
    ],
    extractSelectors: [
      "h1.video-title",
      ".video-info-description-text",
      ".desc-info-text",
      ".video-desc-info",
      ".tag-list",
      ".pubdate-ip",
    ],
    excludeSelectors: [
      ".bili-header",
      ".nav-menu",
      ".video-page-special-card",
      ".ad-report",
      ".pop-live-small-mode",
      ".right-container",
      ".bili-footer",
      ".video-pod",
      ".recommend-list-v1",
      ".fixed-sidenav-storage",
    ],
    createdAt: now,
    updatedAt: now,
    useCount: 0,
  },
  {
    id: "builtin-wechat-article",
    name: "微信公众号文章",
    domain: "mp.weixin.qq.com",
    pathPattern: "/s/**",
    protectedSelectors: ["#js_content"], // 保护正文区域不被去噪器删除
    extractSelectors: [
      "#js_content",
      "#activity-name", // 文章标题
      "#js_name", // 公众号名称
      "#publish_time", // 发布时间
    ],
    excludeSelectors: ["#js_pc_qr_code", "#content_bottom_area", ".qr_code_pc", ".rich_media_tool"],
    createdAt: now,
    updatedAt: now,
    useCount: 0,
  },
];
