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
    protectedSelectors: [".up-info--right", ".video-info-meta", ".video-toolbar-container", ".recommend-list-v1"],
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
      ".up-info--right", // UP主信息
      ".video-info-meta", // 互动数据栏（播放、弹幕、日期）
      ".video-toolbar-container", // 点赞、投币、收藏工具栏
      ".video-info-description-text",
      ".desc-info-text",
      ".video-desc-info",
      ".tag-list",
      ".pubdate-ip",
      ".recommend-list-v1", // 相关视频列表
    ],
    excludeSelectors: [
      ".bili-header",
      ".nav-menu",
      ".video-page-special-card",
      ".ad-report",
      ".pop-live-small-mode",
      // ".right-container", // 不再排除整个右侧栏，因为里面有相关视频
      ".bili-footer",
      ".video-pod",
      // ".recommend-list-v1", // 不再排除相关视频
      ".fixed-sidenav-storage",
      ".reply-header", // 排除评论区头部
      ".reply-list", // 排除评论列表
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
