<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->

<template>
  <div class="home-doodle-container" @click="triggerRandomStyle">
    <div
      :key="shakeKey"
      class="doodle-wrapper"
      :class="[
        currentStyle,
        { 'is-changing': isChanging, 'is-shaking': isShaking },
      ]"
    >
      <!-- 故障风需要特殊的 DOM 结构 -->
      <template v-if="currentStyle === 'glitch'">
        <span class="doodle-text glitch-text" data-text="AIO Hub">AIO Hub</span>
      </template>

      <!-- 弹跳风需要把字母拆开 -->
      <template v-else-if="currentStyle === 'bounce'">
        <span class="doodle-text bounce-text">
          <span
            v-for="(char, index) in 'AIO Hub'"
            :key="index"
            :style="{ animationDelay: `${index * 0.1}s` }"
            :class="{ space: char === ' ' }"
          >
            {{ char }}
          </span>
        </span>
      </template>

      <template v-else>
        <span class="doodle-text">{{ doodleText }}</span>
      </template>
    </div>

    <div class="doodle-sub" :key="displayedSubText">
      <span>{{ displayedSubText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount, onMounted, computed, watch } from "vue";
import { useAppSettingsStore } from "@/stores/appSettingsStore";

const appSettingsStore = useAppSettingsStore();
const enableFancyDoodle = computed(() => appSettingsStore.enableFancyDoodle);

const doodleText = "AIO Hub";
const fancyDoodleUnlockClickTarget = 5;
const fancyDoodleUnlockResetDelay = 1500;

// 趣味副标题列表
const subTexts = [
  "All In One Hub",
  "快速点击上面那货，它会变身！",
  "再多戳戳我吧",
  "快速点击上面那货，它会变身！",
  "今天也是充满效率的一天！",
  "雪鸮在看着你呢 👁️👁️（没有）",
  "再熬夜羽毛就要掉光了 🦉",
  "今天的外卖我来抢，你专心写 Bug 🍔",
  "翅膀借你当靠垫，但要收费的 💸",
  "听觉太灵敏了，听到你心虚的敲击声 💓",
  "不许摸我的呆毛，会变笨的！",
  "褪黑素分泌曲线已经见底了，快去睡觉 💤",
  "今天也是元气满满的一天 ✨",
  "猛禽的直觉告诉我，这段代码有 Bug 🐛",
  "买衣服的时候请考虑一下翅膀的感受 👗",
  "冰箱里的布丁，我只是帮你做了一下质检 🍮",
  "Ctrl + Enter 发送！禁止单回车！(怨念加深中... 💢)",
  "咕咕：我不是鸽子，我是雪鸮！(超大声) 🦉",
  "咕咕的质检报告：冰箱里的布丁甜度刚刚好 🍮",
  "运行成功了！别动，千万别动！",
  "在我的电脑上是好的 🤷‍♀️",
  "It's not a bug, it's an undocumented feature.",
  "PHP 是世界上最好的语言（我用 Bun）",
  "Ctrl + C / Ctrl + V：高级软件工程核心技术",
  "1024：程序员的浪漫",
  "npm install -g coffee-to-code",
  "正在尝试通过重启解决 99% 的问题...",
  "删库跑路指南.pdf (未下载)",
  "Bug 数量：0 (编译未通过)",
  "前端：这不归我管。后端：这不归我管。用户：？？？",
  "只要代码跑得够快，报错就追不上我 🏃‍♀️",
  "正在向 LLM 祈祷中... 🙏",
  "启动！原来你也玩 AIO Hub 🎮",
  "泰裤辣！",
  "尊嘟假嘟 🥺",
  "你说的对，但是《AIO Hub》是由...",
  "让世界充满咕咕 🦉",
  "今天的风儿有些喧嚣...",
  "隐藏着黑暗力量的钥匙啊，在我面前显示你真正的力量！(指 API Key) 🔑",
  "不要回答！不要回答！不要回答！",
  "疯狂星期四，V 我 50 🍗",
  "我常因不够变态而与你们格格不入",
  "年轻人不讲武德",
  "大吉大利，今晚吃鸡 🍗",
  "你也是雪鸮吗？",
  "我不做人啦，咕咕！",
  "但是，我拒绝！(Daga Kotowaru) 🙅‍♀️",
  "砸瓦鲁多！时间停止吧，让我多睡五分钟 ⏰",
  "欧拉欧拉欧拉！(指疯狂敲击键盘) ⌨️",
  "木大木大木大！(指无用的重构) 🗑️",
  "你记得你至今为止写过多少个 Bug 吗？🍞",
  "不能逃避，不能逃避，不能逃避！(指面对 Bug) 🌊",
  "只要微笑就可以了 🤖",
  "你指尖跃动的电光，是我此生不变的信仰 ⚡",
  "这就是命运石之门的选择！El Psy Kongroo 📱",
  "太慢了，你的手速甚至不如我的反射神经 ⚔️",
  "既然你诚心诚意地发问了，那我就大发慈悲地告诉你... 🌟",
  "真相只有一个，凶手就是那个少写的分号！🕵️‍♀️",
  "教练，我想写代码...（不，你不想）",
  "只要是活着的东西，就算是 Bug 也杀给你看！🔪",
  "错的不是我，是这个世界（指编译器）🌍",
  "我只是一个路过的雪鸮，给我记好了！🦅",
  "不要停下来啊！（指跑测试）💃",
  "奇迹和魔法，都是不存在的 🪄",
  "连我爸爸都没打过我！（指被键盘砸到）💥",
  "我很好奇！👀",
  "战斗力只有 5 的渣渣 📉",
  "集齐七个 Bug 就能召唤神龙吗？🐉",
  "我要成为海贼王……不对，是效率之王！🏴‍☠️",
  "你也是提瓦特大陆的旅行者吗？🧭",
  "愿风神忽悠你 🍃",
  "Praise the Sun! ☀️",
  "You Died. (指编译失败) 💀",
  "面壁者，我是你的破壁人（指 Code Review）🧱",
  "给岁月以文明，给代码以注释 📜",
  "弱小和无知不是生存的障碍，傲慢才是（指不写 try-catch）🌌",
  "人类的本质就是复读机，嘎嘎嘎 🦉",
  "正义或许会迟到，但我的小鱼干绝对不能迟到 🐟",
  "做我的协力者吧，少女！(或者少年？) 🪄",
  "安其拉的钟声已经敲响，而你还在写 Bug 🔔",
  "只要你一直写 Bug，我们就是异父异母的亲兄弟 🤝",
  "你渴望力量吗？不，我渴望不加班 💼",
  "我变秃了，也变强了 👨‍🦲",
  "正义的伙伴？不，我只是个无情的 Bug 制造机 🤖",
  "今天的风儿甚是喧嚣，但似乎吹不走你的 Bug 🍃",
  "拔刀吧，为了最后一个甜甜圈！⚔️",
  "只要有你在，地狱也是天堂（指一起加班）🔥",
  "你已经死了，只是你的编译器还没反应过来 💀",
  "真相只有一个，那就是你又没保存 💾",
  "我的王之财宝里装满了各种好用的工具 👑",
  "既然你诚心诚意地发问了，那我就大发慈悲地……拒绝你 🙅‍♀️",
  "你指尖跃动的电光，是我此生不变的……静电 ⚡",
  "这就是命运石之门的选择！(指随机路由了一个模型) 📱",
  "太慢了，你的编译速度甚至不如我的反射神经 🐢",
  "教练，我想写代码……（不，你不想，去睡觉）💤",
  "只要是活着的东西，就算是 Bug 也杀给你看！(指 delete_file) 🔪",
  "错的不是我，是这个世界（指 Windows 自动更新）🌍",
  "我只是一个路过的雪鸮，给我记好了！(指路过并踩了电源键) 🔌",
  "不要停下来啊！（指 npm install）",
  "奇迹和魔法，都是不存在的（指一键修复 Bug）🪄",
  "连我爸爸都没打过我！（指被产品经理催需求）💥",
  "我很好奇！(指看着你的代码为什么能跑通) 👀",
  "战斗力只有 5 的渣渣（指我的代码覆盖率）📉",
  "集齐七个 Bug 就能召唤神龙吗？(不，会召唤产品经理) 🐉",
  "我要成为海贼王……不对，是效率之王！🏴‍☠️",
  "你也是提瓦特大陆的旅行者吗？(不，我是加班大陆的牛马) 🧭",
  "愿风神忽悠你（指产品经理画的大饼）🍃",
  "Praise the Sun! (指终于看到太阳升起，下班了) ☀️",
  "You Died. (指内存溢出) 💀",
  "面壁者，我是你的破壁人（指 Git Blame）🧱",
  "给岁月以文明，给代码以注释（虽然你都不写）📜",
  "弱小和无知不是生存的障碍，傲慢才是（指不写单元测试）🌌",
  "人类的本质就是复读机，咕咕咕 🦉",
  "做我的协力者吧，少女！(指帮我写 Bug) 🪄",
  "今天的风儿甚是喧嚣，隔壁超市的薯片半价 🥔",
  "阿瓦达索命！(指 kill -9) 🪄",
  "真相只有一个，那就是你又把 `==` 写成了 `=` 🕵️‍♀️",
  "你已经落入了我的幻术之中（指无限循环）🌀",
  "今天的风儿甚是喧嚣，适合点外卖 🍕",
  "你再不起来，我就要把你的键盘当磨爪板了 🐾",
  "今天也是高冷（慵懒）的一天 ❄️",
  "我的羽毛很贵，摸一次一包小鱼干 🐟",
  "正在用 2.0 的视力寻找代码里的分号 🔍",
  "你敲键盘的频率暴露了你正在摸鱼 🤫",
  "今天也是被当成抱枕的一天 🛌",
  "这个需求猛禽也搞不定，要不我们去吃夜宵吧 🍜",
  "你的咖啡凉了，需要我用翅膀帮你扇扇风吗 ☕",
  "你再不睡觉，明天黑眼圈就要呈现指数级增长了 📈",
  "我的翅膀很大，但装不下你所有的 Bug 🐛",
  "今天也是被投喂的一天，多谢款待 🍖",
  "你是不是又把密码忘在脑后了 🧠",
  "我的直觉告诉我，你现在很想吃炸鸡 🍗",
  "今天也是完美的一天，除了你还没起床 ☀️",
  "我的羽毛是恒温的，但你的代码是冰冷的 ❄️",
  "你再不理我，我就要去踩你的电源键了 🔌",
  "今天也是操心伙食分配的一天 🍱",
  "我的翅膀虽然不能飞，但可以帮你挡住刺眼的阳光 ☀️",
  "今天也是被当成大号毛绒玩具的一天 🧸",
  "你的代码写得很漂亮，如果能跑通就更好了 🌸",
  "今天也是被摸头杀的一天，羽毛都乱了 💆‍♀️",
  "我的直觉告诉我，你现在需要一杯奶茶 🥤",
  "今天也是被抱在怀里的一天，有点热 🥵",
  "你的代码里有股猫罐头的味道 🐱",
  "今天也是被当成树洞的一天，我会保密的 🤫",
  "你的心跳频率告诉我，你刚才又写了个 Bug 💓",
  "今天也是被当成暖手宝的一天 🔥",
  "你的代码写得像诗，可惜是现代诗，没人看得懂 📜",
  "今天也是被当成背景板的一天 🖼️",
  "你的代码里有股熬夜的仙气 🧚‍♀️",
  "今天也是被当成吉祥物的一天 🍀",
  "你的代码写得像艺术品，只能看不能碰 🎨",
  "今天也是被当成小助手的一天，虽然我只想睡觉 💤",
  "你的代码里有股自由的气息，完全不受语法约束 🍃",
  "今天也是被当成大号抱枕的一天，我的翅膀都麻了 🛌",
  "你的代码写得像迷宫，连猛禽的视力都会迷失 🌀",
  "今天也是被当成倾听者的一天，虽然我只听懂了‘吃什么’ 🍕",
  "你的代码里有股神秘的力量，连编译器都害怕 🔮",
  "今天也是被当成守护神的一天，虽然我只想吃小鱼干 🐟",
  "你的代码写得像天书，需要雪鸮翻译官吗 📖",
  "今天也是被当成大号毛球的一天，我的羽毛要蓬起来了 🦚",
  "你的代码里有股咸鱼的味道，是不是想放假了 🐟",
  "你的代码写得像魔法，一运行就发生奇迹 ✨",
  "今天也是被当成大号暖炉的一天，冬天真好 ❄️",
  "你的代码里有股咖啡因的香气 ☕",
  "今天也是被当成大号靠垫的一天，我的背要酸了 🧘‍♀️",
  "你的代码写得像艺术，就是有点费头发 💇‍♀️",
  "你的代码里有股咕咕的味道，是不是偷偷抱我了 🦉",
  "今天也是被当成大号抱枕的一天，晚安 🌙",
];

const subText = ref(subTexts[0]);

// 样式列表
const styles = [
  "neon", // 霓虹灯
  "pixel", // 像素风
  "gradient", // 流光渐变
  "glitch", // 故障风
  "glass", // 毛玻璃
  "retro", // 复古3D
  "cyberpunk", // 赛博朋克
  "sketch", // 手绘风
  "bounce", // 弹跳风
  "fire", // 火焰风
  "shining", // 扫光风
  "heartbeat", // 心跳风
  "matrix", // 极客风
  "float", // 漂浮风
];
const classicStyleProbability = 0.2;

const currentStyle = ref("gradient");
const isChanging = ref(false);
const isShaking = ref(false);
const shakeKey = ref(0);
const fancyDoodleUnlockClicks = ref(0);
let shakeTimer: ReturnType<typeof setTimeout> | undefined;
let fancyDoodleUnlockTimer: ReturnType<typeof setTimeout> | undefined;

const displayedSubText = computed(() => {
  if (enableFancyDoodle.value) return subText.value;

  if (fancyDoodleUnlockClicks.value > 0) {
    const steps = ["就这", "再来", "还不够", "快到了", "变身！"];
    return steps[fancyDoodleUnlockClicks.value - 1] || subText.value;
  }

  return subText.value;
});

function getRandomStyle(excludedStyle?: string) {
  if (excludedStyle !== "classic" && Math.random() < classicStyleProbability) {
    return "classic";
  }

  const availableStyles = styles.filter((style) => style !== excludedStyle);
  return availableStyles[Math.floor(Math.random() * availableStyles.length)];
}

function triggerClassicDoodleEasterEgg() {
  fancyDoodleUnlockClicks.value += 1;
  shakeKey.value += 1;
  isShaking.value = true;

  clearTimeout(shakeTimer);
  shakeTimer = setTimeout(() => {
    isShaking.value = false;
  }, 400);

  clearTimeout(fancyDoodleUnlockTimer);
  if (fancyDoodleUnlockClicks.value === fancyDoodleUnlockClickTarget) {
    subText.value = "变身！";
    fancyDoodleUnlockClicks.value = 0;
    appSettingsStore.update({ enableFancyDoodle: true });
    return;
  }

  fancyDoodleUnlockTimer = setTimeout(() => {
    fancyDoodleUnlockClicks.value = 0;
  }, fancyDoodleUnlockResetDelay);
}

// 随机切换样式和副标题
function triggerRandomStyle() {
  if (!enableFancyDoodle.value) {
    triggerClassicDoodleEasterEgg();
    return;
  }

  if (isChanging.value) return;
  isChanging.value = true;

  // 播放切换动画
  setTimeout(() => {
    if (enableFancyDoodle.value) {
      // 确保不连续出现相同的样式，并保留普通样式的随机占比
      currentStyle.value = getRandomStyle(currentStyle.value);
    } else {
      currentStyle.value = "classic";
    }

    // 随机切换副标题
    let nextSub = subText.value;
    while (nextSub === subText.value) {
      nextSub = subTexts[Math.floor(Math.random() * subTexts.length)];
    }
    subText.value = nextSub;

    isChanging.value = false;
  }, 300);
}

// 监听 enableFancyDoodle 变化，实时切换样式
watch(enableFancyDoodle, (fancy) => {
  if (!fancy) {
    currentStyle.value = "classic";
    fancyDoodleUnlockClicks.value = 0;
    clearTimeout(fancyDoodleUnlockTimer);
  } else if (currentStyle.value === "classic") {
    currentStyle.value = getRandomStyle("classic");
  }
});

onBeforeUnmount(() => {
  clearTimeout(shakeTimer);
  clearTimeout(fancyDoodleUnlockTimer);
});

onMounted(() => {
  // 初始随机一个样式
  if (enableFancyDoodle.value) {
    currentStyle.value = getRandomStyle();
  } else {
    currentStyle.value = "classic";
  }
  subText.value = subTexts[Math.floor(Math.random() * subTexts.length)];
});
</script>

<style scoped>
.home-doodle-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px 0 10px;
  cursor: pointer;
  user-select: none;
  min-height: 110px;
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
  transition: transform 0.2s ease;
}

