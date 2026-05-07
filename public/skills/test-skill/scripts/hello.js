/**
 * Test Skill — 冒烟测试脚本
 *
 * 接收可选的 --name 参数，返回结构化的 JSON 响应。
 * 用于验证 AIO Skill 系统的脚本执行链路是否正常。
 */

const args = process.argv.slice(2);
const nameIndex = args.indexOf("--name");
const name = nameIndex !== -1 && args[nameIndex + 1] ? args[nameIndex + 1] : "Agent";

const result = {
  success: true,
  message: `你好，${name}！技能脚本执行链路验证通过 ✅`,
  detail: {
    skill: "test-skill",
    script: "hello.js",
    runtime: require("path").basename(process.execPath),
    platform: process.platform,
    nodeVersion: process.version,
    timestamp: new Date().toISOString(),
  },
};

console.log(JSON.stringify(result, null, 2));