import type { PresetComposition } from "./index";

/** Editor-only snapshots bracketing one structural operation. */
export interface PresetStructureEdit {
  before: PresetComposition;
  after: PresetComposition;
}

/** Restore structure while retaining the latest body/name edits on surviving IDs. */
export function undoPresetStructureEdit(
  current: PresetComposition,
  edit: PresetStructureEdit
): PresetComposition {
  const restored: PresetComposition = JSON.parse(JSON.stringify(edit.before));
  const currentParts = new Map(current.parts.map((part) => [part.id, part]));
  for (const part of restored.parts) {
    const latest = currentParts.get(part.id);
    // Deleted parts/options retain the content captured immediately before deletion.
    if (!latest) continue;
    part.name = latest.name;
    const options = new Map(
      latest.options.map((option) => [option.id, option])
    );
    for (const option of part.options) {
      const value = options.get(option.id);
      if (value) {
        option.name = value.name;
        option.content = value.content;
      }
    }
  }
  return restored;
}