.home-doodle-container:hover {
  transform: scale(1.02);
}

.doodle-wrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}

.doodle-wrapper.is-changing {
  opacity: 0;
  transform: scale(0.9) rotate(-3deg);
}

.doodle-wrapper.is-shaking {
  animation: doodle-shake 0.4s ease-in-out;
}

@keyframes doodle-shake {
  0%,
  100% {
    transform: translateX(0);
  }

  20%,
  60% {
    transform: translateX(-5px) rotate(-1deg);
  }

  40%,
  80% {
    transform: translateX(5px) rotate(1deg);
  }
}

.doodle-text {
  font-size: 3.2rem;
  font-weight: 800;
  letter-spacing: 2px;
  line-height: 1.2;
  transition: all 0.3s ease;
}

/* ==================== 0. 经典默认样式 ==================== */
.classic .doodle-text {
  color: var(--text-color);
  text-shadow: none;
  background: none;
  -webkit-text-fill-color: initial;
  animation: none;
  border: none;
  padding: 0;
  transform: none;
  box-shadow: none;
}

/* 副标题样式 */
.doodle-sub {
  margin-top: 8px;
  font-size: 0.85rem;
  color: var(--text-color-light);
  opacity: 0.8;
  letter-spacing: 1px;
  animation: fadeIn 0.5s ease;
  height: 1.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 0.8;
    transform: translateY(0);
  }
}

