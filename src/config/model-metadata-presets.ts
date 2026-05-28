/**
 * 模型元数据预设规则 (纯数据)
 *
 * 此文件作为聚合入口，从子模块目录重导出所有规则。
 * 详细规则定义请查看 ./model-metadata-presets/ 目录下的各分类文件。
 */
export {
  DEFAULT_METADATA_RULES,
  capabilityRules,
  providerRules,
  openaiModelRules,
  anthropicModelRules,
  googleModelRules,
  deepseekModelRules,
  qwenModelRules,
  chineseModelRules,
  internationalModelRules,
  specificModelRules,
  mediaGenParamsRules,
  imageInputLimitRules,
} from "./model-metadata-presets/index";
