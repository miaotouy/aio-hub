import type { ContextProcessor } from "../../pipeline/types";
import { injectionAssembler } from "./injection-assembler";
import { regexProcessor } from "./regex-processor";
import { sessionLoader } from "./session-loader";
import { tokenLimiter } from "./token-limiter";

export const primaryProcessors: ContextProcessor[] = [
  sessionLoader,
  regexProcessor,
  tokenLimiter,
  injectionAssembler,
];