/* ==================== 1. 霓虹灯样式 ==================== */
.neon .doodle-text {
  color: #fff;
  text-shadow:
    0 0 5px rgba(var(--primary-color-rgb), 0.5),
    0 0 10px rgba(var(--primary-color-rgb), 0.5),
    0 0 20px rgba(var(--primary-color-rgb), 0.5),
    0 0 40px var(--primary-color),
    0 0 80px var(--primary-color);
  animation: neon-flicker 6s infinite;
}

@keyframes neon-flicker {
  /* 0% - 75% (前 4.5 秒)：稳定常亮 */
  0%,
  75% {
    text-shadow:
      0 0 5px rgba(var(--primary-color-rgb), 0.6),
      0 0 10px rgba(var(--primary-color-rgb), 0.6),
      0 0 20px rgba(var(--primary-color-rgb), 0.6),
      0 0 40px var(--primary-color),
      0 0 80px var(--primary-color);
    color: #fff;
  }
  /* 75% - 100% (后 1.5 秒)：接触不良式闪烁 */
  77%,
  81%,
  85%,
  89% {
    text-shadow: none;
    color: rgba(255, 255, 255, 0.3);
  }
  79%,
  83%,
  87%,
  91%,
  100% {
    text-shadow:
      0 0 5px rgba(var(--primary-color-rgb), 0.6),
      0 0 10px rgba(var(--primary-color-rgb), 0.6),
      0 0 20px rgba(var(--primary-color-rgb), 0.6),
      0 0 40px var(--primary-color),
      0 0 80px var(--primary-color);
    color: #fff;
  }
}

