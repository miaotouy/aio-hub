import { describe, expect, it, vi } from "vitest";
import { MacroProcessor } from "../../MacroProcessor";
import { createMacroContext } from "../../MacroContext";
import { getMacroRegistry } from "../../MacroRegistry";
import {
  calculateEffectiveTime,
  freezeDatetimeDisplay,
  registerDateTimeMacros,
} from "../datetime";
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Protect displayed window boundaries and virtual-time ordering without changing request time.
describe("preset datetime display windows", () => {
  it.each([5, 10, 30, 60])(
    "freezes all date/time macros within a %i minute window",
    async (minutes) => {
      const registry = getMacroRegistry();
      registerDateTimeMacros(registry);
      const processor = new MacroProcessor(registry);
      const windowMs = minutes * 60_000;
      const start =
        Math.floor(new Date("2026-11-01T12:00:00+08:00").getTime() / windowMs) *
        windowMs;
      const expand = async (timestamp: number) => {
        const ctx = createMacroContext({ timestamp });
        freezeDatetimeDisplay(ctx, minutes);
        const result = await processor.process("{{datetime}} / {{time}}", ctx, {
          silent: true,
        });
        expect(ctx.timestamp).toBe(timestamp);
        return result.output;
      };
      expect(await expand(start + 1)).toBe(await expand(start + windowMs - 1));
      expect(await expand(start)).not.toBe(await expand(start + windowMs));
    }
  );
  it("aligns the converted virtual time while retaining the real timestamp", () => {
    const real = Date.parse("2026-11-01T04:07:00Z");
    const ctx = createMacroContext({
      timestamp: real,
      agent: {
        virtualTimeConfig: {
          virtualBaseTime: "2030-01-01T00:03:00Z",
          realBaseTime: "2026-11-01T04:00:00Z",
          timeScale: 2,
        },
      } as any,
    });
    const effective = calculateEffectiveTime(ctx).getTime();
    expect(effective).toBe(Date.parse("2030-01-01T00:17:00Z"));
    freezeDatetimeDisplay(ctx, 10);
    expect(calculateEffectiveTime(ctx).toISOString()).toBe(
      "2030-01-01T00:10:00.000Z"
    );
    expect(ctx.timestamp).toBe(real);
  });
  it("keeps realtime precision by default, including epoch timestamp zero", () => {
    expect(
      calculateEffectiveTime(createMacroContext({ timestamp: 0 })).getTime()
    ).toBe(0);
    expect(
      calculateEffectiveTime(
        createMacroContext({ timestamp: 123456 })
      ).getTime()
    ).toBe(123456);
  });
});
