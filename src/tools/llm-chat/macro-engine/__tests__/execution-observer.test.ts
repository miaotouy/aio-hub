import { afterEach, describe, expect, it, vi } from "vitest";
import { MacroProcessor } from "../MacroProcessor";
import { createMacroContext } from "../MacroContext";
import { getMacroRegistry, MacroPhase, MacroType } from "../MacroRegistry";
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));
const registry = getMacroRegistry();
afterEach(() => registry.unregister("capture_probe"));
describe("macro execution observation", () => {
  it("reports each replaced occurrence without re-executing identical macros or altering expansion", async () => {
    const execute = vi.fn(() => "value");
    registry.register({
      name: "capture_probe",
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: "test",
      acceptsArgs: false,
      execute,
    });
    const onExecution = vi.fn();
    const processor = new MacroProcessor(registry);
    const result = await processor.process(
      "{{capture_probe}} / {{capture_probe}}",
      createMacroContext({}),
      { silent: true, onExecution }
    );
    expect(result.output).toBe("value / value");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(onExecution.mock.calls.map((call) => call[0])).toEqual([
      { name: "capture_probe", args: [], output: "value" },
      { name: "capture_probe", args: [], output: "value" },
    ]);
    expect(
      (
        await processor.process("{{capture_probe}}", createMacroContext({}), {
          silent: true,
          onExecution: () => {
            throw new Error("diagnostic failure");
          },
        })
      ).output
    ).toBe("value");
  });
});
