/**
 * core/action-runner.ts - 动作执行引擎
 * 负责解析 SiteRecipe 中的 ActionSteps 并通过 iframeBridge 执行
 */
import { iframeBridge } from "./iframe-bridge";
import type { ActionStep } from "../types";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("web-distillery/action-runner");

export interface StepResult {
  index: number;
  status: "success" | "error" | "skipped";
  duration: number;
  error?: string;
}

export type StepProgressCallback = (index: number, status: "running" | "success" | "error", error?: string) => void;

export class ActionRunner {
  /** 执行单步动作 */
  public async executeStep(step: ActionStep): Promise<void> {
    logger.debug("Executing step", step);

    switch (step.type) {
      case "wait":
        const waitMs = step.value || step.timeout || 1000;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        if (step.selector) {
          // 如果提供了 selector，则等待元素出现
          await iframeBridge.extractDom(step.selector, step.timeout || 10000);
        }
        break;

      case "click":
        await iframeBridge.evalScript(`
          (function() {
            const el = document.querySelector(${JSON.stringify(step.selector)});
            if (el) {
              el.click();
              return true;
            }
            return false;
          })()
        `);
        break;

      case "scroll":
        if (step.selector) {
          await iframeBridge.evalScript(`
            document.querySelector(${JSON.stringify(step.selector)})?.scrollIntoView({ behavior: 'smooth' });
          `);
        } else {
          const distance = step.distance || 500;
          await iframeBridge.evalScript(`
            window.scrollBy({ top: ${distance}, behavior: 'smooth' });
          `);
        }
        break;

      case "input":
        await iframeBridge.evalScript(`
          (function() {
            const el = document.querySelector(${JSON.stringify(step.selector)});
            if (el) {
              el.value = ${JSON.stringify(step.value || "")};
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
            return false;
          })()
        `);
        break;

      case "hover":
        await iframeBridge.evalScript(`
          (function() {
            const el = document.querySelector(${JSON.stringify(step.selector)});
            if (el) {
              const event = new MouseEvent('mouseover', { bubbles: true });
              el.dispatchEvent(event);
              return true;
            }
            return false;
          })()
        `);
        break;

      case "remove":
        await iframeBridge.evalScript(`
          document.querySelector(${JSON.stringify(step.selector)})?.remove();
        `);
        break;

      case "wait-idle":
        // 简单等待一段时间，真闲置检测较复杂，这里先等 2s
        await new Promise((resolve) => setTimeout(resolve, step.timeout || 2000));
        break;

      default:
        logger.warn("Unknown action type", (step as any).type);
    }
  }

  /** 执行整个动作序列 */
  public async runSequence(steps: ActionStep[]): Promise<void> {
    logger.info("Starting sequence", { stepCount: steps.length });
    for (const step of steps) {
      try {
        await this.executeStep(step);
      } catch (e) {
        logger.error("Step execution failed", { step, error: e });
        // 是否继续执行取决于需求，Level 2 建议继续或报错
      }
    }
    logger.info("Sequence completed");
  }

  /** 执行整个动作序列（带逐步进度反馈） */
  public async runSequenceWithProgress(steps: ActionStep[], onProgress: StepProgressCallback): Promise<StepResult[]> {
    const results: StepResult[] = [];

    for (let i = 0; i < steps.length; i++) {
      onProgress(i, "running");
      const startTime = performance.now();

      try {
        await this.executeStep(steps[i]);
        const duration = performance.now() - startTime;
        results.push({ index: i, status: "success", duration });
        onProgress(i, "success");
      } catch (e) {
        const duration = performance.now() - startTime;
        const errorMsg = e instanceof Error ? e.message : String(e);
        results.push({ index: i, status: "error", duration, error: errorMsg });
        onProgress(i, "error", errorMsg);
        // 继续执行后续步骤
      }
    }

    return results;
  }
}

export const actionRunner = new ActionRunner();
