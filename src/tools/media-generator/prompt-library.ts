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

import type { MediaTaskType } from "./types";

export interface PromptLibraryCategory {
  id: string;
  label: string;
  description: string;
  prompts: string[];
}

export const MEDIA_TYPE_LABELS: Record<MediaTaskType, string> = {
  image: "图片",
  video: "视频",
  speech: "语音",
  music: "音乐",
};

export const MEDIA_TYPE_PROMPT_HINTS: Record<MediaTaskType, string> = {
  image: "组合画风、场景、构图和光影，快速搭建画面提示词，点击词条可连续组合",
  video:
    "组合运镜、景别、动作节奏和画面风格，描述连续的视频镜头，点击词条可连续组合",
  speech: "组合语气、情绪、场景和节奏，让朗读指令更具体，点击词条可连续组合",
  music: "组合曲风、情绪、编曲和人声，快速描述音乐制作方向，点击词条可连续组合",
};

export const QUICK_PROMPT_LIBRARY: Record<
  MediaTaskType,
  PromptLibraryCategory[]
> = {
  image: [
    {
      id: "examples",
      label: "灵感示例",
      description: "可以直接使用的完整描述",
      prompts: [
        "一个在霓虹灯下的赛博朋克城市",
        "唯美的二次元少女，樱花飘落",
        "壮阔的雪山日出，电影级光效",
        "深海中的亚特兰蒂斯遗迹，发光生物",
        "复古未来主义的太空站，土星环背景",
        "蒸汽朋克风格的空中飞艇，云层穿梭",
        "森林深处的精灵小屋，萤火虫点点",
        "极简主义的沙漠建筑，长长的投影",
        "浮世绘风格的巨浪与富士山",
        "赛博朋克风格的街头小吃摊",
        "梦幻的云端城堡，彩虹桥连接",
        "荒废的后启示录风格图书馆",
        "宏伟的中世纪大教堂，彩色玻璃窗",
        "极地冰原上的科研基地，极光闪耀",
        "维多利亚时代的实验室，充满齿轮与蒸汽",
        "充满生机的热带雨林，隐藏的瀑布",
        "月球表面的未来城市，地球升起",
        "古老的中国园林，烟雨朦胧",
        "机械心脏，精密齿轮与发光电线",
        "猫咪咖啡馆，阳光洒在午睡的猫身上",
      ],
    },
    {
      id: "style",
      label: "画风",
      description: "选择整体艺术方向",
      prompts: [
        "电影概念设计，细节丰富，史诗感",
        "日系二次元插画，清透柔和的色彩",
        "复古胶片摄影，细腻颗粒与怀旧色调",
        "赛博朋克，霓虹色，高对比度，未来感",
        "中国水墨画，留白构图，淡雅层次",
        "极简主义设计，大面积留白，克制配色",
      ],
    },
    {
      id: "scene",
      label: "场景",
      description: "补充主体所处环境",
      prompts: [
        "雨后的城市街道，地面倒映着灯光",
        "清晨薄雾笼罩的山谷与远方群山",
        "阳光穿过树冠的静谧森林",
        "黄昏时分的海边悬崖与开阔海面",
        "漂浮在云层之上的空中花园",
        "温暖灯光下的木质咖啡馆室内",
      ],
    },
    {
      id: "composition",
      label: "构图",
      description: "加入画面结构和主体安排",
      prompts: [
        "三分法构图，主体位于画面右侧",
        "对称构图，视觉中心明确",
        "低机位仰拍，突出主体的宏伟感",
        "高机位俯拍，展现环境的完整层次",
        "前景、中景、背景层次分明",
        "引导线构图，视线延伸至远方主体",
      ],
    },
    {
      id: "light",
      label: "光影质感",
      description: "补充光线、色彩和材质表现",
      prompts: [
        "柔和的清晨金色阳光，空气中有细小尘埃",
        "强烈的侧光，形成清晰的明暗分界",
        "霓虹灯反射，潮湿地面产生彩色光斑",
        "体积光穿过薄雾，营造神圣氛围",
        "冷暖对比光，蓝色环境光搭配橙色轮廓光",
        "玻璃、金属和水面上的真实反射",
      ],
    },
  ],
  video: [
    {
      id: "examples",
      label: "灵感示例",
      description: "可以直接使用的完整描述",
      prompts: [
        "雨夜街角的霓虹灯倒影，镜头缓慢推进",
        "清晨山谷云海翻涌，航拍镜头穿过薄雾",
        "未来城市上空的飞行器穿梭，电影级运镜",
        "海边公路日落延时，复古胶片质感",
        "机械工厂中机器人手臂协作装配，冷色工业光",
        "舞台聚光灯下的独舞者，慢动作旋转",
        "森林溪流旁的微距镜头，光斑和水雾流动",
        "太空舱窗外掠过蓝色行星，安静深邃",
      ],
    },
    {
      id: "camera-movement",
      label: "运镜",
      description: "描述镜头移动和调度",
      prompts: [
        "镜头缓慢推进，逐渐靠近主体",
        "镜头从主体环绕一周，保持主体居中",
        "镜头向后拉远，逐步展现完整环境",
        "无人机从高空俯冲至地面，动作连贯流畅",
        "手持摄影轻微晃动，带来真实纪实感",
        "一镜到底，镜头穿过多个空间完成转场",
      ],
    },
    {
      id: "shot-size",
      label: "景别",
      description: "控制镜头距离和关注范围",
      prompts: [
        "超远景，展现宏大的环境和空间尺度",
        "广角全景，主体与环境关系清晰",
        "中景，完整呈现主体动作和姿态",
        "近景，聚焦人物表情与细微反应",
        "特写，突出眼神、手部或关键物件",
      ],
    },
    {
      id: "motion-rhythm",
      label: "动作节奏",
      description: "补充时间变化、动作和节奏",
      prompts: [
        "动作自然连贯，节奏舒缓而有呼吸感",
        "慢动作捕捉飞溅的水花和飘动的布料",
        "主体快速奔跑，背景产生明显动态模糊",
        "从静止逐渐加速，情绪持续升温",
        "连续动作一气呵成，不出现突兀跳帧",
      ],
    },
    {
      id: "visual-style",
      label: "画面风格",
      description: "确定视频的视觉质感",
      prompts: [
        "电影级光影，宽银幕构图，细腻胶片颗粒",
        "冷色工业风，高对比度，硬朗定向光",
        "温暖自然光，轻柔高光，治愈氛围",
        "复古 VHS 质感，模拟磁带噪点和色偏",
        "纪录片风格，真实自然，不刻意摆拍",
      ],
    },
  ],
  speech: [
    {
      id: "examples",
      label: "灵感示例",
      description: "可以直接使用的完整描述",
      prompts: [
        "欢迎来到 AIO Hub，今天我们一起把灵感变成作品。",
        "请用温柔、克制的语气朗读这段睡前旁白。",
        "这是一段产品发布会开场白，语气自信、清晰、有节奏。",
        "请用新闻播报风格朗读：今日科技领域迎来多项重要进展。",
        "把这段文字读成纪录片旁白，语速稍慢，带一点史诗感。",
        "请用轻松自然的口吻介绍这个周末的旅行计划。",
        "这是一条系统通知，请保持简洁、稳定、专业的语气。",
        "请用兴奋但不过度夸张的语气朗读这段活动预告。",
      ],
    },
    {
      id: "tone",
      label: "语气",
      description: "选择说话的整体表达方式",
      prompts: [
        "温柔亲切，像朋友一样自然交流",
        "专业清晰，语气自信但不过度强势",
        "沉稳克制，适合正式说明和通知",
        "轻松活泼，带有自然的亲和力",
        "热情有感染力，适合活动宣传",
      ],
    },
    {
      id: "scene",
      label: "场景",
      description: "补充主体所处环境",
      prompts: [
        "产品发布会开场，面向专业观众",
        "睡前故事旁白，营造安静放松的氛围",
        "纪录片解说，客观介绍历史和自然",
        "短视频口播，开头快速抓住注意力",
        "新闻播报，信息准确、节奏明快",
      ],
    },
    {
      id: "emotion",
      label: "情绪",
      description: "控制声音或音乐中的情绪",
      prompts: [
        "平静放松，情绪稳定柔和",
        "温暖治愈，带有轻微的微笑感",
        "兴奋期待，逐步提升情绪张力",
        "庄重肃穆，带有历史感",
        "坚定有力，传达鼓励和行动感",
      ],
    },
    {
      id: "rhythm",
      label: "语速停顿",
      description: "调整朗读速度、重音和停顿",
      prompts: [
        "语速稍慢，句子之间留出自然停顿",
        "节奏明快，重点信息清晰突出",
        "关键句前短暂停顿，增强叙事张力",
        "像自然对话一样，避免机械均匀的节奏",
      ],
    },
  ],
  music: [
    {
      id: "examples",
      label: "灵感示例",
      description: "可以直接使用的完整描述",
      prompts: [
        "轻快的 City Pop，夏日傍晚，女声主唱，带复古合成器",
        "史诗管弦乐，适合奇幻冒险预告片，鼓点逐渐增强",
        "Lo-fi hip hop，雨天书桌氛围，温暖钢琴采样",
        "电子舞曲，128 BPM，明亮主旋律，适合夜跑",
        "原声民谣，木吉他和轻柔人声，关于远行与重逢",
        "赛博朋克氛围音乐，低沉贝斯，冷色合成器铺底",
        "纯音乐钢琴曲，安静、治愈、适合深夜思考",
        "流行摇滚，副歌有记忆点，情绪从压抑走向释放",
      ],
    },
    {
      id: "genre",
      label: "曲风",
      description: "确定音乐风格和时代感",
      prompts: [
        "轻快复古的 City Pop，明亮而有律动",
        "氛围感 Lo-fi hip hop，松弛温暖",
        "电影感史诗管弦乐，宏大而充满冒险感",
        "未来感 Synthwave，复古合成器与电子鼓",
        "清新原声民谣，自然真挚，适合公路旅行",
      ],
    },
    {
      id: "mood",
      label: "情绪",
      description: "控制音乐带来的情绪感受",
      prompts: [
        "明亮愉快，像夏日午后的微风",
        "温暖治愈，适合安静独处",
        "浪漫梦幻，带有轻微的忧伤",
        "紧张悬疑，逐步积累不安感",
        "热血激昂，鼓舞人心，推动情绪向上",
      ],
    },
    {
      id: "arrangement",
      label: "乐器编曲",
      description: "组合主要乐器和制作质感",
      prompts: [
        "温暖钢琴、木吉他与柔和弦乐铺底",
        "复古合成器、电子鼓和有弹性的贝斯线",
        "完整管弦乐编制，弦乐逐层叠加",
        "爵士鼓、低音提琴和慵懒电钢琴",
      ],
    },
    {
      id: "vocal",
      label: "人声",
      description: "指定人声类型和演唱方式",
      prompts: [
        "温柔细腻的女声主唱，气声丰富",
        "低沉有磁性的男声，情绪克制",
        "清澈空灵的女声，带有梦幻和声",
        "多人合唱，副歌逐渐扩大声场",
        "纯音乐，无人声，突出器乐层次",
      ],
    },
    {
      id: "tempo",
      label: "节奏 BPM",
      description: "控制速度和律动强弱",
      prompts: [
        "慢速 70 BPM，适合深夜和冥想",
        "中速 95 BPM，松弛而有律动",
        "轻快 115 BPM，适合日常通勤",
        "舞曲 128 BPM，鼓点稳定有推动力",
      ],
    },
  ],
};

export const SUGGESTED_PROMPTS_BY_TYPE: Record<MediaTaskType, string[]> = {
  image: QUICK_PROMPT_LIBRARY.image[0].prompts,
  video: QUICK_PROMPT_LIBRARY.video[0].prompts,
  speech: QUICK_PROMPT_LIBRARY.speech[0].prompts,
  music: QUICK_PROMPT_LIBRARY.music[0].prompts,
};
