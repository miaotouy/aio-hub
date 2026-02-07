/**
 * 中英文停用词表
 *
 * 用于知识库查询预处理管线，过滤对检索无意义的高频词汇。
 * 分类：代词、助词、介词、连词、副词、语气词、指令性词汇、疑问词、量词、英文停用词
 */

const CHINESE_STOPWORDS = [
  // 代词
  "我", "你", "他", "她", "它", "我们", "你们", "他们", "她们", "自己", "大家", "这", "那", "这些", "那些", "这个", "那个",

  // 助词
  "的", "了", "着", "过", "地", "得", "之",

  // 介词
  "在", "从", "到", "对", "向", "把", "被", "给", "跟", "同", "用", "以", "按", "为",

  // 连词
  "和", "与", "或", "但", "而", "以及", "并且", "或者", "但是", "然而", "不过", "因为", "所以", "如果", "虽然",

  // 副词
  "很", "非常", "特别", "比较", "更", "最", "都", "也", "就", "才", "又", "再", "还", "已经", "正在", "一直", "只", "仅",

  // 语气词
  "吗", "呢", "吧", "啊", "哦", "嗯", "呀", "哈", "嘛", "噢",

  // 指令性词汇（Chat 场景高频噪音）
  "帮我", "请问", "请", "麻烦", "能不能", "可以", "可不可以",
  "查一下", "搜索", "搜一下", "找一下", "找找", "查找", "检索",
  "告诉我", "说说", "讲讲", "介绍", "解释",
  "关于", "有关", "相关",
  "一下", "看看", "想要", "需要", "想知道",

  // 疑问词
  "什么", "怎么", "哪些", "哪个", "如何", "为什么", "多少", "几个", "是否", "有没有",

  // 量词 / 数词
  "个", "些", "一些", "一个", "一种",

  // 其他高频无意义词
  "是", "有", "没有", "不是", "不", "没", "会", "能", "要", "让", "使",
  "这样", "那样", "怎样", "这么", "那么",
  "上", "下", "中", "里", "内", "外",
  "时候", "时间", "方面", "部分", "情况",
  "知道", "觉得", "认为", "感觉",
  "东西", "事情", "问题",
];

const ENGLISH_STOPWORDS = [
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did",
  "will", "would", "shall", "should", "may", "might", "can", "could",
  "in", "on", "at", "to", "for", "of", "with", "by", "from", "as",
  "into", "through", "during", "before", "after", "above", "below",
  "and", "but", "or", "nor", "not", "so", "yet",
  "it", "its", "this", "that", "these", "those",
  "i", "me", "my", "we", "our", "you", "your", "he", "him", "his", "she", "her", "they", "them", "their",
  "what", "which", "who", "whom", "how", "when", "where", "why",
  "all", "each", "every", "both", "few", "more", "most", "some", "any", "no",
  "about", "up", "out", "if", "then", "than", "too", "very",
  "just", "also", "only",
  "please", "help", "find", "search", "tell", "show", "give",
];

/** 停用词 Set（用于 O(1) 查找） */
export const STOPWORDS = new Set<string>([
  ...CHINESE_STOPWORDS,
  ...ENGLISH_STOPWORDS,
]);

/**
 * 判断一个 token 是否为停用词
 */
export function isStopword(token: string): boolean {
  return STOPWORDS.has(token.toLowerCase());
}