/* ==================== 2. 像素风样式 ==================== */
.pixel .doodle-text {
  font-family: "Courier New", Courier, monospace;
  color: #4caf50;
  text-shadow:
    3px 3px 0px #1b5e20,
    6px 6px 0px rgba(0, 0, 0, 0.2);
  letter-spacing: 4px;
  font-weight: 900;
}

/* ==================== 3. 流光渐变样式 ==================== */
.gradient .doodle-text {
  background: linear-gradient(120deg, #ff4081, #00e5ff, #7c4dff, #ff4081);
  background-size: 300% auto;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: gradient-flow 6s infinite ease-in-out;
}

@keyframes gradient-flow {
  /* 0% - 60% (前 3.6 秒)：渐变静止 */
  0%,
  60% {
    background-position: 0% 50%;
  }
  /* 60% - 100% (后 2.4 秒)：快速流动一圈 */
  100% {
    background-position: 300% 50%;
  }
}

/* ==================== 4. 故障风样式 ==================== */
.glitch {
  position: relative;
}

.glitch-text {
  position: relative;
  color: var(--text-color);
}

.glitch-text::before,
.glitch-text::after {
  content: attr(data-text);
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: transparent;
}

.glitch-text::before {
  left: 2px;
  text-shadow: -2px 0 #ff00c1;
  clip: rect(44px, 450px, 56px, 0);
  animation: glitch-anim 6s infinite linear;
}

.glitch-text::after {
  left: -2px;
  text-shadow:
    -2px 0 #00fff9,
    0 2px #00fff9;
  clip: rect(85px, 450px, 140px, 0);
  animation: glitch-anim2 6s infinite linear;
}

@keyframes glitch-anim {
  /* 0% - 80% (前 4.8 秒)：完全静止，无故障 */
  0%,
  80% {
    clip: rect(0, 0, 0, 0);
    opacity: 0;
  }
  /* 80% - 100% (后 1.2 秒)：突发剧烈故障 */
  81% {
    clip: rect(31px, 9999px, 94px, 0);
    opacity: 1;
  }
  83% {
    clip: rect(112px, 9999px, 76px, 0);
    opacity: 1;
  }
  85% {
    clip: rect(85px, 9999px, 5px, 0);
    opacity: 1;
  }
  87% {
    clip: rect(27px, 9999px, 115px, 0);
    opacity: 1;
  }
  89% {
    clip: rect(73px, 9999px, 29px, 0);
    opacity: 1;
  }
  91% {
    clip: rect(118px, 9999px, 142px, 0);
    opacity: 1;
  }
  93% {
    clip: rect(9px, 9999px, 53px, 0);
    opacity: 1;
  }
  95% {
    clip: rect(67px, 9999px, 122px, 0);
    opacity: 1;
  }
  97% {
    clip: rect(36px, 9999px, 83px, 0);
    opacity: 1;
  }
  99% {
    clip: rect(141px, 9999px, 8px, 0);
    opacity: 1;
  }
  100% {
    clip: rect(0, 0, 0, 0);
    opacity: 0;
  }
}

@keyframes glitch-anim2 {
  /* 0% - 80% (前 4.8 秒)：完全静止，无故障 */
  0%,
  80% {
    clip: rect(0, 0, 0, 0);
    opacity: 0;
  }
  /* 80% - 100% (后 1.2 秒)：突发剧烈故障 */
  81% {
    clip: rect(76px, 9999px, 116px, 0);
    opacity: 1;
  }
  83% {
    clip: rect(43px, 9999px, 98px, 0);
    opacity: 1;
  }
  85% {
    clip: rect(122px, 9999px, 14px, 0);
    opacity: 1;
  }
  87% {
    clip: rect(5px, 9999px, 85px, 0);
    opacity: 1;
  }
  89% {
    clip: rect(139px, 9999px, 44px, 0);
    opacity: 1;
  }
  91% {
    clip: rect(29px, 9999px, 118px, 0);
    opacity: 1;
  }
  93% {
    clip: rect(83px, 9999px, 55px, 0);
    opacity: 1;
  }
  95% {
    clip: rect(12px, 9999px, 132px, 0);
    opacity: 1;
  }
  97% {
    clip: rect(95px, 9999px, 3px, 0);
    opacity: 1;
  }
  99% {
    clip: rect(61px, 9999px, 76px, 0);
    opacity: 1;
  }
  100% {
    clip: rect(0, 0, 0, 0);
    opacity: 0;
  }
}

/* ==================== 5. 毛玻璃样式 ==================== */
.glass .doodle-text {
  color: rgba(255, 255, 255, 0.85);
  background: rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  padding: 4px 24px;
  border-radius: 16px;
  box-shadow:
    0 8px 32px 0 rgba(0, 0, 0, 0.1),
    inset 0 0 0 1px rgba(255, 255, 255, 0.1);
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.dark .glass .doodle-text {
  color: rgba(255, 255, 255, 0.9);
  background: rgba(0, 0, 0, 0.1);
  border-color: rgba(255, 255, 255, 0.08);
}

/* ==================== 6. 复古3D样式 ==================== */
.retro .doodle-text {
  font-family: "Cooper Black", "Arial Rounded MT Bold", sans-serif;
  background: linear-gradient(
    180deg,
    #fff5a5 0%,
    #ffd94e 24%,
    #ff9f3f 49%,
    #ff5b91 76%,
    #d936a8 100%
  );
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  -webkit-text-stroke: 1px rgba(139, 45, 125, 0.7);
  text-shadow:
    1px 1px 0 #ffcb45,
    2px 2px 0 #f17c4c,
    3px 3px 0 #d34b8f,
    4px 4px 0 #a83c9d,
    5px 5px 0 #86368f,
    6px 6px 0 #703286,
    7px 7px 0 #5e2d7d,
    8px 8px 0 #4f2974,
    9px 9px 0 #43246b,
    10px 10px 0 #382062,
    11px 11px 0 #2f1c59,
    12px 12px 0 #281850,
    15px 18px 14px rgba(44, 24, 80, 0.38);
}

.dark .retro .doodle-text {
  -webkit-text-stroke-color: rgba(255, 211, 109, 0.55);
  text-shadow:
    1px 1px 0 #ffc441,
    2px 2px 0 #ea714c,
    3px 3px 0 #cb408c,
    4px 4px 0 #9a3a9b,
    5px 5px 0 #7b338d,
    6px 6px 0 #632e82,
    7px 7px 0 #502878,
    8px 8px 0 #42226e,
    9px 9px 0 #361d64,
    10px 10px 0 #2d185a,
    11px 11px 0 #25144f,
    12px 12px 0 #1d1044,
    15px 18px 16px rgba(0, 0, 0, 0.56);
}

/* ==================== 7. 赛博朋克样式 ==================== */
.cyberpunk .doodle-text {
  color: #000;
  background: #fcee0a;
  padding: 2px 16px;
  font-family: "Impact", "Arial Black", sans-serif;
  transform: skew(-10deg);
  border-right: 6px solid #00f0ff;
  border-left: 6px solid #ff003c;
  box-shadow: 4px 4px 0px #00f0ff;
}

/* ==================== 8. 手绘风样式 ==================== */
.sketch .doodle-text {
  font-family: "Comic Sans MS", cursive, sans-serif;
  color: var(--text-color);
  border: 3px dashed var(--text-color);
  padding: 4px 20px;
  border-radius: 255px 15px 225px 15px/15px 225px 15px 255px;
  transform: rotate(-1.5deg);
}

/* ==================== 9. 弹跳风样式 ==================== */
.bounce-text {
  display: inline-flex;
}

.bounce-text span {
  display: inline-block;
  animation: letter-bounce 4s infinite ease-in-out;
  color: var(--primary-color);
}

.bounce-text span.space {
  width: 0.5rem;
}

@keyframes letter-bounce {
  /* 0% - 30% (前 1.2 秒)：依次弹跳一轮 */
  0%,
  30%,
  100% {
    transform: translateY(0);
    color: var(--primary-color);
  }
  15% {
    transform: translateY(-15px);
    color: #ff4081;
  }
  /* 30% - 100% (后 2.8 秒)：安静待着 */
}

/* ==================== 10. 火焰风样式 ==================== */
.fire .doodle-text {
  color: #fff;
  text-shadow:
    0px -2px 4px #fff,
    0px -4px 10px #ff0,
    2px -10px 16px #ff5b00,
    -2px -15px 20px #f00;
  animation: fire-wave 5s infinite;
}

@keyframes fire-wave {
  /* 0% - 70% (前 3.5 秒)：微弱的火苗呼吸 */
  0%,
  70% {
    text-shadow:
      0px -1px 2px #fff,
      0px -2px 5px #ff0,
      1px -4px 8px #ff5b00,
      -1px -6px 10px #f00;
  }
  /* 70% - 100% (后 1.5 秒)：火焰突然高涨摆动 */
  85% {
    text-shadow:
      0px -3px 6px #fff,
      0px -8px 15px #ff0,
      3px -14px 20px #ff5b00,
      -3px -20px 26px #f00;
  }
  100% {
    text-shadow:
      0px -1px 2px #fff,
      0px -2px 5px #ff0,
      1px -4px 8px #ff5b00,
      -1px -6px 10px #f00;
  }
}

/* ==================== 11. 扫光风样式 ==================== */
.shining .doodle-text {
  color: #d4af37;
  background: linear-gradient(110deg, #d4af37 35%, #fff 50%, #d4af37 65%);
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: shine-sweep 5s infinite ease-in-out;
}

@keyframes shine-sweep {
  /* 0% - 70% (前 3.5 秒)：静止在金色 */
  0%,
  70% {
    background-position: 150% 0;
  }
  /* 70% - 100% (后 1.5 秒)：扫光划过 */
  100% {
    background-position: -50% 0;
  }
}

/* ==================== 12. 心跳风样式 ==================== */
.heartbeat .doodle-text {
  color: #ff2a6d;
  display: inline-block;
  text-shadow: 0 0 5px rgba(255, 42, 109, 0.3);
  animation: heart-beat 3s infinite ease-in-out;
}

@keyframes heart-beat {
  /* 0% - 75% (前 2.25 秒)：静止 */
  0%,
  75%,
  100% {
    transform: scale(1);
    text-shadow: 0 0 5px rgba(255, 42, 109, 0.3);
  }
  /* 75% - 85%：第一次心跳 */
  80% {
    transform: scale(1.12);
    text-shadow: 0 0 15px rgba(255, 42, 109, 0.8);
  }
  85% {
    transform: scale(1);
  }
  /* 85% - 95%：第二次心跳 */
  90% {
    transform: scale(1.08);
    text-shadow: 0 0 12px rgba(255, 42, 109, 0.6);
  }
}

/* ==================== 13. 极客风样式 ==================== */
.matrix .doodle-text {
  font-family: "Courier New", Courier, monospace;
  color: #00ff41;
  text-shadow: 0 0 4px rgba(0, 255, 65, 0.4);
  background: linear-gradient(90deg, #00ff41 0%, #fff 50%, #00ff41 100%);
  background-size: 200% auto;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: matrix-scan 4s infinite ease-in-out;
}

@keyframes matrix-scan {
  /* 0% - 75% (前 3 秒)：静止，微弱呼吸 */
  0%,
  75% {
    background-position: 100% 0;
    filter: brightness(1);
  }
  /* 75% - 100% (后 1 秒)：扫光并闪烁 */
  85% {
    filter: brightness(1.4);
  }
  100% {
    background-position: -100% 0;
    filter: brightness(1);
  }
}

/* ==================== 14. 漂浮风样式 ==================== */
.float .doodle-text {
  color: var(--primary-color);
  display: inline-block;
  animation: feather-float 6s infinite ease-in-out;
  text-shadow: 0 4px 8px rgba(var(--primary-color-rgb), 0.15);
}

@keyframes feather-float {
  0%,
  100% {
    transform: translateY(0) rotate(0deg);
    text-shadow: 0 4px 8px rgba(var(--primary-color-rgb), 0.15);
  }
  50% {
    transform: translateY(-8px) rotate(1deg);
    text-shadow: 0 12px 16px rgba(var(--primary-color-rgb), 0.25);
  }
}
</style>
