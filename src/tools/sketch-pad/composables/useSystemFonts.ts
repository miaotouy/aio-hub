import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";

const systemFonts = ref<string[]>([]);
const isLoaded = ref(false);

export function useSystemFonts() {
  async function loadSystemFonts() {
    if (isLoaded.value) return systemFonts.value;
    try {
      systemFonts.value = await invoke<string[]>("get_system_fonts");
    } catch (e) {
      console.error("Failed to load system fonts:", e);
      systemFonts.value = [];
    }
    isLoaded.value = true;
    return systemFonts.value;
  }

  return {
    systemFonts,
    isLoaded,
    loadSystemFonts,
  };
}
